import PageHeader from '../components/PageHeader.jsx'
import './STRLicensing.css'

const thresholds = [
  {
    name: 'Cy Becker Summit — Unit 1',
    nights: '142 / 180 nights',
    pct: 79,
    warn: true,
    note: 'Approaching annual threshold — license renewal due Nov 30, 2026',
  },
  {
    name: '94 Street — Unit 3B',
    nights: '58 / 180 nights',
    pct: 32,
    warn: false,
    note: 'Well within threshold — license active until Mar 2027',
  },
]

function STRLicensing() {
  return (
    <div>
      <PageHeader
        title="STR Licensing"
        subtitle="Tracks occupied nights against Edmonton's short-term rental thresholds"
      >
        <button className="btn btn-ghost">Renewal settings</button>
      </PageHeader>

      <div className="content">
        {thresholds.map((t) => (
          <div className="thresh-card" key={t.name}>
            <div className="thresh-top">
              <div className="thresh-name">{t.name}</div>
              <div className="thresh-nights mono">{t.nights}</div>
            </div>
            <div className="thresh-bar">
              <div className={'thresh-fill' + (t.warn ? ' warn' : '')} style={{ width: `${t.pct}%` }} />
            </div>
            <div className="thresh-note">{t.note}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default STRLicensing
