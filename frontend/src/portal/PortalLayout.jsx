import { useEffect, useState } from 'react'
import { Outlet, useNavigate, useLocation, NavLink } from 'react-router-dom'
import { getMe, logout } from './portalApi.js'
import PortalOfflineBanner from './PortalOfflineBanner.jsx'
import './portal.css'

const NAV_ITEMS = [
  { to: '/portal/home', label: 'Home', icon: '🏠' },
  { to: '/portal/repairs', label: 'Repairs', icon: '🔧' },
  { to: '/portal/messages', label: 'Messages', icon: '💬' },
  { to: '/portal/addons', label: 'Add-ons', icon: '💳' },
  { to: '/portal/lease', label: 'Lease', icon: '📄' },
]

// Guards every /portal/* route except login: fetches the logged-in tenant
// once here (not on the /login page) and hands it down to every page via
// the router's outlet context, so no page needs its own /me call.
function PortalLayout() {
  const [tenant, setTenant] = useState(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    getMe()
      .then(setTenant)
      .catch(() => navigate('/portal/login', { replace: true }))
      .finally(() => setLoading(false))
  }, [])

  // React Router doesn't reset scroll position on navigation the way a
  // full page load does. Without this, switching from a tall page (e.g.
  // Repairs with several cards) to a short one can leave the view scrolled
  // partway down, letting the fixed bottom tab bar visually sit on top of
  // page content instead of below it.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  async function handleLogout() {
    await logout()
    navigate('/portal/login', { replace: true })
  }

  if (loading) return <div className="portal-loading">Loading…</div>
  if (!tenant) return null

  return (
    <div className="portal-shell">
      <PortalOfflineBanner />
      <header className="portal-header">
        <span className="portal-brand-group">
          <img src="/pwa-192x192.png" alt="" className="portal-brand-mark" />
          <span className="portal-brand">Xean</span>
        </span>

        {/* Same links as the bottom tab bar — CSS decides which one shows
            based on viewport width, so there's only one nav to keep in sync. */}
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

      <main className="portal-main">
        <Outlet context={{ tenant }} />
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

export default PortalLayout
