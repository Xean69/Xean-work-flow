import { useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import Sidebar from './Sidebar.jsx'
import { getMe, logout } from '../api/client.js'
import { canAccessPath, defaultRouteForRole } from '../utils/permissions.js'
import './Layout.css'

// Guards every dashboard route: fetches the logged-in admin once here (not
// on the /login page) and redirects to /login if there isn't one. Mirrors
// the tenant portal's PortalLayout, but this is a wholly separate auth
// check — an admin session and a tenant session share nothing.
//
// Also enforces role-based page access: if the current route isn't one
// this admin's role can use (e.g. an accountant hitting /properties,
// typed directly or left over from before their role changed), they're
// bounced to a route their role can actually reach. This is UX only — the
// backend's requireRole checks are what actually stop the request if
// someone skips the UI entirely.
function Layout() {
  const [admin, setAdmin] = useState(null)
  const [loading, setLoading] = useState(true)
  // Sidebar is always visible at desktop width; below the mobile breakpoint
  // (see Sidebar.css) it becomes an off-canvas drawer that this controls.
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    getMe()
      .then(setAdmin)
      .catch(() => navigate('/login', { replace: true, state: { from: location.pathname } }))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!admin) return
    if (!canAccessPath(admin.role, location.pathname)) {
      navigate(defaultRouteForRole(admin.role), { replace: true })
    }
  }, [admin, location.pathname])

  // Close the mobile drawer on every navigation — otherwise it stays open
  // over the page you just picked.
  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  if (loading) return null
  if (!admin) return null

  // Don't mount the page for a route this role can't access, even for the
  // one render before the redirect effect above fires — otherwise its own
  // data fetch briefly fires (and 403s) before the redirect takes over.
  const allowed = canAccessPath(admin.role, location.pathname)

  return (
    <div className="shell">
      {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}
      <Sidebar admin={admin} onLogout={handleLogout} open={sidebarOpen} />
      <div className="main">
        <div className="mobile-topbar">
          <button
            type="button"
            className="mobile-menu-btn"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          <div className="mobile-topbar-brand">
            Xean <span>Intake</span>
          </div>
        </div>
        {allowed && <Outlet context={{ admin }} />}
      </div>
    </div>
  )
}

export default Layout
