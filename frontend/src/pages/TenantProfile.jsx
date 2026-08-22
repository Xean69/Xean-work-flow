import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  getTenant,
  getTenants,
  getAddons,
  updateTenant,
  setTenantPassword,
  updateTenantNotes,
  getRentPayments,
  createRentPayment,
  updateRentPayment,
  deleteRentPayment,
  getDocuments,
  uploadDocument,
  deleteDocument,
  getDocumentUrl,
  getInspectionByTenant,
  createOccupant,
  updateOccupant,
  deleteOccupant,
  createEvictionEvent,
  updateEvictionEvent,
  deleteEvictionEvent,
} from '../api/client.js'
import PageHeader from '../components/PageHeader.jsx'
import Badge from '../components/Badge.jsx'
import Modal from '../components/Modal.jsx'
import TenantForm from '../components/TenantForm.jsx'
import TenantPasswordForm from '../components/TenantPasswordForm.jsx'
import RentPaymentForm from '../components/RentPaymentForm.jsx'
import DocumentForm from '../components/DocumentForm.jsx'
import OccupantForm from '../components/OccupantForm.jsx'
import EvictionEventForm, { STAGE_LABELS } from '../components/EvictionEventForm.jsx'
import './Documents.css'
import './TenantProfile.css'

const STATUS_LABEL = { active: 'Active', renewal_due: 'Renewal due', urgent_renewal: 'Urgent renewal' }
const STATUS_VARIANT = { active: 'green', renewal_due: 'amber', urgent_renewal: 'red' }
const PAYMENT_STATUS_LABEL = { paid: 'Paid', partial: 'Partial', unpaid: 'Unpaid' }
const PAYMENT_STATUS_VARIANT = { paid: 'green', partial: 'amber', unpaid: 'red' }
const METHOD_LABEL = { e_transfer: 'E-transfer', cash: 'Cash', cheque: 'Cheque', other: 'Other' }
const INSPECTION_STATUS_LABEL = {
  none: 'No inspection',
  draft: 'Draft',
  pending_signature: 'Pending signature',
  signed: 'Signed',
}
const INSPECTION_STATUS_VARIANT = { none: 'slate', draft: 'slate', pending_signature: 'amber', signed: 'green' }
const STAGE_VARIANT = {
  notice_issued: 'amber',
  filed_with_court: 'amber',
  hearing_scheduled: 'amber',
  order_granted: 'red',
  resolved_withdrawn: 'green',
}

function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatMoney(amount) {
  return `$${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
}

function formatPeriod(period) {
  const [year, month] = period.split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
}

function TenantProfile() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [tenant, setTenant] = useState(null)
  const [allTenants, setAllTenants] = useState([])
  const [addons, setAddons] = useState([])
  const [payments, setPayments] = useState([])
  const [documents, setDocuments] = useState([])
  const [inspection, setInspection] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [editingTenant, setEditingTenant] = useState(false)
  const [passwordModal, setPasswordModal] = useState(false)
  const [editingPayment, setEditingPayment] = useState(null) // null | 'new' | the payment being edited
  const [selectedFile, setSelectedFile] = useState(null)
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef(null)
  const [occupantModal, setOccupantModal] = useState(null) // null | 'new' | the occupant being edited
  const [evictionModal, setEvictionModal] = useState(null) // null | 'new' | the event being edited
  const [notesDraft, setNotesDraft] = useState('')
  const [notesSaving, setNotesSaving] = useState(false)
  const [notesSaved, setNotesSaved] = useState(false)

  useEffect(() => {
    load()
  }, [id])

  async function load() {
    setLoading(true)
    setLoadError('')
    try {
      const [t, tenants, addonRows, paymentRows, docRows] = await Promise.all([
        getTenant(id),
        getTenants(),
        getAddons(),
        getRentPayments(id),
        getDocuments(id),
      ])
      setTenant(t)
      setNotesDraft(t.manager_notes || '')
      setAllTenants(tenants)
      setAddons(addonRows)
      setPayments(paymentRows)
      setDocuments(docRows)
    } catch (err) {
      setLoadError(err.message)
    } finally {
      setLoading(false)
    }

    // A 404 here just means no inspection exists yet — not a page-level error.
    try {
      setInspection(await getInspectionByTenant(id))
    } catch {
      setInspection(null)
    }
  }

  async function handleSaveTenant(values) {
    await updateTenant(tenant.tenant_id, values)
    setEditingTenant(false)
    await load()
  }

  async function handleSetPassword(password) {
    await setTenantPassword(tenant.tenant_id, password)
    setPasswordModal(false)
    await load()
  }

  async function handleSaveNotes() {
    setNotesSaving(true)
    setNotesSaved(false)
    try {
      await updateTenantNotes(tenant.tenant_id, notesDraft)
      setNotesSaved(true)
    } finally {
      setNotesSaving(false)
    }
  }

  async function handlePaymentSubmit(values) {
    const payload = { ...values, tenant_id: tenant.tenant_id }
    if (editingPayment && editingPayment !== 'new') {
      await updateRentPayment(editingPayment.id, payload)
    } else {
      await createRentPayment(payload)
    }
    setEditingPayment(null)
    await load()
  }

  async function handlePaymentDelete(payment) {
    if (!window.confirm(`Delete this ${formatMoney(payment.amount)} payment?`)) return
    await deleteRentPayment(payment.id)
    await load()
  }

  function handleDragOver(e) {
    e.preventDefault()
    setDragActive(true)
  }
  function handleDrop(e) {
    e.preventDefault()
    setDragActive(false)
    const file = e.dataTransfer.files?.[0]
    if (file) setSelectedFile(file)
  }
  function handleFileInputChange(e) {
    const file = e.target.files?.[0]
    if (file) setSelectedFile(file)
    e.target.value = ''
  }
  async function handleUploadDocument(formData) {
    await uploadDocument(formData)
    setSelectedFile(null)
    await load()
  }
  async function handleDeleteDocument(doc) {
    if (!window.confirm(`Delete "${doc.file_name}"?`)) return
    await deleteDocument(doc.id)
    await load()
  }

  async function handleSaveOccupant(values) {
    if (occupantModal && occupantModal !== 'new') {
      await updateOccupant(occupantModal.id, values)
    } else {
      await createOccupant(tenant.tenant_id, values)
    }
    setOccupantModal(null)
    await load()
  }
  async function handleDeleteOccupant(occupant) {
    if (!window.confirm(`Remove ${occupant.full_name} from occupants?`)) return
    await deleteOccupant(occupant.id)
    await load()
  }

  async function handleSaveEviction(values) {
    if (evictionModal && evictionModal !== 'new') {
      await updateEvictionEvent(evictionModal.id, values)
    } else {
      await createEvictionEvent(tenant.tenant_id, values)
    }
    setEvictionModal(null)
    await load()
  }
  async function handleDeleteEviction(event) {
    if (!window.confirm('Delete this eviction log entry?')) return
    await deleteEvictionEvent(event.id)
    await load()
  }

  if (loading) return <p className="content">Loading tenant…</p>
  if (loadError) return <p className="content form-error">{loadError}</p>
  if (!tenant) return null

  // Vacant units, plus this tenant's own current unit — same shape TenantForm
  // expects, mirroring how Tenants.jsx builds these for the same component.
  const vacantOptions = allTenants
    .filter((r) => !r.tenant_id)
    .map((r) => ({
      value: r.unit_id,
      label: `${r.property_name} — ${r.unit_number}`,
      rent_amount: r.unit_rent_amount,
      property_id: r.property_id,
    }))
  const unitOptions = [
    {
      value: tenant.unit_id,
      label: `${tenant.property_name} — ${tenant.unit_number}`,
      rent_amount: tenant.unit_rent_amount,
      property_id: tenant.property_id,
    },
    ...vacantOptions,
  ]
  const tenantInitialValues = {
    unit_id: tenant.unit_id,
    full_name: tenant.full_name,
    email: tenant.email || '',
    phone: tenant.phone || '',
    lease_start: tenant.lease_start?.slice(0, 10) || '',
    lease_end: tenant.lease_end?.slice(0, 10) || '',
    rent_amount: tenant.rent_amount || '',
    deposit_amount: tenant.deposit_amount || '',
    addons: (tenant.addons || []).map((a) => ({ addon_id: a.addon_id, quantity: a.quantity })),
  }

  const totalDue = Number(tenant.rent_amount) + Number(tenant.addon_total || 0)

  return (
    <div>
      <PageHeader
        title={tenant.full_name}
        subtitle={`${tenant.property_name} · Unit ${tenant.unit_number}`}
      >
        <button className="btn btn-ghost" onClick={() => setEditingTenant(true)}>
          Edit
        </button>
      </PageHeader>

      <div className="content">
        <Link to="/tenants" className="back-link">
          ← Tenants &amp; Leases
        </Link>

        {/* --- Tenant info --- */}
        <div className="card tenant-info-grid">
          <div className="tenant-info-item">
            <span className="tenant-info-label">Email</span>
            <span className="tenant-info-value">{tenant.email || '—'}</span>
          </div>
          <div className="tenant-info-item">
            <span className="tenant-info-label">Phone</span>
            <span className="tenant-info-value">{tenant.phone || '—'}</span>
          </div>
          <div className="tenant-info-item">
            <span className="tenant-info-label">Lease start</span>
            <span className="tenant-info-value mono">{formatDate(tenant.lease_start)}</span>
          </div>
          <div className="tenant-info-item">
            <span className="tenant-info-label">Lease end</span>
            <span className="tenant-info-value mono">{formatDate(tenant.lease_end)}</span>
          </div>
          <div className="tenant-info-item">
            <span className="tenant-info-label">Rent</span>
            <span className="tenant-info-value mono">{formatMoney(tenant.rent_amount)}</span>
          </div>
          <div className="tenant-info-item">
            <span className="tenant-info-label">Total due this period</span>
            <span className="tenant-info-value mono">{formatMoney(totalDue)}</span>
          </div>
          <div className="tenant-info-item">
            <span className="tenant-info-label">Status</span>
            <Badge variant={STATUS_VARIANT[tenant.status]}>{STATUS_LABEL[tenant.status]}</Badge>
          </div>
          <div className="tenant-info-item">
            <span className="tenant-info-label">This month</span>
            <Badge variant={PAYMENT_STATUS_VARIANT[tenant.payment_status]}>
              {PAYMENT_STATUS_LABEL[tenant.payment_status]}
            </Badge>
          </div>
          <div className="tenant-info-item">
            <span className="tenant-info-label">Portal login</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Badge variant={tenant.has_login ? 'green' : 'slate'}>{tenant.has_login ? 'Active' : 'Not set'}</Badge>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setPasswordModal(true)}
                disabled={!tenant.email}
                title={tenant.email ? undefined : 'Add an email first'}
              >
                {tenant.has_login ? 'Reset password' : 'Set password'}
              </button>
            </div>
          </div>
        </div>

        {tenant.addons?.length > 0 && (
          <div className="card table-scroll" style={{ marginTop: 12 }}>
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
                {tenant.addons.map((a) => (
                  <tr key={a.id}>
                    <td>{a.name}</td>
                    <td>{a.quantity}</td>
                    <td className="mono">{formatMoney(a.unit_price)}</td>
                    <td className="mono">{formatMoney(a.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* --- Rent history --- */}
        <div className="section-head">
          <h2>Rent history</h2>
          <button className="btn btn-primary btn-sm" onClick={() => setEditingPayment('new')}>
            + Record a payment
          </button>
        </div>

        {payments.length === 0 ? (
          <div className="empty-state card">
            <h3>No payments recorded yet</h3>
          </div>
        ) : (
          <div className="card table-scroll">
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
                {payments.map((payment) => (
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

        {/* --- Documents --- */}
        <div className="section-head">
          <h2>Documents</h2>
        </div>

        {selectedFile ? (
          <div className="card doc-upload-panel">
            <DocumentForm
              file={selectedFile}
              properties={[]}
              tenants={[]}
              presetTenantId={tenant.tenant_id}
              presetPropertyId={tenant.property_id}
              onSubmit={handleUploadDocument}
              onCancel={() => setSelectedFile(null)}
            />
          </div>
        ) : (
          <div
            className={'dropzone' + (dragActive ? ' dropzone-active' : '')}
            onDragOver={handleDragOver}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
          >
            <div className="dropzone-icon">↑</div>
            <h3>Drag a file here, or click to upload</h3>
            <p>PDF, JPG, or PNG — lease, ID, or any other document for {tenant.full_name}</p>
            <button type="button" className="btn btn-ghost" onClick={() => fileInputRef.current?.click()}>
              Browse files
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={handleFileInputChange}
              style={{ display: 'none' }}
            />
          </div>
        )}

        {documents.length === 0 ? (
          <div className="empty-state card">
            <h3>No documents yet</h3>
          </div>
        ) : (
          <div className="card">
            {documents.map((d) => (
              <div className="doc-row" key={d.id}>
                <div className="doc-icon">📄</div>
                <div>
                  <a href={getDocumentUrl(d.id)} target="_blank" rel="noreferrer" className="doc-name">
                    {d.file_name}
                  </a>
                  <div className="doc-sub">{formatDate(d.uploaded_at)}</div>
                </div>
                <div className="doc-actions">
                  <a href={getDocumentUrl(d.id)} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
                    View
                  </a>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDeleteDocument(d)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* --- Move-in inspection --- */}
        <div className="section-head">
          <h2>Move-in inspection</h2>
        </div>
        <div className="card tenant-inspection-row">
          <Badge variant={INSPECTION_STATUS_VARIANT[tenant.inspection_status]}>
            {INSPECTION_STATUS_LABEL[tenant.inspection_status]}
          </Badge>
          {inspection?.signed_at && (
            <span style={{ fontSize: 12.5, color: 'var(--slate)' }}>
              Signed by {inspection.signed_name} on {formatDate(inspection.signed_at)}
            </span>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/tenants/${tenant.tenant_id}/inspection`)}>
            {tenant.inspection_status === 'none' ? 'Start inspection' : 'View / manage inspection'}
          </button>
        </div>

        {/* --- Additional occupants --- */}
        <div className="section-head">
          <h2>Additional occupants</h2>
          <button className="btn btn-primary btn-sm" onClick={() => setOccupantModal('new')}>
            + Add occupant
          </button>
        </div>
        {tenant.occupants.length === 0 ? (
          <div className="empty-state card">
            <h3>No additional occupants on file</h3>
          </div>
        ) : (
          <div className="card">
            {tenant.occupants.map((o) => (
              <div className="profile-row" key={o.id}>
                <div>
                  <h3 style={{ marginBottom: 2 }}>{o.full_name}</h3>
                  <p style={{ fontSize: 12.5, color: 'var(--slate)' }}>
                    {o.relationship || 'Occupant'}
                    {o.notes ? ` · ${o.notes}` : ''}
                  </p>
                </div>
                <div className="table-actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => setOccupantModal(o)}>
                    Edit
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDeleteOccupant(o)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* --- Manager notes --- */}
        <div className="section-head">
          <h2>Manager notes</h2>
        </div>
        <div className="card">
          <p style={{ fontSize: 12, color: 'var(--slate)', marginBottom: 10 }}>
            Visible only to managers — never shown to the tenant.
          </p>
          <textarea
            rows={4}
            style={{ width: '100%' }}
            value={notesDraft}
            onChange={(e) => {
              setNotesDraft(e.target.value)
              setNotesSaved(false)
            }}
            placeholder="e.g. Prefers text over email, difficult renter, ..."
          />
          <div className="form-actions" style={{ marginTop: 10 }}>
            {notesSaved && <span style={{ fontSize: 12.5, color: 'var(--green)', marginRight: 'auto' }}>Saved</span>}
            <button className="btn btn-primary btn-sm" onClick={handleSaveNotes} disabled={notesSaving}>
              {notesSaving ? 'Saving…' : 'Save notes'}
            </button>
          </div>
        </div>

        {/* --- Eviction log --- */}
        <div className="section-head">
          <h2>Eviction log</h2>
          <button className="btn btn-primary btn-sm" onClick={() => setEvictionModal('new')}>
            + Log event
          </button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--slate)', margin: '-6px 0 10px' }}>
          Visible only to managers — never shown to the tenant.
        </p>
        {tenant.eviction_events.length === 0 ? (
          <div className="empty-state card">
            <h3>No eviction events logged</h3>
          </div>
        ) : (
          <div className="card">
            {tenant.eviction_events.map((e) => (
              <div className="profile-row" key={e.id}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <Badge variant={STAGE_VARIANT[e.stage]}>{STAGE_LABELS[e.stage]}</Badge>
                    <strong style={{ fontSize: 13.5 }}>{e.notice_type}</strong>
                    <span style={{ fontSize: 12, color: 'var(--slate)' }}>{formatDate(e.date_issued)}</span>
                  </div>
                  {e.notes && <p style={{ fontSize: 12.5, color: 'var(--slate)' }}>{e.notes}</p>}
                </div>
                <div className="table-actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => setEvictionModal(e)}>
                    Edit
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDeleteEviction(e)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editingTenant && (
        <Modal title="Edit tenant" onClose={() => setEditingTenant(false)}>
          <TenantForm
            initialValues={tenantInitialValues}
            isEditing
            unitOptions={unitOptions}
            addonOptions={addons}
            onSubmit={handleSaveTenant}
            onCancel={() => setEditingTenant(false)}
          />
        </Modal>
      )}

      {passwordModal && (
        <Modal title="Portal password" onClose={() => setPasswordModal(false)}>
          <TenantPasswordForm
            tenantName={tenant.full_name}
            onSubmit={handleSetPassword}
            onCancel={() => setPasswordModal(false)}
          />
        </Modal>
      )}

      {editingPayment && (
        <Modal title={editingPayment === 'new' ? 'Record a payment' : 'Edit payment'} onClose={() => setEditingPayment(null)}>
          <RentPaymentForm
            key={editingPayment === 'new' ? 'new' : editingPayment.id}
            rentAmount={totalDue}
            initialValues={
              editingPayment !== 'new'
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
            onCancel={() => setEditingPayment(null)}
          />
        </Modal>
      )}

      {occupantModal && (
        <Modal title={occupantModal === 'new' ? 'Add occupant' : 'Edit occupant'} onClose={() => setOccupantModal(null)}>
          <OccupantForm
            initialValues={occupantModal === 'new' ? undefined : occupantModal}
            onSubmit={handleSaveOccupant}
            onCancel={() => setOccupantModal(null)}
          />
        </Modal>
      )}

      {evictionModal && (
        <Modal title={evictionModal === 'new' ? 'Log eviction event' : 'Edit eviction event'} onClose={() => setEvictionModal(null)}>
          <EvictionEventForm
            initialValues={evictionModal === 'new' ? undefined : evictionModal}
            onSubmit={handleSaveEviction}
            onCancel={() => setEvictionModal(null)}
          />
        </Modal>
      )}
    </div>
  )
}

export default TenantProfile
