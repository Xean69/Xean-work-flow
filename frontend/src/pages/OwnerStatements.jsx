import PageHeader from '../components/PageHeader.jsx'
import './OwnerStatements.css'

const summary = [
  { label: 'Rent collected', value: '$8,900' },
  { label: 'Expenses', value: '$2,140' },
  { label: 'Net payout', value: '$6,760' },
  { label: 'Period', value: 'Jul 2026' },
]

const rows = [
  { property: '177 Avenue', rentIn: '$4,350', expenses: '$296', net: '$4,054' },
  { property: '94 Street', rentIn: '$3,000', expenses: '$1,504', net: '$1,496' },
  { property: 'Cy Becker Summit', rentIn: '$1,950', expenses: '$340', net: '$1,610' },
]

function OwnerStatements() {
  return (
    <div>
      <PageHeader title="Owner Statements" subtitle="Auto-generated monthly statements from your existing records">
        <button className="btn btn-primary">Generate statement</button>
      </PageHeader>

      <div className="content">
        <div className="card">
          <div className="stmt-summary">
            {summary.map((s) => (
              <div className="stmt-metric" key={s.label}>
                {s.label}
                <b>{s.value}</b>
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
              {rows.map((r) => (
                <tr key={r.property}>
                  <td>{r.property}</td>
                  <td className="mono">{r.rentIn}</td>
                  <td className="mono">{r.expenses}</td>
                  <td className="mono">{r.net}</td>
                  <td>
                    <a href="#" style={{ fontSize: 12, color: 'var(--brass-deep)', fontWeight: 600 }}>
                      Download PDF
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default OwnerStatements
