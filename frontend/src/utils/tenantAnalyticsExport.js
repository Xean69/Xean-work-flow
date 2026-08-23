function formatMoney(amount) {
  return `$${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
}

function formatDate(value) {
  return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function unitLabel(t) {
  return `${t.property_name} · ${t.unit_number}`
}

// jspdf/jspdf-autotable are dynamically imported from the click handler
// (see TenantAnalytics.jsx) rather than at the top of this file, so they
// never touch the page's initial bundle — same convention as
// tenantLedgerPdf.js's downloadTenantLedgerPdf.
export async function downloadAnalyticsPdf(data) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])

  const doc = new jsPDF()

  doc.setFontSize(16)
  doc.text('Tenant Analytics', 14, 18)
  doc.setFontSize(10)
  doc.setTextColor(100)
  doc.text(`Generated on ${formatDate(new Date())}`, 14, 25)
  doc.setTextColor(0)

  doc.setFontSize(10)
  const summaryY = 35
  doc.text(`Vacant units: ${data.vacant_units}`, 14, summaryY)
  doc.text(`Pending balance: ${data.pending_count}`, 80, summaryY)
  doc.text(`Current: ${data.current_count}`, 140, summaryY)
  doc.setFont(undefined, 'bold')
  doc.text(`Total outstanding: ${formatMoney(data.total_outstanding)}`, 14, summaryY + 7)
  doc.setFont(undefined, 'normal')

  autoTable(doc, {
    startY: summaryY + 14,
    head: [['Tenant', 'Phone', 'Unit', 'Balance owed', 'Days owing']],
    body: data.tenants.map((t) => [
      t.full_name,
      t.phone || '—',
      unitLabel(t),
      formatMoney(t.balance_due),
      String(t.days_owing),
    ]),
    headStyles: { fillColor: [30, 30, 30] },
    styles: { fontSize: 9 },
  })

  const dateStr = new Date().toISOString().slice(0, 10)
  doc.save(`tenant-analytics-${dateStr}.pdf`)
}

// exceljs is dynamically imported for the same reason as jsPDF above.
export async function downloadAnalyticsExcel(data) {
  const { default: ExcelJS } = await import('exceljs')

  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Tenant Analytics')

  const titleRow = sheet.addRow(['Xean — Tenant Analytics'])
  titleRow.font = { bold: true, size: 14 }
  sheet.addRow([`Generated on ${formatDate(new Date())}`])
  sheet.addRow([])

  const summaryLabelRow = sheet.addRow(['Vacant units', 'Pending balance', 'Current', 'Total outstanding'])
  summaryLabelRow.font = { bold: true }
  sheet.addRow([data.vacant_units, data.pending_count, data.current_count, Number(data.total_outstanding)])
  sheet.addRow([])

  const headerRow = sheet.addRow(['Tenant', 'Phone', 'Property', 'Unit', 'Balance owed', 'Days owing'])
  headerRow.font = { bold: true }
  for (const t of data.tenants) {
    sheet.addRow([t.full_name, t.phone || '—', t.property_name, t.unit_number, Number(t.balance_due), t.days_owing])
  }

  sheet.columns = [{ width: 26 }, { width: 16 }, { width: 22 }, { width: 12 }, { width: 16 }, { width: 12 }]

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `tenant-analytics-${new Date().toISOString().slice(0, 10)}.xlsx`
  link.click()
  URL.revokeObjectURL(url)
}
