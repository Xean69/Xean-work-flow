import { useEffect, useState } from 'react'
import { getStrLicenses, createStrLicense, updateStrLicense, deleteStrLicense } from '../api/client.js'
import PageHeader from '../components/PageHeader.jsx'
import Modal from '../components/Modal.jsx'
import Badge from '../components/Badge.jsx'
import StrLicenseForm from '../components/StrLicenseForm.jsx'
import './STRLicensing.css'

const STATUS_LABEL = {
  active: 'Active',
  expiring_soon: 'Expiring soon',
  expired: 'Expired',
  unlicensed: 'No license on file',
}
const STATUS_VARIANT = {
  active: 'green',
  expiring_soon: 'amber',
  expired: 'red',
  unlicensed: 'slate',
}

function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function STRLicensing() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  // null = closed. { row } = add/renew for that property. { row,
  // editingLicenseId, initialValues } = editing the property's current license.
  const [formState, setFormState] = useState(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    setLoadError('')
    try {
      setRows(await getStrLicenses())
    } catch (err) {
      setLoadError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(values) {
    const payload = {
      property_id: formState.row.property_id,
      license_number: values.license_number,
      issued_date: values.issued_date,
    }
    if (formState.editingLicenseId) {
      await updateStrLicense(formState.editingLicenseId, payload)
    } else {
      await createStrLicense(payload)
    }
    setFormState(null)
    await load()
  }

  async function handleDelete(row) {
    if (!window.confirm(`Remove the license on file for ${row.property_name}?`)) return
    await deleteStrLicense(row.license_id)
    await load()
  }

  const expiringSoonCount = rows.filter((r) => r.status === 'expiring_soon').length
  const expiredCount = rows.filter((r) => r.status === 'expired').length

  return (
    <div>
      <PageHeader
        title="STR Licensing"
        subtitle="Edmonton requires a $94/year business license per short-term rental property, renewed annually"
      />

      <div className="content">
        {loadError && <p className="form-error">{loadError}</p>}

        {!loading && (expiredCount > 0 || expiringSoonCount > 0) && (
          <div className="str-alert-row">
            {expiredCount > 0 && (
              <div className="str-alert str-alert-red">
                {expiredCount} propert{expiredCount === 1 ? 'y has' : 'ies have'} an expired license
              </div>
            )}
            {expiringSoonCount > 0 && (
              <div className="str-alert str-alert-amber">
                {expiringSoonCount} propert{expiringSoonCount === 1 ? 'y' : 'ies'} expiring within 60 days
              </div>
            )}
          </div>
        )}

        {!loading && !loadError && rows.length === 0 && (
          <div className="empty-state card">
            <h3>No properties yet</h3>
            <p>Add a property first, then track its STR license here.</p>
          </div>
        )}

        {rows.map((row) => (
          <div className="str-card" key={row.property_id}>
            <div className="str-card-top">
              <div>
                <div className="str-name">{row.property_name}</div>
                <div className="str-sub mono">{row.license_number ?? 'No license number on file'}</div>
              </div>
              <Badge variant={STATUS_VARIANT[row.status]}>{STATUS_LABEL[row.status]}</Badge>
            </div>

            <div className="str-dates">
              <div className="str-date-field">
                <span>Issued</span>
                {formatDate(row.issued_date)}
              </div>
              <div className="str-date-field">
                <span>Expires</span>
                {formatDate(row.expiry_date)}
              </div>
            </div>

            <div className="str-actions">
              {row.license_id ? (
                <>
                  <button className="btn btn-ghost btn-sm" onClick={() => setFormState({ row })}>
                    Renew
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() =>
                      setFormState({
                        row,
                        editingLicenseId: row.license_id,
                        initialValues: {
                          license_number: row.license_number,
                          issued_date: row.issued_date?.slice(0, 10),
                        },
                      })
                    }
                  >
                    Edit
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDelete(row)}>
                    Delete
                  </button>
                </>
              ) : (
                <button className="btn btn-primary btn-sm" onClick={() => setFormState({ row })}>
                  + Add license
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {formState && (
        <Modal
          title={formState.editingLicenseId ? 'Edit license' : formState.row.license_id ? 'Renew license' : 'Add license'}
          onClose={() => setFormState(null)}
        >
          <StrLicenseForm
            propertyName={formState.row.property_name}
            initialValues={formState.initialValues}
            onSubmit={handleSubmit}
            onCancel={() => setFormState(null)}
          />
        </Modal>
      )}
    </div>
  )
}

export default STRLicensing
