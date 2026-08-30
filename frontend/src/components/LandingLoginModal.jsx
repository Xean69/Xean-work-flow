import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'

// Three unchanged, existing login routes — this modal only changes how a
// visitor gets to one of them from the public site, never what happens
// once they're there.
const OPTIONS = [
  { icon: '🧑‍💼', label: 'Login as Manager', to: '/login', desc: 'Manage your properties, tenants, and team.' },
  { icon: '🏠', label: 'Login as Tenant', to: '/portal/login', desc: 'Your lease, payments, and messages.' },
  { icon: '🔧', label: 'Login as Maintenance', to: '/staff/login', desc: 'View and manage your assigned tickets.' },
]

// Deliberately its own component rather than reusing the dashboard's
// Modal.jsx — that one is styled for the light/parchment dashboard theme
// (src/styles/ui.css), not this dark navy/champagne public-site theme.
//
// Rendered via a portal straight into document.body rather than in place
// in LandingNav's tree: LandingNav sits inside `.lnd-wrap`, which sets its
// own `position: relative` + `z-index` and therefore creates a stacking
// context — a fixed-position child confined to *that* context never
// actually out-ranks sibling sections like the hero, no matter how high
// its own z-index is set. A portal escapes that entirely.
function LandingLoginModal({ onClose }) {
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return createPortal(
    <div className="lnd-login-modal-backdrop" onClick={onClose}>
      <div className="lnd-login-modal" onClick={(e) => e.stopPropagation()}>
        <div className="lnd-login-modal-header">
          <h3>Log in to Xean</h3>
          <button type="button" className="lnd-login-modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="lnd-login-modal-grid">
          {OPTIONS.map((opt) => (
            <Link key={opt.to} to={opt.to} className="lnd-login-modal-card">
              <div className="lnd-login-modal-card-icon">{opt.icon}</div>
              <div className="lnd-login-modal-card-label">{opt.label}</div>
              <p className="lnd-login-modal-card-desc">{opt.desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>,
    document.body
  )
}

export default LandingLoginModal
