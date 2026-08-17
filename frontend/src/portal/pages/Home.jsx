import { useOutletContext } from 'react-router-dom'

const PAYMENT_STATUS_LABEL = { paid: 'Paid', partial: 'Partial', unpaid: 'Due' }
const PAYMENT_STATUS_VARIANT = { paid: 'green', partial: 'amber', unpaid: 'red' }

function formatMoney(amount) {
  return `$${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
}

function formatDate(value) {
  return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

// "2026-08" -> "August 2026" — parsed as separate year/month numbers rather
// than new Date("2026-08"), which JS reads as UTC midnight and can display
// as the previous month in a negative-UTC-offset timezone.
function formatPeriod(period) {
  const [year, month] = period.split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
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

      {showRenewalNotice && (
        <div className="portal-notice">
          Your lease ends {formatDate(tenant.lease_end)}
          {daysLeft >= 0 ? ` — ${daysLeft} days away.` : '.'} Reach out to your property manager about renewing.
        </div>
      )}

      <div className="portal-grid-2">
        <div className="portal-card">
          <h2>Your home</h2>
          <p>{tenant.property_name}</p>
          <p>
            {tenant.address}, {tenant.city}, {tenant.province} {tenant.postal_code}
          </p>
          <p>Unit {tenant.unit_number}</p>
        </div>

        <div className="portal-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
            <h2>Monthly rent</h2>
            <span className={`portal-badge portal-badge-${PAYMENT_STATUS_VARIANT[tenant.payment_status]}`}>
              {PAYMENT_STATUS_LABEL[tenant.payment_status]}
            </span>
          </div>
          <div className="portal-rent-amount">{formatMoney(tenant.rent_amount)}</div>
          <p style={{ marginTop: 8 }}>
            {tenant.payment_status === 'paid' && `Paid in full for ${formatPeriod(tenant.current_period)}.`}
            {tenant.payment_status === 'partial' &&
              `Partially paid for ${formatPeriod(tenant.current_period)} — contact your property manager about the remaining balance.`}
            {tenant.payment_status === 'unpaid' &&
              `Not yet marked paid for ${formatPeriod(tenant.current_period)}. Contact your property manager for payment instructions.`}
          </p>
        </div>
      </div>
    </div>
  )
}

export default Home
