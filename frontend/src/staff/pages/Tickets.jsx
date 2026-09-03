import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getMyTickets } from '../staffApi.js'

const STATUS_LABEL = { new: 'New', in_progress: 'In progress', resolved: 'Resolved' }
const STATUS_VARIANT = { new: 'slate', in_progress: 'amber', resolved: 'green' }

function formatDate(value) {
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

// entry_date is a plain calendar date (no time component) — reading it in
// UTC avoids rolling it back a day in a negative-UTC-offset timezone, same
// reasoning as Maintenance.jsx's and PrintableTicket.jsx's own copies of
// this helper.
function formatEntryDate(value) {
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function Tickets() {
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    try {
      setTickets(await getMyTickets())
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <p className="portal-greeting" style={{ fontSize: 20 }}>
        My Tickets
      </p>

      {!loading && tickets.length === 0 && (
        <div className="portal-card">
          <p>Nothing assigned to you right now.</p>
        </div>
      )}

      {tickets.map((t) => (
        <div
          className="portal-card"
          key={t.id}
          onClick={() => navigate(`/staff/tickets/${t.id}`)}
          style={{ cursor: 'pointer' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
            <h2>{t.title}</h2>
            <span className={`portal-badge portal-badge-${STATUS_VARIANT[t.status]}`}>
              {STATUS_LABEL[t.status]}
            </span>
          </div>
          <p style={{ marginTop: 6, fontSize: 12.5, color: 'var(--slate)' }}>
            {t.property_name} · {t.unit_number}
            {t.tenant_name ? ` · ${t.tenant_name}` : ''}
          </p>
          {t.entry_permission != null && (
            <div className={'portal-entry-tag ' + (t.entry_permission ? 'portal-entry-tag-granted' : 'portal-entry-tag-denied')}>
              {t.entry_permission ? `🔑 Entry OK — ${formatEntryDate(t.entry_date)}` : '🔒 No entry permission'}
            </div>
          )}
          {t.description && <p style={{ marginTop: 6 }}>{t.description}</p>}
          <p style={{ marginTop: 8, fontSize: 11.5 }}>Reported {formatDate(t.created_at)}</p>
        </div>
      ))}
    </div>
  )
}

export default Tickets
