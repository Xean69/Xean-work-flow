import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getProperties, createProperty } from '../api/client.js'
import PageHeader from '../components/PageHeader.jsx'
import StatCard from '../components/StatCard.jsx'
import Modal from '../components/Modal.jsx'
import PropertyForm from '../components/PropertyForm.jsx'
import './Dashboard.css'

// Placeholder data for the parts of the dashboard whose backend (maintenance,
// leases, document intake) doesn't exist yet. The Properties/Occupancy stats
// above them are real, computed from the database.
const activityFeed = [
  {
    dot: 'blue',
    text: (
      <>
        <strong>Lease extracted</strong> — 94 Street Unit 3B, rent $1,650, term confirmed to Apr
        2027
      </>
    ),
    time: 'TODAY · 9:12 AM',
  },
  {
    dot: 'amber',
    text: (
      <>
        <strong>New maintenance ticket</strong> — Cy Becker Rd, tenant reports no hot water,
        classified urgent / plumbing
      </>
    ),
    time: 'TODAY · 8:47 AM',
  },
  {
    dot: 'green',
    text: (
      <>
        <strong>Rent received</strong> — 177 Avenue Unit 1A, $1,450 deposited
      </>
    ),
    time: 'YESTERDAY · 6:02 PM',
  },
  {
    dot: 'blue',
    text: (
      <>
        <strong>Inspection report filed</strong> — 94 Street Unit 1A move-out, 3 deductions
        flagged
      </>
    ),
    time: 'YESTERDAY · 2:15 PM',
  },
  {
    dot: 'amber',
    text: (
      <>
        <strong>Renewal reminder sent</strong> — Cy Becker Rd Unit 2, lease ends Oct 15
      </>
    ),
    time: 'MON · 11:30 AM',
  },
]

const upcomingRenewals = [
  { name: 'Cy Becker Rd — Unit 2', sub: 'Marcus O. · ends Oct 15', pill: 'red', days: '18 DAYS' },
  { name: '177 Avenue — Unit 1A', sub: 'Sarah K. · ends Nov 2', pill: 'amber', days: '36 DAYS' },
  { name: '94 Street — Unit 3B', sub: 'D. Osei · ends Dec 1', pill: 'green', days: '65 DAYS' },
]

function Dashboard() {
  const [properties, setProperties] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    try {
      setProperties(await getProperties())
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate(values) {
    await createProperty(values)
    setShowForm(false)
    await load()
  }

  const totalUnits = properties.reduce((sum, p) => sum + p.unit_count, 0)
  const occupiedUnits = properties.reduce((sum, p) => sum + p.occupied_count, 0)
  const occupancyPct = totalUnits === 0 ? 0 : Math.round((occupiedUnits / totalUnits) * 100)
  const cities = [...new Set(properties.map((p) => p.city).filter(Boolean))]

  return (
    <div>
      <PageHeader title="Good morning" subtitle="Here's what's moving across your portfolio today">
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          + Add property
        </button>
      </PageHeader>

      <div className="content">
        <div className="stat-row">
          <StatCard
            label="Properties"
            value={loading ? '—' : properties.length}
            sub={cities.length ? `across ${cities.join(', ')}` : 'add your first property'}
          />
          <StatCard
            label="Occupancy"
            value={loading ? '—' : `${occupancyPct}%`}
            sub={totalUnits ? `${occupiedUnits}/${totalUnits} units occupied` : 'no units yet'}
            subVariant={occupancyPct >= 90 ? 'up' : undefined}
          />
          <StatCard label="Open maintenance" value="5" sub="2 flagged urgent" subVariant="warn" />
          <StatCard label="Leases expiring" value="3" sub="within 60 days" subVariant="warn" />
        </div>

        <div className="dash-grid">
          <div>
            <div className="section-head">
              <h2>Recent activity</h2>
              <span className="section-head-link">View all</span>
            </div>
            <div className="card feed">
              {activityFeed.map((item, i) => (
                <div className="feed-item" key={i}>
                  <div className={`feed-dot ${item.dot}`} />
                  <div>
                    <div className="feed-text">{item.text}</div>
                    <div className="feed-time mono">{item.time}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="section-head">
              <h2>Upcoming renewals</h2>
              <Link to="/tenants">View all</Link>
            </div>
            <div className="card">
              {upcomingRenewals.map((r) => (
                <div className="renewal-item" key={r.name}>
                  <div>
                    <div className="renewal-name">{r.name}</div>
                    <div className="renewal-sub">{r.sub}</div>
                  </div>
                  <span className={`pill pill-${r.pill}`}>{r.days}</span>
                </div>
              ))}
            </div>

            <div className="section-head">
              <h2>Intake queue</h2>
              <Link to="/documents">Open</Link>
            </div>
            <div className="card intake-card">
              <div className="intake-note">2 documents waiting for review</div>
              <Link to="/documents" className="btn btn-ghost intake-btn">
                Review extracted data
              </Link>
            </div>
          </div>
        </div>
      </div>

      {showForm && (
        <Modal title="Add property" onClose={() => setShowForm(false)}>
          <PropertyForm onSubmit={handleCreate} onCancel={() => setShowForm(false)} />
        </Modal>
      )}
    </div>
  )
}

export default Dashboard
