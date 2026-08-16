import { useEffect, useState } from 'react'
import { getTenants, createTenant, updateTenant, deleteTenant, setTenantPassword } from '../api/client.js'
import PageHeader from '../components/PageHeader.jsx'
import Badge from '../components/Badge.jsx'
import Modal from '../components/Modal.jsx'
import TenantForm from '../components/TenantForm.jsx'
import TenantPasswordForm from '../components/TenantPasswordForm.jsx'

const STATUS_LABEL = {
  active: 'Active',
  renewal_due: 'Renewal due',
  urgent_renewal: 'Urgent renewal',
  vacant: 'Vacant',
}
const STATUS_VARIANT = {
  active: 'green',
  renewal_due: 'amber',
  urgent_renewal: 'red',
  vacant: 'slate',
}

function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function Tenants() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  // null = closed, {} = add form, { row } = editing, { presetUnitId } = assigning a specific vacant unit
  const [formState, setFormState] = useState(null)
  // null = closed, otherwise the row whose portal password is being set
  const [passwordRow, setPasswordRow] = useState(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    setLoadError('')
    try {
      setRows(await getTenants())
    } catch (err) {
      setLoadError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(values) {
    if (formState?.row) {
      await updateTenant(formState.row.tenant_id, values)
    } else {
      await createTenant(values)
    }
    setFormState(null)
    await load()
  }

  async function handleDelete(row) {
    if (!window.confirm(`Remove ${row.full_name} from unit ${row.unit_number}?`)) return
    await deleteTenant(row.tenant_id)
    await load()
  }

  async function handleSetPassword(password) {
    await setTenantPassword(passwordRow.tenant_id, password)
    setPasswordRow(null)
    await load()
  }

  const occupiedCount = rows.filter((r) => r.tenant_id).length

  // Vacant units are always eligible to assign a tenant to. When editing an
  // existing tenant, their own current unit is also included (pre-selected)
  // so you can view/save without being forced to pick a different unit.
  const vacantOptions = rows
    .filter((r) => !r.tenant_id)
    .map((r) => ({ value: r.unit_id, label: `${r.property_name} — ${r.unit_number}` }))

  const unitOptions =
    formState?.row && formState.row.tenant_id
      ? [
          { value: formState.row.unit_id, label: `${formState.row.property_name} — ${formState.row.unit_number}` },
          ...vacantOptions,
        ]
      : vacantOptions

  const initialValues = formState?.row
    ? {
        unit_id: formState.row.unit_id,
        full_name: formState.row.full_name,
        email: formState.row.email || '',
        phone: formState.row.phone || '',
        lease_start: formState.row.lease_start?.slice(0, 10) || '',
        lease_end: formState.row.lease_end?.slice(0, 10) || '',
        rent_amount: formState.row.rent_amount || '',
        deposit_amount: formState.row.deposit_amount || '',
      }
    : formState?.presetUnitId
      ? { unit_id: formState.presetUnitId }
      : undefined

  return (
    <div>
      <PageHeader
        title="Tenants & Leases"
        subtitle={loading ? 'Loading…' : `${occupiedCount} active ${occupiedCount === 1 ? 'tenant' : 'tenants'} across your portfolio`}
      >
        <button className="btn btn-primary" onClick={() => setFormState({})} disabled={!loading && vacantOptions.length === 0}>
          + Add tenant
        </button>
      </PageHeader>

      <div className="content">
        {loadError && <p className="form-error">{loadError}</p>}

        {!loading && !loadError && rows.length === 0 && (
          <div className="empty-state card">
            <h3>No units yet</h3>
            <p>Add a property and some units first, then come back to assign tenants.</p>
          </div>
        )}

        {rows.length > 0 && (
          <div className="card">
            <table>
              <thead>
                <tr>
                  <th>Tenant</th>
                  <th>Property / Unit</th>
                  <th>Rent</th>
                  <th>Lease ends</th>
                  <th>Status</th>
                  <th>Portal login</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.unit_id}>
                    <td style={{ fontWeight: 600 }}>{row.full_name || '—'}</td>
                    <td style={{ color: 'var(--slate)', fontSize: 12 }}>
                      {row.property_name} · {row.unit_number}
                    </td>
                    <td className="mono">{row.rent_amount ? `$${Number(row.rent_amount).toLocaleString()}` : '—'}</td>
                    <td className="mono">{formatDate(row.lease_end)}</td>
                    <td>
                      <Badge variant={STATUS_VARIANT[row.status]}>{STATUS_LABEL[row.status]}</Badge>
                    </td>
                    <td>
                      {row.tenant_id ? (
                        <Badge variant={row.has_login ? 'green' : 'slate'}>
                          {row.has_login ? 'Active' : 'Not set'}
                        </Badge>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <div className="table-actions">
                        {row.tenant_id ? (
                          <>
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => setPasswordRow(row)}
                              disabled={!row.email}
                              title={row.email ? undefined : 'Add an email first'}
                            >
                              {row.has_login ? 'Reset password' : 'Set password'}
                            </button>
                            <button className="btn btn-ghost btn-sm" onClick={() => setFormState({ row })}>
                              Edit
                            </button>
                            <button className="btn btn-danger btn-sm" onClick={() => handleDelete(row)}>
                              Delete
                            </button>
                          </>
                        ) : (
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => setFormState({ presetUnitId: row.unit_id })}
                          >
                            + Add tenant
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {formState && (
        <Modal title={formState?.row ? 'Edit tenant' : 'Add tenant'} onClose={() => setFormState(null)}>
          <TenantForm initialValues={initialValues} unitOptions={unitOptions} onSubmit={handleSubmit} onCancel={() => setFormState(null)} />
        </Modal>
      )}

      {passwordRow && (
        <Modal title="Portal password" onClose={() => setPasswordRow(null)}>
          <TenantPasswordForm
            tenantName={passwordRow.full_name}
            onSubmit={handleSetPassword}
            onCancel={() => setPasswordRow(null)}
          />
        </Modal>
      )}
    </div>
  )
}

export default Tenants
