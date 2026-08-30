import PageHeader from '../components/PageHeader.jsx'

function Leases() {
  return (
    <div>
      <PageHeader title="Leases" subtitle="Create and manage lease agreements from one place" />

      <div className="content">
        <div className="empty-state card">
          <h3>Coming soon</h3>
          <p>Lease creation is on the roadmap — check back soon.</p>
        </div>
      </div>
    </div>
  )
}

export default Leases
