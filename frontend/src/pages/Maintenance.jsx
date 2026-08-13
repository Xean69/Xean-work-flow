import PageHeader from '../components/PageHeader.jsx'
import './Maintenance.css'

const columns = [
  {
    title: 'New',
    tickets: [
      { title: 'No hot water in unit', meta: 'Cy Becker Rd · Marcus O.', urgency: 'high', tag: '⚡ Urgent · Plumbing' },
      { title: 'Squeaky bedroom door hinge', meta: '177 Avenue · Sarah K.', urgency: 'low', tag: '⚡ Routine · General' },
    ],
  },
  {
    title: 'Triaged',
    tickets: [
      { title: 'Dishwasher not draining', meta: '94 Street · D. Osei', urgency: 'mid', tag: '⚡ Moderate · Appliance' },
    ],
  },
  {
    title: 'Dispatched',
    tickets: [
      { title: 'Breaker tripping in kitchen', meta: '177 Avenue · Ade F.', urgency: 'high', tag: '⚡ Vendor notified — ETA 2pm' },
    ],
  },
  {
    title: 'Resolved',
    tickets: [
      { title: 'Leaky bathroom faucet', meta: '94 Street · R. Nwosu', urgency: 'low', tag: '✓ Closed Aug 9', faded: true },
    ],
  },
]

function Maintenance() {
  return (
    <div>
      <PageHeader title="Maintenance" subtitle="AI reads each request and sorts urgency + trade automatically">
        <button className="btn btn-primary">+ New ticket</button>
      </PageHeader>

      <div className="content">
        <div className="board">
          {columns.map((col) => (
            <div key={col.title}>
              <div className="board-col-head">
                <h3>{col.title}</h3>
                <span className="board-count mono">{col.tickets.length}</span>
              </div>
              {col.tickets.map((t) => (
                <div className="ticket" style={t.faded ? { opacity: 0.65 } : undefined} key={t.title}>
                  <div className="ticket-top">
                    <div className={`urgency-dot ${t.urgency}`} />
                    <div className="ticket-title">{t.title}</div>
                  </div>
                  <div className="ticket-meta">{t.meta}</div>
                  <div className="ai-tag">{t.tag}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default Maintenance
