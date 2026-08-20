import { useState } from 'react'
import { Link } from 'react-router-dom'
import './TrialBanner.css'

// Dismiss lives in local component state, not localStorage — closing it
// hides it for the current session, but it's back on the next full
// load/login. This is a soft nag, not a one-and-done dismissal, since
// there's no enforcement behind it yet (no Stripe integration).
function TrialBanner({ admin }) {
  const [dismissed, setDismissed] = useState(false)

  if (admin.trial_status !== 'expired' || dismissed) return null

  return (
    <div className="trial-banner">
      <span>Your 14-day trial has ended — upgrade to keep full access.</span>
      <div className="trial-banner-actions">
        <Link to="/upgrade" className="btn btn-primary btn-sm">
          Upgrade
        </Link>
        <button
          type="button"
          className="trial-banner-dismiss"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  )
}

export default TrialBanner
