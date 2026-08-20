import PageHeader from '../components/PageHeader.jsx'

function Upgrade() {
  return (
    <div>
      <PageHeader title="Upgrade" subtitle="Keep full access to your dashboard" />
      <div className="content">
        <div className="empty-state card">
          <h3>Payment setup coming soon</h3>
          <p>We're wiring up billing — check back shortly to upgrade your account.</p>
        </div>
      </div>
    </div>
  )
}

export default Upgrade
