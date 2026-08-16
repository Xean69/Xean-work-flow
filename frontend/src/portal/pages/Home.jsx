import { useOutletContext } from 'react-router-dom'

function formatMoney(amount) {
  return `$${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
}

function formatDate(value) {
  return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

// Days between today and a date — same "compare at midnight" approach used
// for the manager dashboard's own renewal-status calculation, so the two
// sides of the app agree on what "60 days away" means.
function daysUntil(dateStr) {
  const end = new Date(dateStr)
  end.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((end - today) / 86400000)
}

function Home() {
  const { tenant } = useOutletContext()
  const firstName = tenant.full_name.split(' ')[0]
  const daysLeft = daysUntil(tenant.lease_end)
  const showRenewalNotice = daysLeft <= 60

  return (
    <div>
      <p className="portal-greeting">Hi, {firstName}</p>

      <div className="portal-card">
        <h2>Your home</h2>
        <p>{tenant.property_name}</p>
        <p>
          {tenant.address}, {tenant.city}, {tenant.province} {tenant.postal_code}
        </p>
        <p>Unit {tenant.unit_number}</p>
      </div>

      {showRenewalNotice && (
        <div className="portal-notice">
          Your lease ends {formatDate(tenant.lease_end)}
          {daysLeft >= 0 ? ` — ${daysLeft} days away.` : '.'} Reach out to your property manager about renewing.
        </div>
      )}

      <div className="portal-card">
        <h2>Monthly rent</h2>
        <div className="portal-rent-amount">{formatMoney(tenant.rent_amount)}</div>
        <p style={{ marginTop: 8 }}>Contact your property manager for payment instructions.</p>
      </div>
    </div>
  )
}

export default Home
