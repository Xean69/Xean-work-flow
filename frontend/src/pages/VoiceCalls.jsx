import PageHeader from '../components/PageHeader.jsx'

const calls = [
  {
    name: 'Marcus O. — 2m 14s',
    quote: '"There\'s no hot water since this morning, it\'s freezing..."',
    urgency: 'High',
    trade: 'Plumbing',
    confidence: { level: 'high', label: '✓' },
  },
  {
    name: 'Sarah K. — 0m 48s',
    quote: '"Just wanted to confirm my late rent is okay..."',
    urgency: 'N/A',
    trade: 'General',
    confidence: { level: 'high', label: '✓' },
  },
  {
    name: 'D. Osei — 1m 32s',
    quote: '"Dishwasher\'s still not draining properly..."',
    urgency: 'Mid',
    trade: 'Appliance',
    confidence: { level: 'mid', label: '~' },
  },
]

function VoiceCalls() {
  return (
    <div>
      <PageHeader
        title="Voice Calls"
        subtitle="Tenants can call in a maintenance issue — it's transcribed and triaged automatically"
      >
        <button className="btn btn-ghost">Call line settings</button>
      </PageHeader>

      <div className="content">
        <div className="card">
          {calls.map((c) => (
            <div className="doc-row" key={c.name}>
              <div className="doc-icon">📞</div>
              <div>
                <div className="doc-name">{c.name}</div>
                <div className="doc-sub">{c.quote}</div>
              </div>
              <div className="extract-fields">
                <div className="extract-field">
                  Urgency
                  <b>{c.urgency}</b>
                </div>
                <div className="extract-field">
                  Trade
                  <b>{c.trade}</b>
                </div>
              </div>
              <div className={`confidence ${c.confidence.level}`}>{c.confidence.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default VoiceCalls
