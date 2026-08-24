import { useOutletContext } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

const PAYMENT_STATUS_VARIANT = { paid: 'green', partial: 'amber', unpaid: 'red' }

function formatMoney(amount) {
  return `$${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
}

function formatDate(value, locale) {
  return new Date(value).toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' })
}

// "2026-08" -> "August 2026" — parsed as separate year/month numbers rather
// than new Date("2026-08"), which JS reads as UTC midnight and can display
// as the previous month in a negative-UTC-offset timezone.
function formatPeriod(period, locale) {
  const [year, month] = period.split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' })
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
  const { t, i18n } = useTranslation('portal-home')
  const firstName = tenant.full_name.split(' ')[0]
  const daysLeft = daysUntil(tenant.lease_end)
  const showRenewalNotice = daysLeft <= 60

  return (
    <div>
      <p className="portal-greeting">{t('greeting', { firstName })}</p>

      {showRenewalNotice && (
        <div className="portal-notice">
          {daysLeft >= 0
            ? t('renewalNoticeWithDays', { date: formatDate(tenant.lease_end, i18n.language), count: daysLeft })
            : t('renewalNoticeOverdue', { date: formatDate(tenant.lease_end, i18n.language) })}
        </div>
      )}

      <div className="portal-grid-2">
        <div className="portal-card">
          <h2>{t('yourHome')}</h2>
          <p>{tenant.property_name}</p>
          <p>
            {tenant.address}, {tenant.city}, {tenant.province} {tenant.postal_code}
          </p>
          <p>{t('unit', { unitNumber: tenant.unit_number })}</p>
        </div>

        <div className="portal-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
            <h2>{t('monthlyRent')}</h2>
            <span className={`portal-badge portal-badge-${PAYMENT_STATUS_VARIANT[tenant.payment_status]}`}>
              {t(`paymentStatus.${tenant.payment_status}`)}
            </span>
          </div>
          <div className="portal-rent-amount">{formatMoney(tenant.rent_amount)}</div>
          <p style={{ marginTop: 8 }}>
            {tenant.payment_status === 'paid' && t('paidInFull', { period: formatPeriod(tenant.current_period, i18n.language) })}
            {tenant.payment_status === 'partial' && t('partiallyPaid', { period: formatPeriod(tenant.current_period, i18n.language) })}
            {tenant.payment_status === 'unpaid' && t('notYetPaid', { period: formatPeriod(tenant.current_period, i18n.language) })}
          </p>
        </div>
      </div>
    </div>
  )
}

export default Home
