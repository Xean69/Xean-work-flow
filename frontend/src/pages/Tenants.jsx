import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getTenants,
  createTenant,
  updateTenant,
  deleteTenant,
  setTenantPassword,
  getRentPayments,
  createRentPayment,
  updateRentPayment,
  deleteRentPayment,
} from '../api/client.js'
import PageHeader from '../components/PageHeader.jsx'
import Badge from '../components/Badge.jsx'
import Modal from '../components/Modal.jsx'
import TenantForm from '../components/TenantForm.jsx'
import TenantPasswordForm from '../components/TenantPasswordForm.jsx'
import RentPaymentForm from '../components/RentPaymentForm.jsx'

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
const METHOD_LABEL = { e_transfer: 'E-transfer', cash: 'Cash', cheque: 'Cheque', other: 'Other' }

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

function formatMoney(amount) {
  return `$${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
}

// "2026-08" -> "Aug 2026" — same year/month-number parsing OwnerStatements
// uses, to avoid new Date("2026-08") being read as UTC midnight and
// displaying as the previous month in a negative-UTC-offset timezone.
function formatPeriod(period) {
  const [year, month] = period.split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
}

function Tenants() {
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  // null = closed, {} = add form, { row } = editing, { presetUnitId } = assigning a specific vacant unit
  const [formState, setFormState] = useState(null)
  // null = closed, otherwise the row whose portal password is being set
  const [passwordRow, setPasswordRow] = useState(null)
  // null = closed, otherwise the row whose payment history is open
  const [paymentsRow, setPaymentsRow] = useState(null)
  const [paymentHistory, setPaymentHistory] = useState([])
  const [paymentHistoryLoading, setPaymentHistoryLoading] = useState(false)
  // null = the form is for a new payment, otherwise the payment being edited
  const [editingPayment, setEditingPayment] = useState(null)

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

  async function openPayments(row) {
    setPaymentsRow(row)
    setEditingPayment(null)
    setPaymentHistoryLoading(true)
    try {
      setPaymentHistory(await getRentPayments(row.tenant_id))
    } finally {
      setPaymentHistoryLoading(false)
    }
  }

  function closePayments() {
    setPaymentsRow(null)
    setPaymentHistory([])
    setEditingPayment(null)
  }

  async function handlePaymentSubmit(values) {
    const payload = { ...values, tenant_id: paymentsRow.tenant_id }
    if (editingPayment) {
      await updateRentPayment(editingPayment.id, payload)
    } else {
      await createRentPayment(payload)
    }
    setEditingPayment(null)
    setPaymentHistory(await getRentPayments(paymentsRow.tenant_id))
    // The badge in the table behind the modal (Paid/Partial/Unpaid) is
    // computed from rent_payments too, so it needs a refetch to catch up.
    await load()
  }

  async function handlePaymentDelete(payment) {
    if (!window.confirm(`Delete this ${formatMoney(payment.amount)} payment?`)) return
    await deleteRentPayment(payment.id)
    if (editingPayment?.id === payment.id) setEditingPayment(null)
    setPaymentHistory(await getRentPayments(paymentsRow.tenant_id))
    await load()
  }

  const occupiedCount = rows.filter((r) => r.tenant_id).length

  // Vacant units are always eligible to assign a tenant to. When editing an
  // existing tenant, their own current unit is also included (pre-selected)
  // so you can view/save without being forced to pick a different unit.
  const vacantOptions = rows
    .filter((r) => !r.tenant_id)
    .map((r) => ({ value: r.unit_id, label: `${r.property_name} — ${r.unit_number}`, rent_amount: r.unit_rent_amount }))

  const unitOptions =
    formState?.row && formState.row.tenant_id
      ? [
          {
            value: formState.row.unit_id,
            label: `${formState.row.property_name} — ${formState.row.unit_number}`,
            rent_amount: formState.row.unit_rent_amount,
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
                {rows.map((row) => (
                  <tr key={row.unit_id}>
                    <td style={{ fontWeight: 600 }}>{row.full_name || '—'}</td>
                    <td style={{ color: 'var(--slate)', fontSize: 12 }}>
                      {row.property_name} · {row.unit_number}
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
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => navigate(`/tenants/${row.tenant_id}/inspection`)}
                            >
                              Inspection
                            </button>
                            <button className="btn btn-ghost btn-sm" onClick={() => openPayments(row)}>
                              Payments
                            </button>
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
          <TenantForm
            initialValues={initialValues}
            isEditing={!!formState?.row}
            unitOptions={unitOptions}
            onSubmit={handleSubmit}
            onCancel={() => setFormState(null)}
          />
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

      {paymentsRow && (
        <Modal title={`Rent payments — ${paymentsRow.full_name}`} onClose={closePayments}>
          <h3 style={{ marginBottom: 12 }}>{editingPayment ? 'Edit payment' : 'Record a payment'}</h3>
          <RentPaymentForm
            key={editingPayment?.id ?? 'new'}
            rentAmount={paymentsRow.rent_amount}
            initialValues={
              editingPayment
                ? {
                    amount: editingPayment.amount,
                    payment_date: editingPayment.payment_date?.slice(0, 10),
                    method: editingPayment.method,
                    period_covered: editingPayment.period_covered,
                    notes: editingPayment.notes || '',
                  }
                : undefined
            }
            onSubmit={handlePaymentSubmit}
            onCancel={editingPayment ? () => setEditingPayment(null) : closePayments}
          />

          <div className="section-head" style={{ margin: '24px 0 10px 0' }}>
            <h2 style={{ fontSize: 15 }}>Payment history</h2>
          </div>

          {paymentHistoryLoading && <p style={{ fontSize: 12.5, color: 'var(--slate)' }}>Loading…</p>}

          {!paymentHistoryLoading && paymentHistory.length === 0 && (
            <p style={{ fontSize: 12.5, color: 'var(--slate)' }}>No payments recorded yet.</p>
          )}

          {!paymentHistoryLoading && paymentHistory.length > 0 && (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Period</th>
                    <th>Amount</th>
                    <th>Date</th>
                    <th>Method</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {paymentHistory.map((payment) => (
                    <tr key={payment.id}>
                      <td>{formatPeriod(payment.period_covered)}</td>
                      <td className="mono">{formatMoney(payment.amount)}</td>
                      <td className="mono">{formatDate(payment.payment_date)}</td>
                      <td>{METHOD_LABEL[payment.method]}</td>
                      <td>
                        <div className="table-actions">
                          <button className="btn btn-ghost btn-sm" onClick={() => setEditingPayment(payment)}>
                            Edit
                          </button>
                          <button className="btn btn-danger btn-sm" onClick={() => handlePaymentDelete(payment)}>
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}

export default Tenants
