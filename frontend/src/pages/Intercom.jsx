import PageHeader from '../components/PageHeader.jsx'

function Intercom() {
  return (
    <div>
      <PageHeader title="Intercom" subtitle="Manage building intercom access from one place" />

      <div className="content">
        <div className="empty-state card">
          <h3>Coming soon</h3>
          <p>Intercom integration is on the roadmap — check back soon.</p>
        </div>
      </div>
    </div>
  )
}

export default Intercom
