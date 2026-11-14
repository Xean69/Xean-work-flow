import { useEffect, useState } from 'react'
import { Navigate, useOutletContext } from 'react-router-dom'
import PageHeader from '../components/PageHeader.jsx'
import { getPlatformBusinesses, updatePlatformBusiness } from '../api/client.js'
import { defaultRouteForRole } from '../utils/permissions.js'
import './PlatformBusinesses.css'

// Platform-owner billing admin. Only an admin with is_platform_owner can
// open it: everyone else is redirected away here, and the API behind it
// (backend/src/routes/platform.js) answers 404 regardless of the UI.
// "Paid until" is a calendar date meaning paid through the end of that day
// (UTC); changes take effect on that business's very next request.

const STATUS_BADGE = {
  exempt: ['badge-slate', 'Exempt'],
  paid: ['badge-green', 'Paid'],
  trial: ['badge-amber', 'Trial'],
  expired: ['badge-red', 'Locked'],
}

function dateOnly(iso) {
  return iso ? new Date(iso).toISOString().slice(0, 10) : ''
}

function BusinessRow({ business, onSaved }) {
  const [paidUntil, setPaidUntil] = useState(dateOnly(business.paid_until))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => setPaidUntil(dateOnly(business.paid_until)), [business.paid_until])

  async function save(data) {
    setSaving(true)
    setError('')
    try {
      onSaved(await updatePlatformBusiness(business.id, data))
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const [badgeClass, label] = STATUS_BADGE[business.status] ?? ['badge-slate', business.status]
  const dirty = paidUntil !== dateOnly(business.paid_until)

  return (
    <tr>
      <td data-label="Business" className="platform-name">
        <strong>{business.business_name}</strong>
        <div className="platform-sub">#{business.id}</div>
      </td>
      <td data-label="Owner email" className="platform-email">{business.owner_email ?? '—'}</td>
      <td data-label="Created" className="platform-nowrap">{dateOnly(business.created_at)}</td>
      <td data-label="Trial ends" className="platform-nowrap">{dateOnly(business.trial_ends_at)}</td>
      <td data-label="Paid until">
        <div className="platform-paid">
          <input
            type="date"
            value={paidUntil}
            onChange={(e) => setPaidUntil(e.target.value)}
            aria-label={`Paid until for ${business.business_name}`}
          />
          {dirty && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={saving}
              onClick={() => save({ paid_until: paidUntil || null })}
            >
              Save
            </button>
          )}
          {!dirty && business.paid_until && (
            <button type="button" className="btn btn-ghost btn-sm" disabled={saving} onClick={() => save({ paid_until: null })}>
              Clear
            </button>
          )}
        </div>
        {error && <div className="form-error">{error}</div>}
      </td>
      <td data-label="Exempt">
        <button
          type="button"
          className={'toggle' + (business.billing_exempt ? '' : ' off')}
          disabled={saving}
          onClick={() => save({ billing_exempt: !business.billing_exempt })}
          aria-pressed={business.billing_exempt}
          aria-label={`Exempt ${business.business_name}`}
        />
      </td>
      <td data-label="Status" className="platform-nowrap">
        <span className={`badge ${badgeClass}`}>
          <span className="badge-dot" />
          {label}
          {business.status === 'trial' && ` · ${business.days_left}d`}
        </span>
      </td>
    </tr>
  )
}

function PlatformBusinesses() {
  const { admin } = useOutletContext()
  const [query, setQuery] = useState('')
  const [businesses, setBusinesses] = useState(null)
  const [error, setError] = useState('')

  const isOwner = Boolean(admin?.is_platform_owner)

  useEffect(() => {
    if (!isOwner) return
    const handle = setTimeout(() => {
      getPlatformBusinesses(query.trim())
        .then((rows) => {
          setBusinesses(rows)
          setError('')
        })
        .catch((err) => setError(err.message))
    }, 250)
    return () => clearTimeout(handle)
  }, [query, isOwner])

  if (!isOwner) return <Navigate to={defaultRouteForRole(admin?.role)} replace />

  function replaceRow(updated) {
    setBusinesses((rows) => rows.map((b) => (b.id === updated.id ? updated : b)))
  }

  return (
    <div>
      <PageHeader title="Businesses" subtitle="Platform billing: trials, paid-until dates and exemptions" />
      <div className="content">
        <input
          type="search"
          className="platform-search"
          placeholder="Search by name, owner email or ID"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {error && <div className="form-error">{error}</div>}
        {businesses === null ? null : businesses.length === 0 ? (
          <div className="empty-state card">
            <h3>No businesses match</h3>
          </div>
        ) : (
          <div className="card table-scroll platform-table-wrap">
            <table className="platform-table">
              <thead>
                <tr>
                  <th>Business</th>
                  <th>Owner email</th>
                  <th>Created</th>
                  <th>Trial ends</th>
                  <th>Paid until</th>
                  <th>Exempt</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {businesses.map((b) => (
                  <BusinessRow key={b.id} business={b} onSaved={replaceRow} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {businesses && <p className="platform-count">{businesses.length} businesses</p>}
      </div>
    </div>
  )
}

export default PlatformBusinesses
