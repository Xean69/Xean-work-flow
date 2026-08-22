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

// unitOptions: [{ value, label, rent_amount, property_id }] — the units
// this tenant can be assigned to (vacant units, plus the tenant's own
// current unit when editing). Proration and first-payment recording only
// apply when creating a tenant (isEditing is false) — an existing tenant
// already has payment history, so there's no "first period" left to set
// up. Addon selection applies to both create and edit, per the feature
// spec — a manager can change a tenant's addons at any time.
//
// isEditing must be passed explicitly rather than derived from
// initialValues: the "add tenant to this vacant unit" flow also passes a
// non-null initialValues (just { unit_id }) to preset the dropdown, and
// that's still a brand-new tenant, not an edit.
//
// addonOptions: [{ id, name, monthly_price, property_id }] — every addon
// across the business; filtered below to whichever property the selected
// unit belongs to.
function TenantForm({ initialValues, isEditing = false, unitOptions, addonOptions, onSubmit, onCancel }) {
  const [values, setValues] = useState(() => {
    const v = { ...emptyValues, ...initialValues }
    // A preset unit_id (from clicking "+ Add tenant" on a specific vacant
    // row) is set here in initial state rather than via the unit_id
    // <select>'s onChange, so handleUnitChange's auto-fill never runs for
    // it — fill rent from the matching unit up front instead.
    if (!isEditing && v.unit_id && !v.rent_amount) {
      const unit = unitOptions.find((opt) => String(opt.value) === String(v.unit_id))
      if (unit?.rent_amount != null) v.rent_amount = unit.rent_amount
    }
    return v
  })
  const [rentTouched, setRentTouched] = useState(false)
  const [firstPeriodOverride, setFirstPeriodOverride] = useState(null)
  const [recordFirstPayment, setRecordFirstPayment] = useState(false)
  const [paymentDateOverride, setPaymentDateOverride] = useState(null)
  const [paymentMethod, setPaymentMethod] = useState('e_transfer')
  // { [addon_id]: quantity } — presence of a key means the addon is
  // selected; quantity is the only value a manager can adjust here, never
  // price (that lives only on the Property Addons definition).
  const [selectedAddons, setSelectedAddons] = useState(() => {
    const map = {}
    for (const a of initialValues?.addons || []) map[a.addon_id] = a.quantity
    return map
  })
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

  function toggleAddon(addonId) {
    setSelectedAddons((prev) => {
      const next = { ...prev }
      if (addonId in next) delete next[addonId]
      else next[addonId] = 1
      return next
    })
  }

  function setAddonQuantity(addonId, quantity) {
    setSelectedAddons((prev) => ({ ...prev, [addonId]: quantity }))
  }

  const rentAmountNum = Number(values.rent_amount) || 0
  const proration = !isEditing ? calculateProration(values.lease_start, rentAmountNum) : null
  const defaultFirstPeriodAmount = proration ? proration.amount : rentAmountNum
  const firstPeriodAmount = firstPeriodOverride !== null ? firstPeriodOverride : defaultFirstPeriodAmount
  const paymentDate = paymentDateOverride !== null ? paymentDateOverride : values.lease_start || todayStr()

  // Selecting a different unit that belongs to a different property drops
  // any addons that no longer apply from the visible breakdown (and thus
  // from the submitted payload) — the same cross-property restriction the
  // server enforces, surfaced here rather than left to silently 400 later.
  const selectedUnit = unitOptions.find((opt) => String(opt.value) === String(values.unit_id))
  const availableAddons = (addonOptions || []).filter((a) => a.property_id === selectedUnit?.property_id)
  const addonBreakdown = availableAddons
    .filter((a) => a.id in selectedAddons)
    .map((a) => {
      const quantity = Number(selectedAddons[a.id]) || 1
      const unitPrice = Number(a.monthly_price)
      return { addon_id: a.id, name: a.name, quantity, unit_price: unitPrice, subtotal: quantity * unitPrice }
    })
  const addonsTotal = addonBreakdown.reduce((sum, a) => sum + a.subtotal, 0)
  const totalMonthlyAmount = rentAmountNum + addonsTotal

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
        addons: addonBreakdown.map((a) => ({ addon_id: a.addon_id, quantity: a.quantity })),
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

      {availableAddons.length > 0 && (
        <div className="form-field">
          <label>Addons</label>
          {availableAddons.map((addon) => {
            const checked = addon.id in selectedAddons
            return (
              <div className="addon-row" key={addon.id}>
                <label className="checkbox-label">
                  <input type="checkbox" checked={checked} onChange={() => toggleAddon(addon.id)} />
                  {addon.name} (${Number(addon.monthly_price).toFixed(2)}/mo each)
                </label>
                {checked && (
                  <input
                    type="number"
                    min="1"
                    step="1"
                    className="addon-qty-input"
                    value={selectedAddons[addon.id]}
                    onChange={(e) => setAddonQuantity(addon.id, e.target.value)}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}

      {addonBreakdown.length > 0 && (
        <div className="form-field proration-box">
          <label>Addons breakdown</label>
          <table>
            <thead>
              <tr>
                <th>Addon</th>
                <th>Qty</th>
                <th>Price each</th>
                <th>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {addonBreakdown.map((a) => (
                <tr key={a.addon_id}>
                  <td>{a.name}</td>
                  <td>{a.quantity}</td>
                  <td>${a.unit_price.toFixed(2)}</td>
                  <td>${a.subtotal.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ marginTop: 10, fontWeight: 600 }}>
            Total monthly amount (rent + addons): ${totalMonthlyAmount.toFixed(2)}
          </p>
        </div>
      )}

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
