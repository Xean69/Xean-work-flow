import { useEffect, useState } from 'react'
import { getOwnerStatements } from '../api/client.js'
import PageHeader from '../components/PageHeader.jsx'
import './OwnerStatements.css'

function currentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function formatMoney(amount) {
  return `$${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
}

// "2026-07" -> "Jul 2026" — parsed as separate year/month numbers rather
// than `new Date("2026-07")`, which JS treats as UTC midnight and can
// display as the previous day/month in a negative-UTC-offset timezone.
function formatPeriod(period) {
  const [year, month] = period.split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
}

function OwnerStatements() {
  const [month, setMonth] = useState(currentMonth())
  const [statement, setStatement] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    load()
  }, [month])

  async function load() {
    setLoading(true)
    setLoadError('')
    try {
      setStatement(await getOwnerStatements(month))
    } catch (err) {
      setLoadError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const summary = statement
    ? [
        { label: 'Rent collected', value: formatMoney(statement.totals.rent_collected) },
        { label: 'Expenses', value: formatMoney(statement.totals.expenses) },
        { label: 'Net payout', value: formatMoney(statement.totals.net_payout) },
        { label: 'Period', value: formatPeriod(statement.period) },
      ]
    : []

  return (
    <div>
      <PageHeader title="Owner Statements" subtitle="Monthly statements computed live from your properties, tenants, and expenses">
        <input
          type="month"
          className="stmt-month-picker"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          max={currentMonth()}
        />
      </PageHeader>

      <div className="content">
        {loadError && <p className="form-error">{loadError}</p>}

        {!loading && !loadError && statement?.properties.length === 0 && (
          <div className="empty-state card">
            <h3>No properties yet</h3>
            <p>Add a property to start seeing monthly statements here.</p>
          </div>
        )}

        {!loadError && statement && statement.properties.length > 0 && (
          <div className="card table-scroll">
            <div className="stmt-summary">
              {summary.map((s) => (
                <div className="stmt-metric" key={s.label}>
                  {s.label}
                  <b>{loading ? '—' : s.value}</b>
                </div>
              ))}
            </div>
            <table>
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Rent in</th>
                  <th>Expenses</th>
                  <th>Net</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {statement.properties.map((p) => (
                  <tr key={p.property_id}>
                    <td>{p.property_name}</td>
                    <td className="mono">{formatMoney(p.rent_collected)}</td>
                    <td className="mono">{formatMoney(p.expenses)}</td>
                    <td className="mono">{formatMoney(p.net_payout)}</td>
                    <td>
                      {/* PDF generation isn't built yet — placeholder until that's wired up. */}
                      <a href="#" style={{ fontSize: 12, color: 'var(--brass-deep)', fontWeight: 600 }}>
                        Download PDF
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {statement.unattributed_expenses > 0 && (
              <div className="stmt-footnote">
                Includes {formatMoney(statement.unattributed_expenses)} in expenses not tied to a specific property,
                counted in the total above but not in any property's row.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default OwnerStatements
