const METHOD_LABEL = { e_transfer: 'E-transfer', cash: 'Cash', cheque: 'Cheque', other: 'Other' }
const CHARGE_TYPE_LABEL = { rent: 'Rent', addon: 'Addon', late_fee: 'Late fee', custom: 'Custom' }
const STATUS_LABEL = { paid: 'Paid', partial: 'Partial', unpaid: 'Unpaid' }

function formatMoney(amount) {
  return `$${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
}

function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

// jspdf/jspdf-autotable are dynamically imported from the click handler
// (see TenantProfile.jsx) rather than at the top of that file, so they
// never touch the page's initial bundle — only someone who actually clicks
// "Download PDF" pays for loading them.
export async function downloadTenantLedgerPdf(tenant, ledger) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])

  const doc = new jsPDF()

  doc.setFontSize(16)
  doc.text(tenant.full_name, 14, 18)
  doc.setFontSize(10)
  doc.setTextColor(100)
  doc.text(`${tenant.property_name} · Unit ${tenant.unit_number}`, 14, 25)
  doc.text(`Generated on ${formatDate(new Date())}`, 14, 31)
  doc.setTextColor(0)

  const totalCharged = ledger.filter((e) => e.type === 'charge').reduce((sum, e) => sum + Number(e.amount), 0)
  const totalPaid = ledger.filter((e) => e.type === 'payment').reduce((sum, e) => sum + Number(e.amount), 0)

  autoTable(doc, {
    startY: 38,
    head: [['Date', 'Description', 'Type', 'Amount', 'Status', 'Balance']],
    body: ledger.map((entry) => [
      formatDate(entry.date),
      entry.type === 'charge' ? entry.description : `Payment (${METHOD_LABEL[entry.method] || entry.method})`,
      entry.type === 'charge' ? CHARGE_TYPE_LABEL[entry.charge_type] || entry.charge_type : 'Payment',
      entry.type === 'charge' ? formatMoney(entry.amount) : `-${formatMoney(entry.amount)}`,
      entry.type === 'charge' ? STATUS_LABEL[entry.status] || entry.status : '—',
      formatMoney(entry.running_balance),
    ]),
    headStyles: { fillColor: [30, 30, 30] },
    styles: { fontSize: 9 },
  })

  const summaryY = (doc.lastAutoTable?.finalY ?? 38) + 12
  doc.setFontSize(10)
  doc.text(`Total charged: ${formatMoney(totalCharged)}`, 14, summaryY)
  doc.text(`Total paid: ${formatMoney(totalPaid)}`, 14, summaryY + 6)
  doc.setFont(undefined, 'bold')
  doc.text(`Balance due: ${formatMoney(tenant.balance_due)}`, 14, summaryY + 12)
  doc.setFont(undefined, 'normal')

  const safeName = tenant.full_name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
  const dateStr = new Date().toISOString().slice(0, 10)
  doc.save(`ledger-${safeName}-${dateStr}.pdf`)
}
