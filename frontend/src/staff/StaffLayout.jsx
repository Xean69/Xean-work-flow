import { useEffect, useRef, useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { getMe, logout, setMyStatus } from './staffApi.js'
import { usePushSubscription } from './usePushSubscription.js'
import '../portal/portal.css'
import './staff.css'

const NAV_ITEMS = [
  { to: '/staff/tickets', label: 'My Tickets', icon: '🔧' },
  { to: '/staff/messages', label: 'Messages', icon: '💬' },
  { to: '/staff/settings', label: 'Settings', icon: '⚙️' },
]

// How often the heartbeat pings while the tab is open — see schema.sql's
// presence note. There's no dedicated heartbeat endpoint: this just reuses
// GET /me, since requireStaffAuth already stamps last_active_at on every
// authenticated request regardless of which one it is.
const HEARTBEAT_INTERVAL_MS = 60_000

// Guards every /staff/* route except login — same shape as the tenant
// portal's PortalLayout, a third parallel session type with its own guard.
function StaffLayout() {
  const [staff, setStaff] = useState(null)
  const [loading, setLoading] = useState(true)
  const [awayDraftOpen, setAwayDraftOpen] = useState(false)
  const [awayNoteDraft, setAwayNoteDraft] = useState('')
  const [pushDismissed, setPushDismissed] = useState(false)
  const navigate = useNavigate()
  const heartbeatRef = useRef(null)
  const { permission: pushPermission, subscribe: subscribeToPush } = usePushSubscription()

  useEffect(() => {
    getMe()
      .then(setStaff)
      .catch(() => navigate('/staff/login', { replace: true }))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    heartbeatRef.current = setInterval(() => {
      getMe().catch(() => {})
    }, HEARTBEAT_INTERVAL_MS)
    return () => clearInterval(heartbeatRef.current)
  }, [])

  async function handleLogout() {
    await logout()
    navigate('/staff/login', { replace: true })
  }

  function openAwayDraft() {
    setAwayNoteDraft('')
    setAwayDraftOpen(true)
  }

  async function confirmAway() {
    const updated = await setMyStatus(true, awayNoteDraft.trim() || undefined)
    setStaff((prev) => ({ ...prev, ...updated }))
    setAwayDraftOpen(false)
  }

  async function setAvailable() {
    const updated = await setMyStatus(false, undefined)
    setStaff((prev) => ({ ...prev, ...updated }))
  }

  if (loading) return <div className="portal-loading">Loading…</div>
  if (!staff) return null

  return (
    <div className="portal-shell">
      <header className="portal-header">
        <span className="portal-brand-group">
          <img src="/logo-nav.png" alt="" className="portal-brand-mark" />
          <span className="portal-brand">Xean</span>
        </span>

        <nav className="portal-topnav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => 'portal-topnav-link' + (isActive ? ' active' : '')}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <button className="portal-logout" onClick={handleLogout}>
          Log out
        </button>
      </header>

      {pushPermission === 'default' && !pushDismissed && (
        <div className="portal-push-banner">
          <span>Enable notifications to hear about new tickets and messages right away.</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button type="button" className="portal-btn portal-btn-primary" style={{ padding: '6px 12px', fontSize: 12.5 }} onClick={subscribeToPush}>
              Enable
            </button>
            <button type="button" className="portal-push-banner-dismiss" onClick={() => setPushDismissed(true)} aria-label="Dismiss">
              ×
            </button>
          </div>
        </div>
      )}

      <div className="staff-status-bar">
        <span style={{ fontSize: 13, color: 'var(--slate)' }}>
          {staff.first_name} {staff.last_name}
        </span>
        {staff.away ? (
          <span className="staff-status-away">
            🟡 Away{staff.away_note ? ` — ${staff.away_note}` : ''}
            <button className="staff-status-link" onClick={setAvailable}>
              Set available
            </button>
          </span>
        ) : awayDraftOpen ? (
          <span className="staff-status-away-form">
            <input
              value={awayNoteDraft}
              onChange={(e) => setAwayNoteDraft(e.target.value)}
              placeholder="Optional note, e.g. Back Sept 5"
              autoFocus
            />
            <button className="staff-status-link" onClick={confirmAway}>
              Confirm
            </button>
            <button className="staff-status-link" onClick={() => setAwayDraftOpen(false)}>
              Cancel
            </button>
          </span>
        ) : (
          <span className="staff-status-online">
            🟢 Available
            <button className="staff-status-link" onClick={openAwayDraft}>
              Set away
            </button>
          </span>
        )}
      </div>

      <main className="portal-main">
        <Outlet context={{ staff }} />
      </main>

      <nav className="portal-tabbar">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.to} to={item.to} className={({ isActive }) => 'portal-tab' + (isActive ? ' active' : '')}>
            <span className="portal-tab-icon">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

export default StaffLayout
