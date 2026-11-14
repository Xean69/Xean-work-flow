import './TrialEnded.css'

export const CONTACT_EMAIL = 'hrsupport@xean.ca'

// Replaces the whole dashboard (sidebar included) once the business's trial
// has lapsed — see Layout. The backend enforces the same lock on every
// manager API route (402 "trial_expired"), so this is the UI half of it,
// not the security boundary. Nothing is deleted; tenants and maintenance
// staff keep working the whole time.
function TrialEnded({ admin, onLogout }) {
  return (
    <div className="trial-ended">
      <div className="trial-ended-card card">
        <img src="/logo-nav.png" alt="Xean" className="trial-ended-logo" />
        <h1>{admin?.trial?.paid_until ? 'Your plan has ended' : 'Your trial has ended'}</h1>
        <p>
          {/* A business that had a paid period which then lapsed lands here
              too (same "expired" status) — don't call that a trial. */}
          {admin?.trial?.paid_until ? 'The paid period' : 'The 14-day trial'} for{' '}
          <strong>{admin?.business_name ?? 'your business'}</strong> has ended, so access to the manager dashboard is
          paused. Your data is kept, and your tenants and maintenance staff can keep using Xean in the meantime.
        </p>
        <p>To continue, contact us and we'll set up your plan:</p>
        <a className="trial-ended-email" href={`mailto:${CONTACT_EMAIL}`}>
          {CONTACT_EMAIL}
        </a>
        <button type="button" className="btn btn-ghost trial-ended-logout" onClick={onLogout}>
          Log out
        </button>
      </div>
    </div>
  )
}

export default TrialEnded
