import { useEffect, useState } from 'react'
import { Outlet, useNavigate, NavLink } from 'react-router-dom'
import { getMe, logout } from './portalApi.js'
import './portal.css'

// Guards every /portal/* route except login: fetches the logged-in tenant
// once here (not on the /login page) and hands it down to Home/Lease via
// the router's outlet context, so neither page needs its own /me call.
function PortalLayout() {
  const [tenant, setTenant] = useState(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    getMe()
      .then(setTenant)
      .catch(() => navigate('/portal/login', { replace: true }))
      .finally(() => setLoading(false))
  }, [])

  async function handleLogout() {
    await logout()
    navigate('/portal/login', { replace: true })
  }

  if (loading) return <div className="portal-loading">Loading…</div>
  if (!tenant) return null

  return (
    <div className="portal-shell">
      <header className="portal-header">
        <span className="portal-brand">
          Xean <span>Intake</span>
        </span>
        <button className="portal-logout" onClick={handleLogout}>
          Log out
        </button>
      </header>

      <main className="portal-main">
        <Outlet context={{ tenant }} />
      </main>

      <nav className="portal-tabbar">
        <NavLink to="/portal/home" className={({ isActive }) => 'portal-tab' + (isActive ? ' active' : '')}>
          <span className="portal-tab-icon">🏠</span>
          Home
        </NavLink>
        <NavLink to="/portal/lease" className={({ isActive }) => 'portal-tab' + (isActive ? ' active' : '')}>
          <span className="portal-tab-icon">📄</span>
          Lease
        </NavLink>
      </nav>
    </div>
  )
}

export default PortalLayout
