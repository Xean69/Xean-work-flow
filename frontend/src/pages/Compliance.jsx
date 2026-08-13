import PageHeader from '../components/PageHeader.jsx'
import './Compliance.css'

const reviews = [
  {
    heading: 'Cy Becker Summit — Bylaw review',
    flags: [
      {
        icon: 'red',
        symbol: '!',
        title: 'Short-term rental restriction',
        desc: 'Bylaw section limits stays under 30 days without board approval — conflicts with planned Airbnb use for this unit.',
        clause: 'BYLAW §7.3 · flagged high priority',
      },
      {
        icon: 'amber',
        symbol: 'i',
        title: 'EV charging clause',
        desc: 'Installation requires written board notice 30 days in advance — no penalty, just a heads up before you install.',
        clause: 'BYLAW §12.1 · informational',
      },
      {
        icon: 'green',
        symbol: '✓',
        title: 'Pet policy',
        desc: 'Standard pet clause, no conflicts found with current lease terms.',
        clause: 'BYLAW §5.0 · clear',
      },
    ],
  },
  {
    heading: '177 Avenue — New lease draft',
    flags: [
      {
        icon: 'red',
        symbol: '!',
        title: 'Deposit exceeds legal limit',
        desc: "Security deposit listed at $1,600 on a $1,450/mo unit — Alberta RTA caps deposits at one month's rent.",
        clause: 'RTA §20(1) · fix before sending',
      },
    ],
  },
]

function Compliance() {
  return (
    <div>
      <PageHeader title="Compliance" subtitle="Checks new leases and bylaws against Alberta RTA + condo rules">
        <button className="btn btn-primary">Check a document</button>
      </PageHeader>

      <div className="content">
        {reviews.map((r) => (
          <div key={r.heading}>
            <div className="section-head">
              <h2>{r.heading}</h2>
            </div>
            <div className="card">
              {r.flags.map((f) => (
                <div className="flag-row" key={f.title}>
                  <div className={`flag-icon ${f.icon}`}>{f.symbol}</div>
                  <div>
                    <div className="flag-title">{f.title}</div>
                    <div className="flag-desc">{f.desc}</div>
                    <div className="flag-clause mono">{f.clause}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default Compliance
