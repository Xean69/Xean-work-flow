import PageHeader from '../components/PageHeader.jsx'
import { CONTACT_EMAIL } from '../components/TrialEnded.jsx'

// Reached from the trial banner's "Contact us" button. Billing is arranged
// directly with Xean (no payment processor yet), so this is a contact page,
// not a checkout. Kept at /upgrade so existing links keep working.
function Upgrade() {
  return (
    <div>
      <PageHeader title="Contact us" subtitle="Set up your Xean plan" />
      <div className="content">
        <div className="empty-state card">
          <h3>Talk to us about your plan</h3>
          <p>
            Plans are arranged directly with our team. Email us and we'll help you choose the right plan for your
            portfolio.
          </p>
          <p style={{ marginTop: 12 }}>
            <a href={`mailto:${CONTACT_EMAIL}`}>
              <strong>{CONTACT_EMAIL}</strong>
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}

export default Upgrade
