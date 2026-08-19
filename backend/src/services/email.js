import { Resend } from "resend";
import pool from "../db.js";

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
    const { error } = await resend.emails.send({ from: FROM, to, subject, html });
    if (error) {
      console.error(`Email "${subject}" to ${to} failed:`, error);
      return false;
    }
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

export async function notifyTenantOfMaintenanceReply({ tenantEmail, tenantName, ticketTitle, commentBody }) {
  try {
    if (!tenantEmail) return; // no portal login / no email on file — nothing to send
    await sendEmail({
      to: tenantEmail,
      subject: `New reply on "${ticketTitle}"`,
      html: renderEmail({
        heading: "Your property manager replied",
        lines: [`Hi ${tenantName || "there"}, there's a new reply on "<strong>${ticketTitle}</strong>":`, commentBody],
        ctaText: "View in Repairs",
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

export async function sendTenantPasswordResetEmail({ email, token }) {
  try {
    await sendEmail({
      to: email,
      subject: "Reset your tenant portal password",
      html: renderEmail({
        heading: "Reset your password",
        lines: [
          "We received a request to reset your tenant portal password.",
          "This link expires in 1 hour and can only be used once. If you didn't request this, you can safely ignore this email.",
        ],
        ctaText: "Reset password",
        ctaUrl: `${APP_BASE_URL}/portal/reset-password?token=${token}`,
      }),
    });
  } catch (err) {
    console.error("sendTenantPasswordResetEmail failed:", err);
  }
}

export async function notifyTenantOfNewMessage({ tenantEmail, tenantName, messageBody }) {
  try {
    if (!tenantEmail) return;
    await sendEmail({
      to: tenantEmail,
      subject: "New message from your property manager",
      html: renderEmail({
        heading: "New message",
        lines: [`Hi ${tenantName || "there"}, your property manager sent you a message:`, messageBody],
        ctaText: "View in Messages",
        ctaUrl: `${APP_BASE_URL}/portal/messages`,
      }),
    });
  } catch (err) {
    console.error("notifyTenantOfNewMessage failed:", err);
  }
}
