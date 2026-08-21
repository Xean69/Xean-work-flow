import { useState } from 'react'

const emptyValues = {
  unit_id: '',
  full_name: '',
  email: '',
  phone: '',
  lease_start: '',
  lease_end: '',
  rent_amount: '',
  deposit_amount: '',
}

const METHOD_LABELS = {
  e_transfer: 'E-transfer',
  cash: 'Cash',
  cheque: 'Cheque',
  other: 'Other',
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

// Standard inclusive-of-move-in-day proration: a lease starting on day D
// of a month with T days covers T - D + 1 days of that month. Returns
// null when the lease starts on the 1st — nothing to prorate.
function calculateProration(leaseStart, monthlyRent) {
  if (!leaseStart || !monthlyRent) return null
  const [year, month, day] = leaseStart.split('-').map(Number)
  if (!year || !month || !day || day === 1) return null
  const daysInMonth = new Date(year, month, 0).getDate()
  const daysRemaining = daysInMonth - day + 1
  return {
    day,
    daysRemaining,
    daysInMonth,
    amount: Math.round((daysRemaining / daysInMonth) * monthlyRent * 100) / 100,
  }
}

function formatMonthDay(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// unitOptions: [{ value, label, rent_amount }] — the units this tenant can
// be assigned to (vacant units, plus the tenant's own current unit when
// editing). Proration and first-payment recording only apply when
// creating a tenant (initialValues is unset) — an existing tenant already
// has payment history, so there's no "first period" left to set up.
function TenantForm({ initialValues, unitOptions, onSubmit, onCancel }) {
  const isEditing = !!initialValues
  const [values, setValues] = useState({ ...emptyValues, ...initialValues })
  const [rentTouched, setRentTouched] = useState(false)
  const [firstPeriodOverride, setFirstPeriodOverride] = useState(null)
  const [recordFirstPayment, setRecordFirstPayment] = useState(false)
  const [paymentDateOverride, setPaymentDateOverride] = useState(null)
  const [paymentMethod, setPaymentMethod] = useState('e_transfer')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function handleChange(e) {
    const { name, value } = e.target
    if (name === 'rent_amount') setRentTouched(true)
    setValues((v) => ({ ...v, [name]: value }))
  }

  // Auto-fills rent from the selected unit's listed price — but only if
  // the manager hasn't already typed a custom rent value, so a deliberate
  // override (e.g. a negotiated rate) never gets clobbered by re-picking a
  // unit.
  function handleUnitChange(e) {
    const unitId = e.target.value
    const unit = unitOptions.find((opt) => String(opt.value) === unitId)
    setValues((v) => ({
      ...v,
      unit_id: unitId,
      rent_amount: !rentTouched && unit?.rent_amount != null ? unit.rent_amount : v.rent_amount,
    }))
  }

  const rentAmountNum = Number(values.rent_amount) || 0
  const proration = !isEditing ? calculateProration(values.lease_start, rentAmountNum) : null
  const defaultFirstPeriodAmount = proration ? proration.amount : rentAmountNum
  const firstPeriodAmount = firstPeriodOverride !== null ? firstPeriodOverride : defaultFirstPeriodAmount
  const paymentDate = paymentDateOverride !== null ? paymentDateOverride : values.lease_start || todayStr()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const payload = {
        ...values,
        unit_id: Number(values.unit_id),
        rent_amount: rentAmountNum,
        deposit_amount: Number(values.deposit_amount || 0),
      }
      if (proration) {
        payload.first_period_rent_amount = Number(firstPeriodAmount)
      }
      if (!isEditing && recordFirstPayment) {
        payload.first_payment = {
          amount: Number(firstPeriodAmount),
          payment_date: paymentDate,
          method: paymentMethod,
        }
      }
      await onSubmit(payload)
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <p className="form-error">{error}</p>}

      <div className="form-field">
        <label htmlFor="unit_id">Property / Unit</label>
        <select id="unit_id" name="unit_id" value={values.unit_id} onChange={handleUnitChange} required>
          <option value="" disabled>
            Select a unit…
          </option>
          {unitOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="form-field">
        <label htmlFor="full_name">Full name</label>
        <input
          id="full_name"
          name="full_name"
          value={values.full_name}
          onChange={handleChange}
          placeholder="e.g. Sarah K."
          required
        />
      </div>

      <div className="form-row">
        <div className="form-field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" value={values.email} onChange={handleChange} />
        </div>
        <div className="form-field">
          <label htmlFor="phone">Phone</label>
          <input id="phone" name="phone" value={values.phone} onChange={handleChange} />
        </div>
      </div>

      <div className="form-row">
        <div className="form-field">
          <label htmlFor="lease_start">Lease start</label>
          <input
            id="lease_start"
            name="lease_start"
            type="date"
            value={values.lease_start}
            onChange={handleChange}
            required
          />
        </div>
        <div className="form-field">
          <label htmlFor="lease_end">Lease end</label>
          <input
            id="lease_end"
            name="lease_end"
            type="date"
            value={values.lease_end}
            onChange={handleChange}
            required
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-field">
          <label htmlFor="rent_amount">Monthly rent ($)</label>
          <input
            id="rent_amount"
            name="rent_amount"
            type="number"
            min="0"
            step="0.01"
            value={values.rent_amount}
            onChange={handleChange}
            required
          />
        </div>
        <div className="form-field">
          <label htmlFor="deposit_amount">Deposit ($)</label>
          <input
            id="deposit_amount"
            name="deposit_amount"
            type="number"
            min="0"
            step="0.01"
            value={values.deposit_amount}
            onChange={handleChange}
          />
        </div>
      </div>

      {proration && (
        <div className="form-field proration-box">
          <label htmlFor="first_period_amount">
            First month's rent, prorated — lease starts {formatMonthDay(values.lease_start)} ({proration.daysRemaining}{' '}
            of {proration.daysInMonth} days)
          </label>
          <input
            id="first_period_amount"
            type="number"
            min="0.01"
            step="0.01"
            value={firstPeriodAmount}
            onChange={(e) => setFirstPeriodOverride(e.target.value)}
          />
        </div>
      )}

      {!isEditing && (
        <div className="form-field">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={recordFirstPayment}
              onChange={(e) => setRecordFirstPayment(e.target.checked)}
            />
            Record this as the tenant's first rent payment
          </label>
        </div>
      )}

      {!isEditing && recordFirstPayment && (
        <div className="form-row">
          <div className="form-field">
            <label htmlFor="first_payment_date">Payment date</label>
            <input
              id="first_payment_date"
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDateOverride(e.target.value)}
              required
            />
          </div>
          <div className="form-field">
            <label htmlFor="first_payment_method">Method</label>
            <select
              id="first_payment_method"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
            >
              {Object.entries(METHOD_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save tenant'}
        </button>
      </div>
    </form>
  )
}

export default TenantForm
