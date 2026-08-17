import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getProperties, createProperty, getMaintenanceRequests, getTenants, getRecentActivity, getDocuments } from '../api/client.js'
import PageHeader from '../components/PageHeader.jsx'
import StatCard from '../components/StatCard.jsx'
import Modal from '../components/Modal.jsx'
import PropertyForm from '../components/PropertyForm.jsx'
import './Dashboard.css'

const RENEWAL_PILL = { urgent_renewal: 'red', renewal_due: 'amber', active: 'green' }

function daysUntil(dateStr) {
  const end = new Date(dateStr)
  end.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((end - today) / 86400000)
}

// "2 hours ago", "Yesterday", etc. Computed client-side from a raw
// timestamp (rather than a pre-formatted string from the API) so it stays
// accurate without needing a fresh API call if the tab's left open a while.
function formatRelativeTime(value) {
  const diffMs = Date.now() - new Date(value).getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? '' : 's'} ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay === 1) return 'Yesterday'
  if (diffDay < 7) return `${diffDay} days ago`
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function Dashboard() {
  const [properties, setProperties] = useState([])
  const [maintenance, setMaintenance] = useState([])
  const [tenantRows, setTenantRows] = useState([])
  const [activity, setActivity] = useState([])
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    try {
      const [props, maintenanceRows, tenants, activityRows, documentRows] = await Promise.all([
        getProperties(),
        getMaintenanceRequests(),
        getTenants(),
        getRecentActivity(),
        getDocuments(),
      ])
      setProperties(props)
      setMaintenance(maintenanceRows)
      setTenantRows(tenants)
      setActivity(activityRows)
      setDocuments(documentRows)
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

  const openMaintenance = maintenance.filter((m) => m.status !== 'resolved')
  const urgentMaintenanceCount = openMaintenance.filter((m) => m.priority === 'high').length

  const leasedTenants = tenantRows.filter((t) => t.tenant_id)
  const expiringLeaseCount = leasedTenants.filter(
    (t) => t.status === 'urgent_renewal' || t.status === 'renewal_due'
  ).length

  const upcomingRenewals = [...leasedTenants]
    .sort((a, b) => new Date(a.lease_end) - new Date(b.lease_end))
    .slice(0, 3)

  const needsReviewCount = documents.filter((d) => d.status === 'needs_review').length

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
          <StatCard
            label="Open maintenance"
            value={loading ? '—' : openMaintenance.length}
            sub={urgentMaintenanceCount > 0 ? `${urgentMaintenanceCount} flagged urgent` : 'none flagged urgent'}
            subVariant={urgentMaintenanceCount > 0 ? 'warn' : undefined}
          />
          <StatCard
            label="Leases expiring"
            value={loading ? '—' : expiringLeaseCount}
            sub="within 60 days"
            subVariant={expiringLeaseCount > 0 ? 'warn' : undefined}
          />
        </div>

        <div className="dash-grid">
          <div>
            <div className="section-head">
              <h2>Recent activity</h2>
              <span className="section-head-link">View all</span>
            </div>
            <div className="card feed">
              {!loading && activity.length === 0 && <div className="board-empty">No recent activity yet.</div>}
              {activity.map((item, i) => (
                <div className="feed-item" key={i}>
                  <div className={`feed-dot ${item.dot}`} />
                  <div>
                    <div className="feed-text">{item.text}</div>
                    <div className="feed-time mono">{formatRelativeTime(item.timestamp)}</div>
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
              {!loading && upcomingRenewals.length === 0 && <div className="board-empty">No active leases yet.</div>}
              {upcomingRenewals.map((r) => {
                const days = daysUntil(r.lease_end)
                return (
                  <div className="renewal-item" key={r.unit_id}>
                    <div>
                      <div className="renewal-name">
                        {r.property_name} — {r.unit_number}
                      </div>
                      <div className="renewal-sub">
                        {r.full_name} · ends {new Date(r.lease_end).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </div>
                    </div>
                    <span className={`pill pill-${RENEWAL_PILL[r.status] ?? 'green'}`}>
                      {days >= 0 ? `${days} DAYS` : 'OVERDUE'}
                    </span>
                  </div>
                )
              })}
            </div>

            <div className="section-head">
              <h2>Intake queue</h2>
              <Link to="/documents">Open</Link>
            </div>
            <div className="card intake-card">
              <div className="intake-note">
                {loading
                  ? 'Loading…'
                  : needsReviewCount > 0
                    ? `${needsReviewCount} document${needsReviewCount === 1 ? '' : 's'} waiting for review`
                    : 'All documents reviewed'}
              </div>
              <Link to="/documents" className="btn btn-ghost intake-btn">
                {needsReviewCount > 0 ? 'Review documents' : 'View documents'}
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
