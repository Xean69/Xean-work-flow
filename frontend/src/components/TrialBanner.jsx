import { useState } from 'react'
import { Link } from 'react-router-dom'
import './TrialBanner.css'

// Shown only while the business is inside its 14-day trial (status
// "trial"). Once it lapses, Layout replaces the whole dashboard with the
// TrialEnded page instead, so there's no "expired" variant here. Exempt and
// paid businesses never see it. Dismiss is component state only — it comes
// back on the next full load, so the countdown stays visible.
function TrialBanner({ admin }) {
  const [dismissed, setDismissed] = useState(false)
  const trial = admin?.trial

  if (!trial || trial.status !== 'trial' || dismissed) return null

  const days = trial.days_left
  const text = days === 1 ? '1 day left in your free trial.' : `${days} days left in your free trial.`

  return (
    <div className="trial-banner">
      <span>{text}</span>
      <div className="trial-banner-actions">
        <Link to="/upgrade" className="btn btn-primary btn-sm">
          Contact us
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
