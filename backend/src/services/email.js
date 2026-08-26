import { Resend } from "resend";
import pool from "../db.js";
import { tr } from "../i18n/notifications.js";

const resend = new Resend(process.env.RESEND_API_KEY);

// Update once there's a real deployed URL — every notification link is
// built from this one place.
const APP_BASE_URL = process.env.APP_BASE_URL || "http://localhost:5173";

const FROM = "Xean <notifications@xean.ca>";

// Deliberately minimal — inline-styled since email clients don't load
// external stylesheets, and plain since the ask was "simple and clean",
// not a full recreation of the app's visual design.
function renderEmail({ heading, lines, ctaText, ctaUrl }) {
  const paragraphs = lines
    .map((line) => `<p style="margin: 0 0 12px 0; color: #1b2430; font-size: 14px; line-height: 1.5;">${line}</p>`)
    .join("");
  return `
    <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h1 style="font-size: 18px; color: #1b2430; margin: 0 0 16px 0;">${heading}</h1>
      ${paragraphs}
      <a href="${ctaUrl}" style="display: inline-block; margin-top: 8px; padding: 10px 18px; background: #1b2430; color: #ffffff; border-radius: 6px; font-size: 13.5px; font-weight: 600; text-decoration: none;">${ctaText}</a>
    </div>
  `;
}

// Never throws — a failed send is logged and swallowed so it can never
// block the action (ticket creation, sending a message, etc.) that
// triggered it. Returns true/false so callers can log context if they want,
// but nothing currently checks the return value.
async function sendEmail({ to, subject, html }) {
  if (!to || (Array.isArray(to) && to.length === 0)) {
    console.error(`Email "${subject}" not sent: no recipient address`);
    return false;
  }
  try {
    const { data, error } = await resend.emails.send({ from: FROM, to, subject, html });
    if (error) {
      console.error(`Email "${subject}" to ${to} failed:`, error);
      return false;
    }
    // Failures were already logged everywhere; successes weren't logged at
    // all, which is exactly the gap that made a real delivery hard to
    // confirm after the fact (see the maintenance-notification
    // investigation this was added for) — cheap enough to log every time.
    console.log(`Email "${subject}" to ${to} sent (id: ${data?.id})`);
    return true;
  } catch (err) {
    console.error(`Email "${subject}" to ${to} failed:`, err);
    return false;
  }
}

// owner/manager are the roles that get operational notifications;
// accountants are read-only on the business's finances, not its day-to-day
// tenant activity, so they're deliberately excluded here.
async function getManagerRecipients(businessId) {
  const { rows } = await pool.query(
    "SELECT email FROM admins WHERE business_id = $1 AND role IN ('owner', 'manager')",
    [businessId]
  );
  return rows.map((r) => r.email);
}

const URGENCY_LABEL = { high: "High", medium: "Medium", low: "Low" };

export async function notifyManagersOfMaintenanceRequest({
  businessId,
  title,
  description,
  propertyName,
  unitNumber,
  tenantName,
  aiUrgency,
  aiTrade,
}) {
  try {
    const to = await getManagerRecipients(businessId);
    const lines = [
      `<strong>${tenantName || "A tenant"}</strong> at ${propertyName} · ${unitNumber} submitted a new maintenance request.`,
      `<strong>${title}</strong>`,
    ];
    if (description) lines.push(description);
    if (aiUrgency && aiTrade) {
      lines.push(`AI read: ${URGENCY_LABEL[aiUrgency] || aiUrgency} urgency · ${aiTrade}`);
    }
    await sendEmail({
      to,
      subject: `New maintenance request: ${title}`,
      html: renderEmail({
        heading: "New maintenance request",
        lines,
        ctaText: "View in Maintenance",
        ctaUrl: `${APP_BASE_URL}/maintenance`,
      }),
    });
  } catch (err) {
    console.error("notifyManagersOfMaintenanceRequest failed:", err);
  }
}

// Distinct from notifyManagersOfMaintenanceRequest above — this fires when
// a tenant flags an *existing* ticket's chat as an emergency, not when a
// new one is created, so it gets its own subject/heading rather than the
// misleading "New maintenance request."
export async function notifyManagersOfMaintenanceEmergency({
  businessId,
  title,
  propertyName,
  unitNumber,
  tenantName,
}) {
  try {
    const to = await getManagerRecipients(businessId);
    await sendEmail({
      to,
      subject: `🚨 Emergency: ${title}`,
      html: renderEmail({
        heading: "Maintenance ticket flagged as an emergency",
        lines: [
          `<strong>${tenantName || "A tenant"}</strong> at ${propertyName} · ${unitNumber} flagged an existing maintenance request as an emergency.`,
          `<strong>${title}</strong>`,
        ],
        ctaText: "View in Maintenance",
        ctaUrl: `${APP_BASE_URL}/maintenance`,
      }),
    });
  } catch (err) {
    console.error("notifyManagersOfMaintenanceEmergency failed:", err);
  }
}

export async function notifyManagersOfTenantMessage({ businessId, tenantName, messageBody }) {
  try {
    const to = await getManagerRecipients(businessId);
    await sendEmail({
      to,
      subject: `New message from ${tenantName}`,
      html: renderEmail({
        heading: "New tenant message",
        lines: [`<strong>${tenantName}</strong> sent you a message:`, messageBody],
        ctaText: "Reply in Inbox",
        ctaUrl: `${APP_BASE_URL}/inbox`,
      }),
    });
  } catch (err) {
    console.error("notifyManagersOfTenantMessage failed:", err);
  }
}

export async function notifyTenantOfMaintenanceReply({ tenantEmail, tenantName, ticketTitle, commentBody, language }) {
  try {
    if (!tenantEmail) return; // no portal login / no email on file — nothing to send
    const name = tenantName || tr(language, "defaultTenantName");
    await sendEmail({
      to: tenantEmail,
      subject: tr(language, "maintenanceReply.subject", { ticketTitle }),
      html: renderEmail({
        heading: tr(language, "maintenanceReply.heading"),
        lines: [tr(language, "maintenanceReply.body", { tenantName: name, ticketTitle: `<strong>${ticketTitle}</strong>` }), commentBody],
        ctaText: tr(language, "maintenanceReply.cta"),
        ctaUrl: `${APP_BASE_URL}/portal/repairs`,
      }),
    });
  } catch (err) {
    console.error("notifyTenantOfMaintenanceReply failed:", err);
  }
}

// The two password-reset senders. Unlike the notify* functions above,
// there's no businessId/tenantId lookup here — the route already knows the
// account exists and its email by the time it calls this, since the
// "don't reveal whether the account exists" behavior is handled by always
// sending the same response regardless of whether this actually fires.
export async function sendAdminPasswordResetEmail({ email, token }) {
  try {
    await sendEmail({
      to: email,
      subject: "Reset your Xean password",
      html: renderEmail({
        heading: "Reset your password",
        lines: [
          "We received a request to reset your Xean dashboard password.",
          "This link expires in 1 hour and can only be used once. If you didn't request this, you can safely ignore this email.",
        ],
        ctaText: "Reset password",
        ctaUrl: `${APP_BASE_URL}/reset-password?token=${token}`,
      }),
    });
  } catch (err) {
    console.error("sendAdminPasswordResetEmail failed:", err);
  }
}

export async function sendTenantPasswordResetEmail({ email, token, language }) {
  try {
    await sendEmail({
      to: email,
      subject: tr(language, "passwordReset.subject"),
      html: renderEmail({
        heading: tr(language, "passwordReset.heading"),
        lines: [tr(language, "passwordReset.line1"), tr(language, "passwordReset.line2")],
        ctaText: tr(language, "passwordReset.cta"),
        ctaUrl: `${APP_BASE_URL}/portal/reset-password?token=${token}`,
      }),
    });
  } catch (err) {
    console.error("sendTenantPasswordResetEmail failed:", err);
  }
}

// Unlike the other notify* functions, this one is also used for a manual
// "Resend" action the manager deliberately clicks — so it returns whether
// the send actually succeeded instead of swallowing that outcome. The
// automatic on-upload call site ignores the return value (same
// never-block-the-real-action behavior as everywhere else); the resend
// route reports it back to whoever clicked the button.
const KNOWN_DOC_TYPES = ["lease", "invoice", "inspection", "application"];

export async function notifyTenantOfNewDocument({ tenantEmail, tenantName, docType, fileName, language }) {
  try {
    if (!tenantEmail) return false;
    const name = tenantName || tr(language, "defaultTenantName");
    const docTypeLabel = tr(language, `docType.${KNOWN_DOC_TYPES.includes(docType) ? docType : "other"}`);
    return await sendEmail({
      to: tenantEmail,
      subject: tr(language, "newDocument.subject", { docTypeLabel: docTypeLabel.toLowerCase() }),
      html: renderEmail({
        heading: tr(language, "newDocument.heading", { docTypeLabel: docTypeLabel.toLowerCase() }),
        lines: [tr(language, "newDocument.body", { tenantName: name }), `<strong>${fileName}</strong>`],
        ctaText: tr(language, "newDocument.cta"),
        ctaUrl: `${APP_BASE_URL}/portal/lease`,
      }),
    });
  } catch (err) {
    console.error("notifyTenantOfNewDocument failed:", err);
    return false;
  }
}

export async function notifyTenantOfNewMessage({ tenantEmail, tenantName, messageBody, language }) {
  try {
    if (!tenantEmail) return;
    const name = tenantName || tr(language, "defaultTenantName");
    await sendEmail({
      to: tenantEmail,
      subject: tr(language, "newMessage.subject"),
      html: renderEmail({
        heading: tr(language, "newMessage.heading"),
        lines: [tr(language, "newMessage.body", { tenantName: name }), messageBody],
        ctaText: tr(language, "newMessage.cta"),
        ctaUrl: `${APP_BASE_URL}/portal/messages`,
      }),
    });
  } catch (err) {
    console.error("notifyTenantOfNewMessage failed:", err);
  }
}

// Bulk announcements reuse this same tenant-facing "new message" channel —
// the only difference is the manager wrote an actual subject line for this
// one, which is used verbatim as both the email's subject and heading
// (never translated, same as messageBody/announcementBody below — only the
// surrounding chrome is localized, per each tenant's own language).
export async function notifyTenantOfAnnouncement({ tenantEmail, tenantName, subject, announcementBody, language }) {
  try {
    if (!tenantEmail) return false;
    const name = tenantName || tr(language, "defaultTenantName");
    return await sendEmail({
      to: tenantEmail,
      subject,
      html: renderEmail({
        heading: subject,
        lines: [tr(language, "announcement.body", { tenantName: name }), announcementBody],
        ctaText: tr(language, "announcement.cta"),
        ctaUrl: `${APP_BASE_URL}/portal/messages`,
      }),
    });
  } catch (err) {
    console.error("notifyTenantOfAnnouncement failed:", err);
    return false;
  }
}

// Fires whenever a manager assigns (or reassigns) a ticket to a maintenance
// team member. Links to the staff portal's login rather than a specific
// ticket URL — the email can't carry a session, and the portal only ever
// shows a staff member their own assigned tickets anyway, so landing on the
// list is equivalent to landing on the one ticket if they've only got one.
export async function notifyStaffOfAssignment({ staffEmail, staffName, ticketTitle, propertyName, unitNumber, language }) {
  try {
    if (!staffEmail) return false;
    const name = staffName || tr(language, "defaultTenantName");
    return await sendEmail({
      to: staffEmail,
      subject: tr(language, "staffAssignment.subject", { ticketTitle }),
      html: renderEmail({
        heading: tr(language, "staffAssignment.heading"),
        lines: [
          tr(language, "staffAssignment.body", { staffName: name, ticketTitle, propertyName, unitNumber }),
        ],
        ctaText: tr(language, "staffAssignment.cta"),
        ctaUrl: `${APP_BASE_URL}/staff/login`,
      }),
    });
  } catch (err) {
    console.error("notifyStaffOfAssignment failed:", err);
    return false;
  }
}

// Manager-facing, like notifyManagersOfTenantMessage above — plain English,
// never run through tr(), since managers don't carry a language preference
// in this app. Only the staff-facing notifyStaffOfNewMessage below is
// localized.
export async function notifyManagersOfStaffMessage({ businessId, staffName, messageBody }) {
  try {
    const to = await getManagerRecipients(businessId);
    await sendEmail({
      to,
      subject: `New message from ${staffName}`,
      html: renderEmail({
        heading: "New message from your maintenance team",
        lines: [`<strong>${staffName}</strong> sent you a message:`, messageBody],
        ctaText: "Reply in Inbox",
        ctaUrl: `${APP_BASE_URL}/inbox`,
      }),
    });
  } catch (err) {
    console.error("notifyManagersOfStaffMessage failed:", err);
  }
}

export async function notifyStaffOfNewMessage({ staffEmail, staffName, messageBody, language }) {
  try {
    if (!staffEmail) return;
    const name = staffName || tr(language, "defaultTenantName");
    await sendEmail({
      to: staffEmail,
      subject: tr(language, "staffMessage.subject"),
      html: renderEmail({
        heading: tr(language, "staffMessage.heading"),
        lines: [tr(language, "staffMessage.body", { staffName: name }), messageBody],
        ctaText: tr(language, "staffMessage.cta"),
        ctaUrl: `${APP_BASE_URL}/staff/messages`,
      }),
    });
  } catch (err) {
    console.error("notifyStaffOfNewMessage failed:", err);
  }
}

// ============================================================================
// Public landing-page contact forms — see routes/contact.js. The only
// unauthenticated write path in the app, so unlike every function above
// (which only ever interpolates app-controlled strings — tenant names,
// ticket titles, etc. — into renderEmail's `lines`), these three build
// their lines from fully visitor-supplied free text. renderEmail doesn't
// escape HTML (never needed to before now), so every submitted field is
// escaped here first — otherwise a submission could inject raw markup or
// script into the email actually opened in hrsupport@xean.ca's mail
// client.
// ============================================================================
const HR_EMAIL = "hrsupport@xean.ca";

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Unlike every notify* function above (fire-and-forget, nothing checks the
// result), these three return sendEmail's success boolean — routes/contact.js
// records it in contact_submissions.email_sent so a silent Resend failure
// still leaves a trace that a real inquiry needs manual follow-up.
export async function notifyHrOfContactInquiry({ name, email, phone, message }) {
  try {
    return await sendEmail({
      to: HR_EMAIL,
      subject: `New contact form inquiry from ${name}`,
      html: renderEmail({
        heading: "New contact form submission",
        lines: [
          `<strong>Name:</strong> ${escapeHtml(name)}`,
          `<strong>Email:</strong> ${escapeHtml(email)}`,
          `<strong>Phone:</strong> ${escapeHtml(phone || "—")}`,
          `<strong>Message:</strong><br>${escapeHtml(message)}`,
        ],
        ctaText: `Reply to ${name}`,
        ctaUrl: `mailto:${email}`,
      }),
    });
  } catch (err) {
    console.error("notifyHrOfContactInquiry failed:", err);
    return false;
  }
}

export async function notifyHrOfChatMessage({ name, email, message }) {
  try {
    return await sendEmail({
      to: HR_EMAIL,
      subject: `New "Chat with us" message from ${name}`,
      html: renderEmail({
        heading: "New chat message from the landing page",
        lines: [
          `<strong>Name:</strong> ${escapeHtml(name)}`,
          `<strong>Email:</strong> ${escapeHtml(email)}`,
          `<strong>Message:</strong><br>${escapeHtml(message)}`,
        ],
        ctaText: `Reply to ${name}`,
        ctaUrl: `mailto:${email}`,
      }),
    });
  } catch (err) {
    console.error("notifyHrOfChatMessage failed:", err);
    return false;
  }
}

export async function notifyHrOfDemoRequest({ name, email, phone, preferredTime }) {
  try {
    return await sendEmail({
      to: HR_EMAIL,
      subject: `New demo request from ${name}`,
      html: renderEmail({
        heading: "New demo request",
        lines: [
          `<strong>Name:</strong> ${escapeHtml(name)}`,
          `<strong>Email:</strong> ${escapeHtml(email)}`,
          `<strong>Phone:</strong> ${escapeHtml(phone || "—")}`,
          `<strong>Preferred time:</strong> ${escapeHtml(preferredTime)}`,
        ],
        ctaText: `Reply to ${name}`,
        ctaUrl: `mailto:${email}`,
      }),
    });
  } catch (err) {
    console.error("notifyHrOfDemoRequest failed:", err);
    return false;
  }
}
