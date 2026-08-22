const METHOD_LABEL = { e_transfer: 'E-transfer', cash: 'Cash', cheque: 'Cheque', other: 'Other' }
const CHARGE_TYPE_LABEL = { rent: 'Rent', addon: 'Addon', late_fee: 'Late fee', custom: 'Custom', credit: 'Credit' }
const STATUS_LABEL = { paid: 'Paid', partial: 'Partial', unpaid: 'Unpaid' }

function formatMoney(amount) {
  return `$${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
}

// A credit's amount (and, in an overpayment edge case, a running balance)
// can be negative — this puts the minus sign before the $ instead of
// toLocaleString's default "$-50.00".
function formatSignedMoney(amount) {
  const n = Number(amount)
  return n < 0 ? `-${formatMoney(-n)}` : formatMoney(n)
}

function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

// The from/to range picked in the modal are plain "YYYY-MM-DD" strings with
// no time component — new Date("2026-09-01") parses that as UTC midnight,
// which toLocaleDateString then rolls back a day in any timezone behind
// UTC. Parsed and constructed as a local date instead, so what's printed
// here always matches exactly what the manager typed.
function formatPlainDate(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

// jspdf/jspdf-autotable are dynamically imported from the click handler
// (see TenantProfile.jsx) rather than at the top of that file, so they
// never touch the page's initial bundle — only someone who actually clicks
// "Download PDF" pays for loading them.
//
// range: { from, to } — plain "YYYY-MM-DD" strings or null. When either is
// set, the printed table and summary are scoped to that window, but each
// row still shows its own true running balance (the ledger's one real
// timeline, not a balance re-based to 0 at the window's start) — an
// "Opening balance" line above the table gives that number context, the
// same way a real bank/credit-card statement for a date range does.
export async function downloadTenantLedgerPdf(tenant, ledger, range = {}) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])

  const { from, to } = range
  const dateOnly = (value) => (value ? String(value).slice(0, 10) : value)

  const before = from ? ledger.filter((e) => dateOnly(e.date) < from) : []
  const openingBalance = before.length > 0 ? before[before.length - 1].running_balance : 0

  const filtered = ledger.filter((e) => {
    const d = dateOnly(e.date)
    return (!from || d >= from) && (!to || d <= to)
  })

  const doc = new jsPDF()

  doc.setFontSize(16)
  doc.text(tenant.full_name, 14, 18)
  doc.setFontSize(10)
  doc.setTextColor(100)
  doc.text(`${tenant.property_name} · Unit ${tenant.unit_number}`, 14, 25)

  let y = 31
  if (tenant.occupants?.length > 0) {
    doc.text(`Occupants: ${tenant.occupants.map((o) => o.full_name).join(', ')}`, 14, y)
    y += 6
  }
  doc.text(`Generated on ${formatDate(new Date())}`, 14, y)
  y += 6
  if (from || to) {
    doc.text(`Statement period: ${from ? formatPlainDate(from) : 'Start'} – ${to ? formatPlainDate(to) : 'Present'}`, 14, y)
    y += 6
  }
  doc.text(`Opening balance: ${formatSignedMoney(openingBalance)}`, 14, y)
  doc.setTextColor(0)

  const totalCharged = filtered
    .filter((e) => e.type === 'charge' && e.charge_type !== 'credit')
    .reduce((sum, e) => sum + Number(e.amount), 0)
  const totalCredits = filtered
    .filter((e) => e.type === 'charge' && e.charge_type === 'credit')
    .reduce((sum, e) => sum + Math.abs(Number(e.amount)), 0)
  const totalPaid = filtered.filter((e) => e.type === 'payment').reduce((sum, e) => sum + Number(e.amount), 0)
  const closingBalance = filtered.length > 0 ? filtered[filtered.length - 1].running_balance : openingBalance

  autoTable(doc, {
    startY: y + 6,
    head: [['Date', 'Description', 'Type', 'Amount', 'Status', 'Balance']],
    body: filtered.map((entry) => [
      formatDate(entry.date),
      entry.type === 'charge' ? entry.description : `Payment (${METHOD_LABEL[entry.method] || entry.method})`,
      entry.type === 'charge' ? CHARGE_TYPE_LABEL[entry.charge_type] || entry.charge_type : 'Payment',
      entry.type === 'charge' ? formatSignedMoney(entry.amount) : `-${formatMoney(entry.amount)}`,
      entry.type === 'charge' && entry.status ? STATUS_LABEL[entry.status] || entry.status : '—',
      formatSignedMoney(entry.running_balance),
    ]),
    headStyles: { fillColor: [30, 30, 30] },
    styles: { fontSize: 9 },
  })

  const summaryY = (doc.lastAutoTable?.finalY ?? y + 6) + 12
  doc.setFontSize(10)
  doc.text(`Total charged: ${formatMoney(totalCharged)}`, 14, summaryY)
  doc.text(`Total credits: ${formatMoney(totalCredits)}`, 14, summaryY + 6)
  doc.text(`Total paid: ${formatMoney(totalPaid)}`, 14, summaryY + 12)
  doc.setFont(undefined, 'bold')
  doc.text(`Balance due: ${formatSignedMoney(closingBalance)}`, 14, summaryY + 18)
  doc.setFont(undefined, 'normal')

  const safeName = tenant.full_name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
  const dateStr = new Date().toISOString().slice(0, 10)
  doc.save(`ledger-${safeName}-${dateStr}.pdf`)
}
