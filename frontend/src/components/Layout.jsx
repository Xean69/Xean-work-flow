import { useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import Sidebar from './Sidebar.jsx'
import { getMe, logout } from '../api/client.js'

// Guards every dashboard route: fetches the logged-in admin once here (not
// on the /login page) and redirects to /login if there isn't one. Mirrors
// the tenant portal's PortalLayout, but this is a wholly separate auth
// check — an admin session and a tenant session share nothing.
function Layout() {
  const [admin, setAdmin] = useState(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    getMe()
      .then(setAdmin)
      .catch(() => navigate('/login', { replace: true, state: { from: location.pathname } }))
      .finally(() => setLoading(false))
  }, [])

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  if (loading) return null
  if (!admin) return null

  return (
    <div className="shell">
      <Sidebar admin={admin} onLogout={handleLogout} />
      <div className="main">
        <Outlet />
      </div>
    </div>
  )
}

export default Layout
