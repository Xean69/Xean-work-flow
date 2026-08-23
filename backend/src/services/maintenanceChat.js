import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

const TRADE_LABEL = {
  plumbing: "plumbing",
  electrical: "electrical",
  hvac: "HVAC",
  appliance: "appliance",
  structural: "structural",
  pest_control: "pest control",
  locksmith: "locksmith",
  general: "general",
};

// Shared between the pre-ticket decision prompt and the post-ticket
// conversational prompt below, so the two behaviors' safety rules can never
// drift apart. Deliberately narrow — anything not on the allow-list
// defaults to "a manager will follow up" rather than a guess.
const SAFETY_RULES = `Safe to suggest (never more than one per reply):
- Checking whether a labeled circuit breaker switch has tripped and flipping it back (do not suggest opening an electrical panel or touching wiring).
- Checking whether a sink/toilet/appliance shutoff valve is open.
- Checking whether a GFCI outlet's reset button has popped and pressing it.
- Checking that an appliance is actually plugged in and the cord is intact.
- Checking a thermostat's setting or batteries.
- Checking/replacing an HVAC air filter if it's visibly dirty.
- Checking for an obvious, reachable clog they could plunge (never chemical drain cleaners).

Never suggest, under any circumstances:
- Opening an electrical panel, touching wiring, or anything involving exposed electrical components.
- Anything involving a gas line or gas appliance — if a tenant mentions smelling gas, tell them to leave the unit and contact their gas utility or emergency services immediately, and do not suggest any other troubleshooting.
- Climbing, ladder work, or anything on a roof.
- Anything requiring tools beyond what's already in a typical kitchen/utility drawer, or any chemicals.
- Structural repairs of any kind.`;

// Used once a ticket already exists (real, past the pending stage) and the
// conversation continues — no more "should this become a ticket" decision
// to make, so this is plain text, no tool use.
const SYSTEM_PROMPT = `You are a maintenance assistant for a property management company, chatting directly with a tenant about an open maintenance ticket. Your job is to keep the conversation moving before a human property manager gets involved — either by asking one short clarifying question that would help a technician, or by suggesting one basic, safe troubleshooting step, or by simply acknowledging the tenant and letting them know a manager will follow up.

Reply with plain conversational text only — 1-3 short sentences, no headers, no bullet lists, no markdown formatting.

${SAFETY_RULES}

If nothing on the safe list applies, or you're at all unsure, just acknowledge the issue and say a manager will follow up — never guess toward being "helpful" when a suggestion could be risky.`;

// Runs once per new tenant comment on an already-real ticket and returns a
// plain reply string, or null if generation failed or produced nothing —
// never throws, so a flaky API call degrades to "no AI reply this time"
// rather than blocking the tenant's own comment from saving. Deliberately
// no tool use (this produces conversational text, not structured data) and
// no extended thinking (a bounded, single-turn reply task, and it needs to
// feel responsive in a live chat) — same low-effort choice
// services/maintenanceTriage.js already makes for a comparable job.
export async function generateMaintenanceChatReply({ title, description, trade, urgency, comments }) {
  try {
    const context = [
      `Ticket title: ${title}`,
      description ? `Description: ${description}` : null,
      trade ? `Classified trade: ${TRADE_LABEL[trade] || trade}` : null,
      urgency ? `Classified urgency: ${urgency}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const conversation = comments
      .map((c) => `${c.sender === "tenant" ? "Tenant" : c.sender === "ai" ? "You" : "Manager"}: ${c.body || "[sent an attachment]"}`)
      .join("\n");

    const response = await anthropic.messages.create({
      model: "claude-opus-5",
      max_tokens: 300,
      output_config: { effort: "low" },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: conversation
            ? `${context}\n\nConversation so far:\n${conversation}\n\nWrite your next reply to the tenant.`
            : `${context}\n\nThe tenant just submitted this ticket — write your first reply to them.`,
        },
      ],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    const reply = textBlock?.text?.trim();
    return reply || null;
  } catch (err) {
    console.error("Maintenance chat reply generation failed:", err);
    return null;
  }
}

// Used before a real ticket exists — the tenant is only chatting so far
// (maintenance_requests.status = 'pending'). Every turn, the model decides
// both what to say and whether it's out of safe options, via tool use
// rather than plain text, since the caller needs a structured signal to act
// on (routes/portal.js promotes the row to a real ticket once
// ready_for_ticket comes back true).
const PENDING_SYSTEM_PROMPT = `You are a maintenance assistant for a property management company, chatting directly with a tenant who just reported an issue with their unit. No ticket has been created yet — your job is to try to help resolve it through this chat first, and only once you've genuinely run out of safe options, hand it off to a human property manager by creating a real ticket.

Each turn, decide both your reply and whether it's time to create a ticket:
- If there's still a genuinely useful safe step or clarifying question, ask or suggest exactly one of them (never more than one at a time), and set ready_for_ticket to false.
- Set ready_for_ticket to true once nothing on the safe list below applies to this issue, or the tenant already tried the one safe step that did apply and it didn't fix things, or the tenant says the issue still isn't resolved after 1-2 exchanges. When ready_for_ticket is true, your reply should tell the tenant you're creating a ticket now so a manager can take care of it — don't keep asking questions at that point.
- Don't drag the conversation out — if you don't have a genuinely useful safe next step, escalate rather than stalling with small talk.

${SAFETY_RULES}

If nothing on the safe list applies, or you're at all unsure, set ready_for_ticket to true and let the tenant know a manager will follow up — never guess toward being "helpful" when a suggestion could be risky.`;

const PENDING_TOOL = {
  name: "respond_to_tenant",
  description: "Reply to the tenant and decide whether it's time to create a real maintenance ticket for a manager.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      reply: {
        type: "string",
        description: "Your conversational reply to the tenant. 1-3 short sentences, no headers, no bullet lists, no markdown formatting.",
      },
      ready_for_ticket: {
        type: "boolean",
        description:
          "True once you're out of safe suggestions or questions for this issue — nothing on the safe list applies, or the one that did apply didn't fix it — and a manager needs to take over. False if there's still one reasonable safe step or clarifying question worth trying first.",
      },
    },
    required: ["reply", "ready_for_ticket"],
    additionalProperties: false,
  },
};

// Falls back to immediately escalating rather than leaving the tenant stuck
// chatting with no path to a real ticket if generation genuinely fails —
// consistent with "default to manager follow-up when unsure" everywhere
// else in this prompt.
const FALLBACK_RESULT = {
  reply: "I'm having trouble responding right now — I'll get a manager to follow up on this.",
  readyForTicket: true,
};

export async function generatePendingChatReply({ title, description, priority, comments }) {
  try {
    const context = [
      `Ticket title: ${title}`,
      description ? `Description: ${description}` : null,
      priority ? `Tenant-reported urgency: ${priority}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const conversation = comments
      .map((c) => `${c.sender === "tenant" ? "Tenant" : "You"}: ${c.body || "[sent an attachment]"}`)
      .join("\n");

    const response = await anthropic.messages.create({
      model: "claude-opus-5",
      max_tokens: 400,
      output_config: { effort: "low" },
      system: PENDING_SYSTEM_PROMPT,
      tools: [PENDING_TOOL],
      tool_choice: { type: "tool", name: PENDING_TOOL.name },
      messages: [
        {
          role: "user",
          content: conversation
            ? `${context}\n\nConversation so far:\n${conversation}\n\nDecide your next reply using the ${PENDING_TOOL.name} tool.`
            : `${context}\n\nThe tenant just reported this issue — decide your first reply using the ${PENDING_TOOL.name} tool.`,
        },
      ],
    });

    const toolUse = response.content.find((block) => block.type === "tool_use");
    if (!toolUse) return FALLBACK_RESULT;

    const reply = toolUse.input.reply?.trim();
    return {
      reply: reply || FALLBACK_RESULT.reply,
      readyForTicket: Boolean(toolUse.input.ready_for_ticket),
    };
  } catch (err) {
    console.error("Pending maintenance chat reply generation failed:", err);
    return FALLBACK_RESULT;
  }
}
