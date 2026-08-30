import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  getTenant,
  getTenants,
  getAddons,
  updateTenant,
  setTenantPassword,
  updateTenantNotes,
  getTenantLedger,
  createRentPayment,
  updateRentPayment,
  deleteRentPayment,
  createCharge,
  updateCharge,
  deleteCharge,
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
  getEvictionEventAttachmentUrl,
} from '../api/client.js'
import PageHeader from '../components/PageHeader.jsx'
import Badge from '../components/Badge.jsx'
import Modal from '../components/Modal.jsx'
import TenantForm from '../components/TenantForm.jsx'
import TenantPasswordForm from '../components/TenantPasswordForm.jsx'
import RentPaymentForm from '../components/RentPaymentForm.jsx'
import ChargeForm from '../components/ChargeForm.jsx'
import DocumentForm from '../components/DocumentForm.jsx'
import OccupantForm from '../components/OccupantForm.jsx'
import EvictionEventForm, { STAGE_LABELS } from '../components/EvictionEventForm.jsx'
import { downloadTenantLedgerPdf } from '../utils/tenantLedgerPdf.js'
import './Documents.css'
import './TenantProfile.css'

const STATUS_LABEL = { active: 'Active', renewal_due: 'Renewal due', urgent_renewal: 'Urgent renewal' }
const STATUS_VARIANT = { active: 'green', renewal_due: 'amber', urgent_renewal: 'red' }
const PAYMENT_STATUS_LABEL = { paid: 'Paid', partial: 'Partial', unpaid: 'Unpaid' }
const PAYMENT_STATUS_VARIANT = { paid: 'green', partial: 'amber', unpaid: 'red' }
const METHOD_LABEL = { e_transfer: 'E-transfer', cash: 'Cash', cheque: 'Cheque', other: 'Other' }
const CHARGE_TYPE_LABEL = { rent: 'Rent', addon: 'Addon', late_fee: 'Late fee', custom: 'Custom', credit: 'Credit' }
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

// A credit's amount arrives from the API already negative (see backend
// utils/ledger.js) — this puts the minus sign before the $ instead of
// jsPDF/toLocaleString's default "$-50.00".
function formatSignedMoney(amount) {
  const n = Number(amount)
  return n < 0 ? `-${formatMoney(-n)}` : formatMoney(n)
}

function initial(name) {
  return (name || '?').trim().charAt(0).toUpperCase()
}

function TenantProfile() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [tenant, setTenant] = useState(null)
  const [allTenants, setAllTenants] = useState([])
  const [addons, setAddons] = useState([])
  const [ledger, setLedger] = useState([])
  const [documents, setDocuments] = useState([])
  const [inspection, setInspection] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [editingTenant, setEditingTenant] = useState(false)
  const [passwordModal, setPasswordModal] = useState(false)
  const [editingPayment, setEditingPayment] = useState(null) // null | 'new' | the payment being edited
  const [chargeModal, setChargeModal] = useState(null) // null | 'new' | the charge being edited
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const [pdfRangeModal, setPdfRangeModal] = useState(false)
  const [pdfFrom, setPdfFrom] = useState('')
  const [pdfTo, setPdfTo] = useState('')
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
      const [t, tenants, addonRows, ledgerRows, docRows] = await Promise.all([
        getTenant(id),
        getTenants(),
        getAddons(),
        getTenantLedger(id),
        getDocuments(id),
      ])
      setTenant(t)
      setNotesDraft(t.manager_notes || '')
      setAllTenants(tenants)
      setAddons(addonRows)
      setLedger(ledgerRows)
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

  async function handlePaymentDelete(entry) {
    if (!window.confirm(`Delete this ${formatMoney(entry.amount)} payment?`)) return
    await deleteRentPayment(entry.id)
    await load()
  }

  async function handleChargeSubmit(values) {
    if (chargeModal && chargeModal !== 'new') {
      await updateCharge(chargeModal.id, values)
    } else {
      await createCharge(tenant.tenant_id, values)
    }
    setChargeModal(null)
    await load()
  }

  async function handleChargeDelete(entry) {
    if (!window.confirm(`Delete this ${formatMoney(Math.abs(entry.amount))} charge?`)) return
    try {
      await deleteCharge(entry.id)
      await load()
    } catch (err) {
      window.alert(err.message)
    }
  }

  async function handleDownloadPdf(e) {
    e.preventDefault()
    setDownloadingPdf(true)
    try {
      await downloadTenantLedgerPdf(tenant, ledger, { from: pdfFrom || null, to: pdfTo || null })
      setPdfRangeModal(false)
      setPdfFrom('')
      setPdfTo('')
    } catch (err) {
      window.alert(err.message)
    } finally {
      setDownloadingPdf(false)
    }
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
    if (!window.confirm('Delete this notice log entry?')) return
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

  return (
    <div>
      <PageHeader title="Tenant Profile">
        <button className="btn btn-ghost" onClick={() => setEditingTenant(true)}>
          Edit
        </button>
      </PageHeader>

      <div className="content">
        <Link to="/tenants" className="back-link">
          ← Tenants
        </Link>

        {/* --- Header: name, property/unit, key badges --- */}
        <div className="card tenant-header-card">
          <div className="avatar tenant-avatar">{initial(tenant.full_name)}</div>
          <div className="tenant-header-main">
            <h1 className="tenant-header-name">{tenant.full_name}</h1>
            <p className="tenant-header-sub">
              {tenant.property_name} · Unit {tenant.unit_number}
            </p>
            <div className="tenant-header-badges">
              <Badge variant={STATUS_VARIANT[tenant.status]}>{STATUS_LABEL[tenant.status]}</Badge>
              <Badge variant={PAYMENT_STATUS_VARIANT[tenant.payment_status]}>
                {PAYMENT_STATUS_LABEL[tenant.payment_status]} this month
              </Badge>
              <Badge variant={tenant.has_login ? 'green' : 'slate'}>
                Portal {tenant.has_login ? 'active' : 'not set'}
              </Badge>
            </div>
          </div>
        </div>

        {/* --- Additional occupants (directly below the header) --- */}
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

        {/* --- Balance due --- */}
        <div className="card balance-due-card">
          <span className="balance-due-label">Balance due</span>
          <span className="balance-due-amount">{formatMoney(tenant.balance_due)}</span>
        </div>

        <div className="tenant-info-grid card" style={{ marginTop: 12 }}>
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
            <span className="tenant-info-label">Deposit</span>
            <span className="tenant-info-value mono">{formatMoney(tenant.deposit_amount)}</span>
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

        {/* --- Rent ledger --- */}
        <div className="section-head">
          <h2>Rent ledger</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setPdfRangeModal(true)}
              disabled={ledger.length === 0}
            >
              Download PDF
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setChargeModal('new')}>
              + Create charge
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => setEditingPayment('new')}>
              + Record a payment
            </button>
          </div>
        </div>

        {ledger.length === 0 ? (
          <div className="empty-state card">
            <h3>Nothing on the ledger yet</h3>
          </div>
        ) : (
          <div className="card table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Balance</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((entry) => (
                  <tr key={`${entry.type}-${entry.id}`}>
                    <td className="mono">{formatDate(entry.date)}</td>
                    <td>
                      {entry.type === 'charge' ? entry.description : `Payment (${METHOD_LABEL[entry.method]})`}
                    </td>
                    <td>
                      {entry.type === 'charge' ? (
                        <Badge variant={entry.charge_type === 'credit' ? 'amber' : 'slate'}>
                          {CHARGE_TYPE_LABEL[entry.charge_type]}
                        </Badge>
                      ) : (
                        <Badge variant="green">Payment</Badge>
                      )}
                    </td>
                    <td className="mono">
                      {entry.type === 'charge' ? formatSignedMoney(entry.amount) : `-${formatMoney(entry.amount)}`}
                    </td>
                    <td>
                      {entry.type === 'charge' && entry.status ? (
                        <Badge variant={PAYMENT_STATUS_VARIANT[entry.status]}>{PAYMENT_STATUS_LABEL[entry.status]}</Badge>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="mono">{formatMoney(entry.running_balance)}</td>
                    <td>
                      <div className="table-actions">
                        {entry.type === 'charge' ? (
                          <>
                            <button className="btn btn-ghost btn-sm" onClick={() => setChargeModal(entry)}>
                              Edit
                            </button>
                            <button className="btn btn-danger btn-sm" onClick={() => handleChargeDelete(entry)}>
                              Delete
                            </button>
                          </>
                        ) : (
                          <>
                            <button className="btn btn-ghost btn-sm" onClick={() => setEditingPayment(entry)}>
                              Edit
                            </button>
                            <button className="btn btn-danger btn-sm" onClick={() => handlePaymentDelete(entry)}>
                              Delete
                            </button>
                          </>
                        )}
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

        {/* --- Notices log --- */}
        <div className="section-head">
          <h2>Notices log</h2>
          <button className="btn btn-primary btn-sm" onClick={() => setEvictionModal('new')}>
            + Log event
          </button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--slate)', margin: '-6px 0 10px' }}>
          Visible only to managers — never shown to the tenant.
        </p>
        {tenant.eviction_events.length === 0 ? (
          <div className="empty-state card">
            <h3>No notices logged</h3>
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
                  {e.attachment_url && (
                    <a
                      href={getEvictionEventAttachmentUrl(e.id)}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-ghost btn-sm"
                    >
                      View
                    </a>
                  )}
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
            rentAmount={tenant.balance_due}
            initialValues={
              editingPayment !== 'new'
                ? {
                    amount: editingPayment.amount,
                    payment_date: editingPayment.date?.slice(0, 10),
                    method: editingPayment.method,
                    period_covered: editingPayment.date?.slice(0, 7),
                    notes: editingPayment.notes || '',
                  }
                : undefined
            }
            onSubmit={handlePaymentSubmit}
            onCancel={() => setEditingPayment(null)}
          />
        </Modal>
      )}

      {pdfRangeModal && (
        <Modal title="Download ledger PDF" onClose={() => setPdfRangeModal(false)}>
          <form onSubmit={handleDownloadPdf}>
            <p style={{ fontSize: 12.5, color: 'var(--slate)', marginBottom: 16 }}>
              Leave both dates blank to export the tenant's full history.
            </p>
            <div className="form-row">
              <div className="form-field">
                <label htmlFor="pdf_from">From</label>
                <input id="pdf_from" type="date" value={pdfFrom} onChange={(e) => setPdfFrom(e.target.value)} />
              </div>
              <div className="form-field">
                <label htmlFor="pdf_to">To</label>
                <input id="pdf_to" type="date" value={pdfTo} onChange={(e) => setPdfTo(e.target.value)} />
              </div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setPdfRangeModal(false)} disabled={downloadingPdf}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={downloadingPdf}>
                {downloadingPdf ? 'Preparing…' : 'Generate PDF'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {chargeModal && (
        <Modal title={chargeModal === 'new' ? 'Create charge' : 'Edit charge'} onClose={() => setChargeModal(null)}>
          <ChargeForm
            isEditing={chargeModal !== 'new'}
            initialValues={
              chargeModal !== 'new'
                ? {
                    description: chargeModal.description,
                    // A credit is stored (and arrives here) as a negative
                    // amount — the form always shows/edits a plain positive
                    // number, same convention as creating one.
                    amount: Math.abs(chargeModal.amount),
                    due_date: chargeModal.date?.slice(0, 10),
                  }
                : undefined
            }
            onSubmit={handleChargeSubmit}
            onCancel={() => setChargeModal(null)}
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
        <Modal title={evictionModal === 'new' ? 'Log notice' : 'Edit notice'} onClose={() => setEvictionModal(null)}>
          <EvictionEventForm
            initialValues={evictionModal === 'new' ? undefined : evictionModal}
            existingAttachmentUrl={
              evictionModal !== 'new' && evictionModal.attachment_url
                ? getEvictionEventAttachmentUrl(evictionModal.id)
                : null
            }
            onSubmit={handleSaveEviction}
            onCancel={() => setEvictionModal(null)}
          />
        </Modal>
      )}
    </div>
  )
}

export default TenantProfile
