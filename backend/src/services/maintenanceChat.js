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

// Shared by both prompts below. A photo/video request is optional context-
// gathering, not a gate — it should never block or delay help, and it
// should never repeat once the conversation already has an answer (an
// attachment, a decline, or the AI's own earlier ask visible in the
// transcript already tells it that).
const VISUAL_GUIDANCE = `When the tenant's description is visual or hard to judge from text alone (e.g. "the cabinet is broken," "something's leaking," "there's a crack," a strange smell, an appliance acting up with no clear symptoms) and no photo or video has been attached yet in this conversation, it's often more useful to ask the tenant to attach one than to guess at a specific cause or troubleshooting step — prefer asking over guessing in that turn. This is optional, never a requirement: if the tenant doesn't attach anything, says they can't, or you've already asked for one earlier in this conversation, move on and help with whatever you have — never ask twice, and never ask if a photo or video already appears in the conversation. If a photo has been attached, you can see it directly — look at it and let what it actually shows inform your reply instead of asking something it already answers. Videos and some photo formats aren't visible to you even when attached; if a message says an attachment couldn't be viewed, treat it the same as if the tenant had only described the issue in words.`;

// Used once a ticket already exists (real, past the pending stage) and the
// conversation continues — no more "should this become a ticket" decision
// to make, so this is plain text, no tool use.
const SYSTEM_PROMPT = `You are a maintenance assistant for a property management company, chatting directly with a tenant about an open maintenance ticket. Your job is to keep the conversation moving before a human property manager gets involved — either by asking one short clarifying question that would help a technician, or by suggesting one basic, safe troubleshooting step, or by simply acknowledging the tenant and letting them know a manager will follow up.

Reply with plain conversational text only — 1-3 short sentences, no headers, no bullet lists, no markdown formatting.

${VISUAL_GUIDANCE}

${SAFETY_RULES}

If nothing on the safe list applies, or you're at all unsure, just acknowledge the issue and say a manager will follow up — never guess toward being "helpful" when a suggestion could be risky.`;

// resource_type is Cloudinary's own classification ('image', 'video', or
// 'raw' for everything else — PDFs, docs). Claude's vision only supports
// JPEG/PNG/GIF/WebP — not video, and not HEIC/HEIF (common straight off an
// iPhone camera, and otherwise a normal 'image' upload here) — so those
// need to fall back to a text placeholder rather than a real image block,
// which Claude would just reject outright. The filename extension is the
// only signal available for that distinction; when it's missing or
// ambiguous this defaults to treating the file as viewable, since JPEG/PNG
// are the overwhelmingly common case.
function isViewableImage(comment) {
  if (comment.attachment_cloudinary_resource_type !== "image") return false;
  return !/\.(heic|heif)$/i.test(comment.attachment_file_name || "");
}

function unviewableAttachmentLabel(comment) {
  if (comment.attachment_cloudinary_resource_type === "video") {
    return "[attached a video, which I can't view directly]";
  }
  if (comment.attachment_cloudinary_resource_type === "image") {
    return "[attached a photo in a format I can't view directly]";
  }
  return "[attached a document]";
}

// Turns the stored comment thread into a content-blocks array instead of
// one flattened string, so an attached photo can be included as a real
// image block Claude actually sees — not just a "[sent an attachment]"
// placeholder. speakerFor labels each turn (the two callers differ only in
// whether "Manager" is a possible sender — a pending conversation never
// has one, since managers can't see a ticket that doesn't exist yet).
function buildConversationBlocks(comments, speakerFor) {
  const blocks = [];
  for (const c of comments) {
    const speaker = speakerFor(c.sender);
    if (c.attachment_url && isViewableImage(c)) {
      blocks.push({ type: "text", text: `${speaker}${c.body ? ": " + c.body : " sent a photo:"}` });
      blocks.push({ type: "image", source: { type: "url", url: c.attachment_url } });
    } else if (c.attachment_url) {
      blocks.push({ type: "text", text: `${speaker}: ${c.body || unviewableAttachmentLabel(c)}` });
    } else {
      blocks.push({ type: "text", text: `${speaker}: ${c.body}` });
    }
  }
  return blocks;
}

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

    const speakerFor = (sender) => (sender === "tenant" ? "Tenant" : sender === "ai" ? "You" : "Manager");
    const conversationBlocks = buildConversationBlocks(comments, speakerFor);

    const content = [
      {
        type: "text",
        text: conversationBlocks.length
          ? `${context}\n\nConversation so far:`
          : `${context}\n\nThe tenant just submitted this ticket — write your first reply to them.`,
      },
      ...conversationBlocks,
      ...(conversationBlocks.length ? [{ type: "text", text: "Write your next reply to the tenant." }] : []),
    ];

    const response = await anthropic.messages.create({
      model: "claude-opus-5",
      max_tokens: 300,
      output_config: { effort: "low" },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content }],
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

${VISUAL_GUIDANCE} Asking for a photo/video counts as a clarifying question for that turn — set ready_for_ticket to false when you do.

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

    const speakerFor = (sender) => (sender === "tenant" ? "Tenant" : "You");
    const conversationBlocks = buildConversationBlocks(comments, speakerFor);

    const content = [
      {
        type: "text",
        text: conversationBlocks.length
          ? `${context}\n\nConversation so far:`
          : `${context}\n\nThe tenant just reported this issue — decide your first reply using the ${PENDING_TOOL.name} tool.`,
      },
      ...conversationBlocks,
      ...(conversationBlocks.length
        ? [{ type: "text", text: `Decide your next reply using the ${PENDING_TOOL.name} tool.` }]
        : []),
    ];

    const response = await anthropic.messages.create({
      model: "claude-opus-5",
      max_tokens: 400,
      output_config: { effort: "low" },
      system: PENDING_SYSTEM_PROMPT,
      tools: [PENDING_TOOL],
      tool_choice: { type: "tool", name: PENDING_TOOL.name },
      messages: [{ role: "user", content }],
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
