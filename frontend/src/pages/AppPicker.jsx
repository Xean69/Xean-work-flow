import { useNavigate } from 'react-router-dom'
import './Login.css'

// The native iOS app's actual entry screen (capacitor.config.ts's
// server.url points here) — this one app now serves both managers and
// maintenance staff, so it needs to ask which portal to open before landing
// anywhere. Routing to /dashboard and /staff/tickets rather than straight to
// /login and /staff/login is deliberate: Layout.jsx and StaffLayout.jsx
// already redirect to their own login page on mount when there's no valid
// session, so an already-authenticated manager or staff member lands
// straight in their real portal with no extra logic needed here — this page
// only has to handle the choice, not the auth check.
function AppPicker() {
  const navigate = useNavigate()

  return (
    <div className="login-screen login-screen-branded">
      <div className="login-card">
        <div className="login-brand">
          <img src="/logo-nav.png" alt="Xean" className="login-mark" />
          <h1>Xean</h1>
        </div>
        <p className="login-sub">Continue as</p>

        <button
          type="button"
          className="btn btn-primary login-submit"
          onClick={() => navigate('/dashboard')}
        >
          Login as Manager
        </button>
        <button
          type="button"
          className="btn btn-primary login-submit"
          style={{ marginTop: 12 }}
          onClick={() => navigate('/staff/tickets')}
        >
          Login as Maintenance
        </button>
      </div>
    </div>
  )
}

export default AppPicker
