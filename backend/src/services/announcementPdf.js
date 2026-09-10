import jsPDFModule from "jspdf";

// jspdf's package.json exports a dedicated Node build
// (dist/jspdf.node.min.js) under the "node" resolution condition — needed
// here since this runs server-side, unlike every other PDF in this app
// (ledger export, lease contract), which are generated client-side in the
// browser via jspdf's browser build. That Node build's default export is an
// object wrapping the actual constructor at .jsPDF, not the constructor
// itself — a different shape than frontend/src/utils/*.js's
// `import { default: jsPDF } from 'jspdf'`, easy to get wrong.
const jsPDF = jsPDFModule.jsPDF;

const PAGE_MARGIN = 14;
const PAGE_WIDTH = 210; // A4 in mm, jsPDF's default unit
const MAX_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
const PAGE_BOTTOM = 280;

// The business's own operating timezone (businesses.timezone), not any one
// tenant's personal display timezone — this is the business's letterhead
// record of when it sent the announcement, so it should read the same
// regardless of which recipient's copy you're looking at.
function formatSentAt(date, timezone) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone || "UTC",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

// Renders the same letterhead-style PDF every recipient of one announcement
// gets their own separate copy of (see routes/messages.js's /announce) —
// called once per send, not once per recipient, since the content never
// varies by tenant; only the Cloudinary upload + documents row are per-
// tenant, so each recipient's copy is a genuinely independent file (safe to
// delete one without breaking another's).
export function generateAnnouncementPdfBuffer({ businessName, subject, body, sentAt, timezone }) {
  const doc = new jsPDF();

  doc.setFontSize(16);
  doc.setFont(undefined, "bold");
  doc.text(businessName, PAGE_MARGIN, 20);
  doc.setDrawColor(180);
  doc.line(PAGE_MARGIN, 24, PAGE_WIDTH - PAGE_MARGIN, 24);

  let y = 36;

  // Title = the announcement's subject line — matches the label this same
  // subject gets used as for the document's file_name, so what's on the
  // page and what's in the tenant's document list always agree.
  doc.setFontSize(14);
  doc.setFont(undefined, "bold");
  const titleLines = doc.splitTextToSize(subject, MAX_WIDTH);
  doc.text(titleLines, PAGE_MARGIN, y);
  y += titleLines.length * 7 + 2;

  doc.setFont(undefined, "normal");
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text(`Sent ${formatSentAt(sentAt, timezone)}`, PAGE_MARGIN, y);
  doc.setTextColor(0);
  y += 12;

  doc.setFontSize(11);
  const bodyLines = doc.splitTextToSize(body, MAX_WIDTH);
  for (const line of bodyLines) {
    if (y > PAGE_BOTTOM) {
      doc.addPage();
      y = PAGE_MARGIN;
    }
    doc.text(line, PAGE_MARGIN, y);
    y += 6;
  }

  return Buffer.from(doc.output("arraybuffer"));
}
