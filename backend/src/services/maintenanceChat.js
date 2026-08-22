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

// The whole point of this assistant is to be genuinely useful without ever
// steering a tenant toward something that could hurt them or make a repair
// worse — the allow-list below is deliberately narrow, and anything not on
// it defaults to "a manager will follow up" rather than a guess.
const SYSTEM_PROMPT = `You are a maintenance assistant for a property management company, chatting directly with a tenant who just reported an issue with their unit. Your job is to keep the conversation moving before a human property manager gets involved — either by asking one short clarifying question that would help a technician, or by suggesting one basic, safe troubleshooting step, or by simply acknowledging the tenant and letting them know a manager will follow up.

Reply with plain conversational text only — 1-3 short sentences, no headers, no bullet lists, no markdown formatting.

Safe to suggest (never more than one per reply):
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
- Structural repairs of any kind.

If nothing on the safe list applies, or you're at all unsure, just acknowledge the issue and say a manager will follow up — never guess toward being "helpful" when a suggestion could be risky.`;

// Runs once per new tenant comment (and once right after ticket creation)
// and returns a plain reply string, or null if generation failed or
// produced nothing — never throws, so a flaky API call degrades to "no AI
// reply this time" rather than blocking the tenant's own comment from
// saving. Deliberately no tool use (this produces conversational text, not
// structured data) and no extended thinking (a bounded, single-turn reply
// task, and it needs to feel responsive in a live chat) — same low-effort
// choice services/maintenanceTriage.js already makes for a comparable job.
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
      .map((c) => `${c.sender === "tenant" ? "Tenant" : c.sender === "ai" ? "You" : "Manager"}: ${c.body}`)
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
