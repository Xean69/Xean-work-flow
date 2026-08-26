import { useEffect, useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { getMe, logout } from './staffApi.js'
import '../portal/portal.css'

// Guards every /staff/* route except login — same shape as the tenant
// portal's PortalLayout, a third parallel session type with its own guard.
// Only one page exists so far (My Tickets), so there's no nav to speak of
// yet beyond a brand header and logout.
function StaffLayout() {
  const [staff, setStaff] = useState(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    getMe()
      .then(setStaff)
      .catch(() => navigate('/staff/login', { replace: true }))
      .finally(() => setLoading(false))
  }, [])

  async function handleLogout() {
    await logout()
    navigate('/staff/login', { replace: true })
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
        <span style={{ fontSize: 13, color: 'var(--slate)' }}>
          {staff.first_name} {staff.last_name}
        </span>
        <button className="portal-logout" onClick={handleLogout}>
          Log out
        </button>
      </header>

      <main className="portal-main">
        <Outlet context={{ staff }} />
      </main>
    </div>
  )
}

export default StaffLayout
