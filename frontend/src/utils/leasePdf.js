function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

// Cloudinary logo URLs are public and cross-origin — jsPDF's addImage needs
// actual image data, not a URL, so this fetches and converts once before
// rendering starts.
async function fetchAsDataUrl(url) {
  const res = await fetch(url)
  const blob = await res.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

const PAGE_MARGIN = 14
const PAGE_HEIGHT = 297 // A4 in mm, jsPDF's default unit
const FOOTER_Y = PAGE_HEIGHT - 12

// jspdf is dynamically imported from the click handler that calls this
// (see Leases.jsx), same pattern as tenantLedgerPdf.js — only someone who
// actually finalizes a lease pays for loading it.
//
// Deliberately renders only the unsigned contract text — no signature is
// baked into this PDF, ever, even after a tenant signs. The signature
// (typed name + timestamp, and/or a drawn image) lives as separate
// structured data on the lease record itself; this PDF is the one
// immutable artifact generated once at send time. Returns a Blob (not a
// browser download) so the caller can upload it through the ordinary
// /api/documents pipeline.
export async function generateLeasePdfBlob({ lease, tenantName, propertyAddress, unitNumber, logoUrl }) {
  const { default: jsPDF } = await import('jspdf')
  const doc = new jsPDF()

  let logoDataUrl = null
  if (logoUrl) {
    try {
      logoDataUrl = await fetchAsDataUrl(logoUrl)
    } catch {
      logoDataUrl = null // A broken logo shouldn't block generating the lease itself.
    }
  }

  let y = PAGE_MARGIN
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, 'PNG', PAGE_MARGIN, y, 28, 28, undefined, 'FAST')
    } catch {
      // Cloudinary may have served a non-PNG (e.g. JPG) under a PNG-looking
      // URL — addImage throws on a format mismatch. Skip the logo rather
      // than fail the whole document over it.
    }
    y += 32
  }

  doc.setFontSize(16)
  doc.text('RESIDENTIAL LEASE AGREEMENT', PAGE_MARGIN, y)
  y += 8
  doc.setFontSize(10)
  doc.setTextColor(90)
  doc.text(`${tenantName} · ${propertyAddress}, Unit ${unitNumber}`, PAGE_MARGIN, y)
  y += 5
  doc.text(`Generated ${formatDate(new Date())}`, PAGE_MARGIN, y)
  doc.setTextColor(0)
  y += 10

  const maxWidth = 210 - PAGE_MARGIN * 2

  function ensureSpace(neededHeight) {
    if (y + neededHeight > FOOTER_Y) {
      addFooter()
      doc.addPage()
      y = PAGE_MARGIN
    }
  }

  function addFooter() {
    if (!lease.ai_generated) return
    doc.setFontSize(7.5)
    doc.setTextColor(130)
    const note =
      lease.generation_mode === 'generate'
        ? 'Portions of this document were drafted with AI assistance. Review carefully and consult a lawyer before use — Xean does not guarantee this document is complete, accurate, or enforceable in your jurisdiction.'
        : 'This document was transcribed from a manager-provided template with AI assistance. Compare against the original template before use.'
    const lines = doc.splitTextToSize(note, maxWidth)
    doc.text(lines, PAGE_MARGIN, FOOTER_Y)
    doc.setTextColor(0)
  }

  for (const section of lease.content.sections) {
    ensureSpace(14)
    doc.setFontSize(11)
    doc.setFont(undefined, 'bold')
    const headingLines = doc.splitTextToSize(section.heading, maxWidth)
    doc.text(headingLines, PAGE_MARGIN, y)
    y += headingLines.length * 5 + 2

    doc.setFont(undefined, 'normal')
    doc.setFontSize(10)
    const bodyLines = doc.splitTextToSize(section.body, maxWidth)
    for (const line of bodyLines) {
      ensureSpace(5)
      doc.text(line, PAGE_MARGIN, y)
      y += 5
    }
    y += 4
  }

  ensureSpace(30)
  doc.setFont(undefined, 'bold')
  doc.setFontSize(11)
  doc.text('Signatures', PAGE_MARGIN, y)
  y += 8
  doc.setFont(undefined, 'normal')
  doc.setFontSize(10)
  doc.text('Landlord: _________________________  Date: _______________', PAGE_MARGIN, y)
  y += 10
  doc.text('Tenant: _________________________  Date: _______________', PAGE_MARGIN, y)

  addFooter()

  return doc.output('blob')
}
