import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getTenants, getAddons, getProperties, createTenant, updateTenant, deleteTenant } from '../api/client.js'
import PageHeader from '../components/PageHeader.jsx'
import Badge from '../components/Badge.jsx'
import Modal from '../components/Modal.jsx'
import TenantForm from '../components/TenantForm.jsx'
import './Tenants.css'

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

const PAYMENT_STATUS_LABEL = { paid: 'Paid', partial: 'Partial', unpaid: 'Unpaid' }
const PAYMENT_STATUS_VARIANT = { paid: 'green', partial: 'amber', unpaid: 'red' }

const INSPECTION_STATUS_LABEL = {
  none: 'No inspection',
  draft: 'Draft',
  pending_signature: 'Pending signature',
  signed: 'Signed',
}
const INSPECTION_STATUS_VARIANT = {
  none: 'slate',
  draft: 'slate',
  pending_signature: 'amber',
  signed: 'green',
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
  const [addons, setAddons] = useState([])
  const [properties, setProperties] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  // null = closed, {} = add form, { row } = editing, { presetUnitId } = assigning a specific vacant unit
  const [formState, setFormState] = useState(null)
  const [search, setSearch] = useState('')
  const [propertyFilter, setPropertyFilter] = useState('')

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    setLoadError('')
    try {
      const [tenantRows, addonRows, propertyRows] = await Promise.all([getTenants(), getAddons(), getProperties()])
      setRows(tenantRows)
      setAddons(addonRows)
      setProperties(propertyRows)
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

  const occupiedCount = rows.filter((r) => r.tenant_id).length

  // Vacant units are always eligible to assign a tenant to. When editing an
  // existing tenant, their own current unit is also included (pre-selected)
  // so you can view/save without being forced to pick a different unit.
  const vacantOptions = rows
    .filter((r) => !r.tenant_id)
    .map((r) => ({
      value: r.unit_id,
      label: `${r.property_name} — ${r.unit_number}`,
      rent_amount: r.unit_rent_amount,
      property_id: r.property_id,
    }))

  const unitOptions =
    formState?.row && formState.row.tenant_id
      ? [
          {
            value: formState.row.unit_id,
            label: `${formState.row.property_name} — ${formState.row.unit_number}`,
            rent_amount: formState.row.unit_rent_amount,
            property_id: formState.row.property_id,
          },
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
        addons: (formState.row.addons || []).map((a) => ({ addon_id: a.addon_id, quantity: a.quantity })),
      }
    : formState?.presetUnitId
      ? { unit_id: formState.presetUnitId }
      : undefined

  // Client-side only — the full portfolio is already loaded in `rows`, so
  // there's no reason to round-trip to the backend just to filter a list
  // that's already sitting in memory. Search and the property dropdown
  // apply together (AND), not as alternatives.
  const query = search.trim().toLowerCase()
  const visibleRows = rows
    .filter((r) => !propertyFilter || String(r.property_id) === propertyFilter)
    .filter(
      (r) =>
        !query || [r.full_name, r.email, r.phone].some((field) => field && field.toLowerCase().includes(query))
    )

  return (
    <div>
      <PageHeader
        title="Tenants & Leases"
        subtitle={loading ? 'Loading…' : `${occupiedCount} active ${occupiedCount === 1 ? 'tenant' : 'tenants'} across your portfolio`}
      >
        <Link to="/tenants/analytics" className="btn btn-ghost">
          View Analytics
        </Link>
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
          <div className="tenants-filters">
            <input
              type="text"
              className="tenants-search"
              placeholder="Search by name, email, or phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className="tenants-property-filter"
              value={propertyFilter}
              onChange={(e) => setPropertyFilter(e.target.value)}
            >
              <option value="">All properties</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {rows.length > 0 && visibleRows.length === 0 && (
          <div className="empty-state card">
            <h3>No matches</h3>
            <p>No tenant matches the current search and filter.</p>
          </div>
        )}

        {visibleRows.length > 0 && (
          <div className="card table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Tenant</th>
                  <th>Property / Unit</th>
                  <th>Rent</th>
                  <th>This month</th>
                  <th>Lease ends</th>
                  <th>Status</th>
                  <th>Portal login</th>
                  <th>Move-in inspection</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.unit_id}>
                    <td style={{ fontWeight: 600 }}>{row.full_name || '—'}</td>
                    <td style={{ color: 'var(--slate)', fontSize: 12 }}>
                      {row.tenant_id ? (
                        <Link to={`/tenants/${row.tenant_id}`} style={{ color: 'inherit', textDecoration: 'underline' }}>
                          {row.property_name} · {row.unit_number}
                        </Link>
                      ) : (
                        `${row.property_name} · ${row.unit_number}`
                      )}
                    </td>
                    <td className="mono">
                      {(() => {
                        const rent = row.rent_amount ?? row.unit_rent_amount
                        return rent != null ? `$${Number(rent).toLocaleString()}` : '—'
                      })()}
                    </td>
                    <td>
                      {row.payment_status ? (
                        <Badge variant={PAYMENT_STATUS_VARIANT[row.payment_status]}>
                          {PAYMENT_STATUS_LABEL[row.payment_status]}
                        </Badge>
                      ) : (
                        '—'
                      )}
                    </td>
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
                      {row.tenant_id ? (
                        <Badge variant={INSPECTION_STATUS_VARIANT[row.inspection_status]}>
                          {INSPECTION_STATUS_LABEL[row.inspection_status]}
                        </Badge>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <div className="table-actions">
                        {row.tenant_id ? (
                          <>
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
          <TenantForm
            initialValues={initialValues}
            isEditing={!!formState?.row}
            unitOptions={unitOptions}
            addonOptions={addons}
            onSubmit={handleSubmit}
            onCancel={() => setFormState(null)}
          />
        </Modal>
      )}
    </div>
  )
}

export default Tenants
