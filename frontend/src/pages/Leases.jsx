import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  getLeases,
  getLease,
  getTenants,
  createLease,
  updateLeaseContent,
  regenerateLease,
  sendLease,
  voidLease,
  deleteLease,
  uploadDocument,
  getDocumentUrl,
  uploadBusinessLogo,
  setAiLeaseGeneration,
} from '../api/client.js'
import { generateLeasePdfBlob } from '../utils/leasePdf.js'
import PageHeader from '../components/PageHeader.jsx'
import Badge from '../components/Badge.jsx'
import Modal from '../components/Modal.jsx'
import './Leases.css'

const STATUS_VARIANT = { draft: 'slate', sent: 'amber', signed: 'green', void: 'red' }
const STATUS_LABEL = { draft: 'Draft', sent: 'Sent', signed: 'Signed', void: 'Void' }

function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatDateTime(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatMoney(amount) {
  return `$${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
}

// The one-time, owner-only opt-in for Generate mode — see schema.sql's
// note on businesses.ai_lease_generation_enabled. Rendered inline in the
// create form rather than a separate settings page, since this is the
// only place in the app that currently needs it.
function EnableAiGeneration({ admin, onEnabled }) {
  const [acknowledged, setAcknowledged] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  if (admin.role !== 'owner') {
    return (
      <p className="lease-ai-disabled-note">
        AI lease drafting isn't enabled for your business yet. Ask the owner to enable it, or use Template mode instead.
      </p>
    )
  }

  async function handleEnable() {
    setError('')
    setSubmitting(true)
    try {
      await setAiLeaseGeneration(true, true)
      onEnabled()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="lease-ai-enable-box">
      {error && <p className="form-error">{error}</p>}
      <p>
        AI lease drafting isn't enabled for your business yet. AI-generated legal language carries real risk if
        incomplete or jurisdiction-inappropriate — every draft still requires your review before it can be sent.
      </p>
      <label className="lease-checkbox-row">
        <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
        I understand and want to enable AI lease drafting for this business.
      </label>
      <button
        type="button"
        className="btn btn-ghost"
        disabled={!acknowledged || submitting}
        onClick={handleEnable}
      >
        {submitting ? 'Enabling…' : 'Enable AI Lease Drafting'}
      </button>
    </div>
  )
}

function CreateLeaseForm({ admin, tenants, onCreated, onCancel, onAdminRefresh }) {
  const [tenantId, setTenantId] = useState('')
  const [customTerms, setCustomTerms] = useState('')
  const [clauses, setClauses] = useState([])
  const [mode, setMode] = useState('template')
  const [templateFile, setTemplateFile] = useState(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // GET /api/tenants is one row per unit (vacant units included, with
  // tenant_id null) — only units with an actual tenant can have a lease.
  const leasableTenants = tenants.filter((t) => t.tenant_id)
  const tenant = leasableTenants.find((t) => String(t.tenant_id) === String(tenantId))

  function addClause() {
    setClauses((prev) => [...prev, { heading: '', body: '' }])
  }
  function updateClause(i, field, value) {
    setClauses((prev) => prev.map((c, idx) => (idx === i ? { ...c, [field]: value } : c)))
  }
  function removeClause(i) {
    setClauses((prev) => prev.filter((_, idx) => idx !== i))
  }

  async function handleLogoChange(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploadingLogo(true)
    try {
      const formData = new FormData()
      formData.append('logo', file)
      await uploadBusinessLogo(formData)
      await onAdminRefresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setUploadingLogo(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!tenantId) return setError('Choose a tenant')
    if (mode === 'template' && !templateFile) return setError('Upload a template document')
    setSubmitting(true)
    try {
      const formData = new FormData()
      formData.append('tenant_id', String(tenantId))
      formData.append('generation_mode', mode)
      if (customTerms) formData.append('custom_terms', customTerms)
      const validClauses = clauses.filter((c) => c.heading.trim() && c.body.trim())
      formData.append('custom_clauses', JSON.stringify(validClauses))
      if (mode === 'template') formData.append('template_file', templateFile)
      const lease = await createLease(formData)
      onCreated(lease)
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <p className="form-error">{error}</p>}

      <div className="form-field">
        <label htmlFor="lease_tenant">Tenant</label>
        <select id="lease_tenant" value={tenantId} onChange={(e) => setTenantId(e.target.value)} required>
          <option value="">Select a tenant…</option>
          {leasableTenants.map((t) => (
            <option key={t.tenant_id} value={t.tenant_id}>
              {t.full_name} — {t.property_name} · {t.unit_number}
            </option>
          ))}
        </select>
      </div>

      {tenant && (
        <div className="lease-tenant-summary">
          <div>
            <span className="lease-summary-label">Rent</span> {formatMoney(tenant.rent_amount)}/mo
          </div>
          <div>
            <span className="lease-summary-label">Deposit</span> {formatMoney(tenant.deposit_amount)}
          </div>
          <div>
            <span className="lease-summary-label">Term</span> {formatDate(tenant.lease_start)} – {formatDate(tenant.lease_end)}
          </div>
        </div>
      )}

      <div className="form-field">
        <label htmlFor="lease_custom_terms">Custom terms (optional)</label>
        <textarea
          id="lease_custom_terms"
          value={customTerms}
          onChange={(e) => setCustomTerms(e.target.value)}
          rows={2}
          placeholder="Any additional terms you want reflected in the lease…"
        />
      </div>

      <div className="form-field">
        <label>Custom clauses (optional)</label>
        {clauses.map((c, i) => (
          <div key={i} className="lease-clause-row">
            <input
              placeholder="Heading (e.g. Parking)"
              value={c.heading}
              onChange={(e) => updateClause(i, 'heading', e.target.value)}
            />
            <textarea
              placeholder="Clause text"
              value={c.body}
              onChange={(e) => updateClause(i, 'body', e.target.value)}
              rows={2}
            />
            <button type="button" className="btn btn-ghost" onClick={() => removeClause(i)}>
              Remove
            </button>
          </div>
        ))}
        <button type="button" className="btn btn-ghost" onClick={addClause}>
          + Add clause
        </button>
      </div>

      <div className="form-field">
        <label>Generation mode</label>
        <div className="lease-mode-options">
          <label className={'lease-mode-card' + (mode === 'template' ? ' active' : '')}>
            <input type="radio" name="mode" checked={mode === 'template'} onChange={() => setMode('template')} />
            <strong>Fill my template</strong>
            <span>Upload your own lease document — AI fills in the blanks, your legal language stays untouched.</span>
          </label>
          <label
            className={'lease-mode-card' + (mode === 'generate' ? ' active' : '') + (!admin.ai_lease_generation_enabled ? ' disabled' : '')}
          >
            <input
              type="radio"
              name="mode"
              checked={mode === 'generate'}
              disabled={!admin.ai_lease_generation_enabled}
              onChange={() => setMode('generate')}
            />
            <strong>Generate from scratch</strong>
            <span>AI drafts the full lease from the details above.</span>
          </label>
        </div>
        {!admin.ai_lease_generation_enabled && (
          <EnableAiGeneration admin={admin} onEnabled={onAdminRefresh} />
        )}
      </div>

      {mode === 'template' && (
        <div className="form-field">
          <label htmlFor="lease_template_file">Template document (PDF)</label>
          <input
            id="lease_template_file"
            type="file"
            accept="application/pdf"
            onChange={(e) => setTemplateFile(e.target.files[0] || null)}
          />
        </div>
      )}

      <div className="form-field">
        <label htmlFor="lease_logo">Company logo (optional, reused on future leases)</label>
        {admin.logo_url && <img src={admin.logo_url} alt="Business logo" className="lease-logo-preview" />}
        <input id="lease_logo" type="file" accept="image/*" onChange={handleLogoChange} disabled={uploadingLogo} />
        {uploadingLogo && <span className="lease-logo-uploading">Uploading…</span>}
      </div>

      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Drafting…' : 'Generate Draft'}
        </button>
      </div>
    </form>
  )
}

function ReviewLease({ lease, admin, onChange, onSent, onDeleted, onClose }) {
  const [sections, setSections] = useState(lease.content.sections)
  const [saving, setSaving] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  function updateSection(i, body) {
    setSections((prev) => prev.map((s, idx) => (idx === i ? { ...s, body } : s)))
  }

  async function handleSave() {
    setError('')
    setSaving(true)
    try {
      const updated = await updateLeaseContent(lease.id, { sections })
      onChange(updated)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleRegenerate() {
    if (!window.confirm('This discards your edits and drafts the lease again from scratch. Continue?')) return
    setError('')
    setRegenerating(true)
    try {
      const updated = await regenerateLease(lease.id)
      setSections(updated.content.sections)
      onChange(updated)
    } catch (err) {
      setError(err.message)
    } finally {
      setRegenerating(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm('Delete this draft lease? This can\'t be undone.')) return
    try {
      await deleteLease(lease.id)
      onDeleted(lease.id)
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleSend() {
    setError('')
    setSending(true)
    try {
      const saved = await updateLeaseContent(lease.id, { sections })
      const pdfBlob = await generateLeasePdfBlob({
        lease: saved,
        tenantName: lease.tenant_name_snapshot,
        propertyAddress: lease.property_name,
        unitNumber: lease.unit_number,
        logoUrl: admin.logo_url,
      })
      const formData = new FormData()
      formData.append('file', pdfBlob, `lease-${lease.tenant_name_snapshot.replace(/[^a-z0-9]+/gi, '-')}.pdf`)
      formData.append('doc_type', 'lease')
      formData.append('tenant_id', lease.tenant_id)
      const document = await uploadDocument(formData)
      const sentLease = await sendLease(lease.id, document.id)
      onSent(sentLease)
    } catch (err) {
      setError(err.message)
      setSending(false)
    }
  }

  const placeholderCount = sections.filter((s) => s.contains_placeholder).length

  return (
    <div className="lease-review">
      {error && <p className="form-error">{error}</p>}

      {lease.generation_mode === 'generate' ? (
        <div className="lease-disclaimer lease-disclaimer-strong">
          <strong>This lease was drafted with AI assistance.</strong> Review it carefully and consult a lawyer or
          local housing authority before sending — Xean does not guarantee this document is complete, accurate, or
          enforceable in your jurisdiction.
        </div>
      ) : (
        <div className="lease-disclaimer">
          AI transcribed your uploaded template and filled in the highlighted blanks. Since this is a transcription
          (not a direct edit of your file), compare the result against your original template before sending.
        </div>
      )}

      {placeholderCount > 0 && (
        <p className="lease-placeholder-note">
          ⚠ {placeholderCount} section{placeholderCount === 1 ? '' : 's'} contain a bracketed placeholder that needs
          your input before sending — look for text like [CONFIRM LOCAL NOTICE PERIOD].
        </p>
      )}

      <div className="lease-sections">
        {sections.map((s, i) => (
          <div key={i} className={'lease-section' + (s.contains_placeholder ? ' has-placeholder' : '')}>
            <label>{s.heading}</label>
            <textarea value={s.body} onChange={(e) => updateSection(i, e.target.value)} rows={4} />
          </div>
        ))}
      </div>

      <div className="form-actions lease-review-actions">
        <button type="button" className="btn btn-ghost" onClick={handleDelete}>
          Delete draft
        </button>
        <button type="button" className="btn btn-ghost" onClick={handleRegenerate} disabled={regenerating}>
          {regenerating ? 'Regenerating…' : 'Regenerate'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>

      <label className="lease-checkbox-row lease-confirm-row">
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
        I have reviewed this lease and confirm it's accurate before sending it to the tenant.
      </label>

      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose} disabled={sending}>
          Close
        </button>
        <button type="button" className="btn btn-primary" disabled={!confirmed || sending} onClick={handleSend}>
          {sending ? 'Sending…' : 'Finalize & Send'}
        </button>
      </div>
    </div>
  )
}

function LeaseDetail({ lease, onVoided, onClose }) {
  const [voiding, setVoiding] = useState(false)
  const [error, setError] = useState('')

  async function handleVoid() {
    const reason = window.prompt('Reason for voiding this lease (optional):') || null
    setError('')
    setVoiding(true)
    try {
      const updated = await voidLease(lease.id, reason)
      onVoided(updated)
    } catch (err) {
      setError(err.message)
    } finally {
      setVoiding(false)
    }
  }

  return (
    <div className="lease-detail">
      {error && <p className="form-error">{error}</p>}

      <div className="lease-tenant-summary">
        <div>
          <span className="lease-summary-label">Tenant</span> {lease.tenant_name_snapshot}
        </div>
        <div>
          <span className="lease-summary-label">Status</span>{' '}
          <Badge variant={STATUS_VARIANT[lease.status]}>{STATUS_LABEL[lease.status]}</Badge>
        </div>
        <div>
          <span className="lease-summary-label">Rent</span> {formatMoney(lease.rent_amount_snapshot)}/mo
        </div>
        <div>
          <span className="lease-summary-label">Deposit</span> {formatMoney(lease.deposit_amount_snapshot)}
        </div>
        <div>
          <span className="lease-summary-label">Term</span> {formatDate(lease.lease_start_snapshot)} –{' '}
          {formatDate(lease.lease_end_snapshot)}
        </div>
        <div>
          <span className="lease-summary-label">Sent</span> {formatDateTime(lease.sent_at)}
        </div>
        {lease.signed_at && (
          <div>
            <span className="lease-summary-label">Signed</span> by {lease.signed_name} on{' '}
            {formatDateTime(lease.signed_at)}
          </div>
        )}
        {lease.status === 'void' && (
          <div>
            <span className="lease-summary-label">Void reason</span> {lease.void_reason || '—'}
          </div>
        )}
      </div>

      {lease.signature_image_url && (
        <div>
          <span className="lease-summary-label">Drawn signature</span>
          <img src={lease.signature_image_url} alt="Tenant signature" className="lease-signature-image" />
        </div>
      )}

      {lease.document_id && (
        <a href={getDocumentUrl(lease.document_id)} target="_blank" rel="noreferrer" className="btn btn-ghost">
          View document
        </a>
      )}

      <div className="lease-sections">
        {lease.content.sections.map((s, i) => (
          <div key={i} className="lease-section">
            <label>{s.heading}</label>
            <p>{s.body}</p>
          </div>
        ))}
      </div>

      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Close
        </button>
        {lease.status === 'sent' && (
          <button type="button" className="btn btn-danger" onClick={handleVoid} disabled={voiding}>
            {voiding ? 'Voiding…' : 'Void lease'}
          </button>
        )}
      </div>
    </div>
  )
}

function Leases() {
  const { admin, refreshAdmin } = useOutletContext()
  const [leases, setLeases] = useState([])
  const [tenants, setTenants] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [filter, setFilter] = useState('all')
  const [showCreate, setShowCreate] = useState(false)
  const [activeLease, setActiveLease] = useState(null) // { lease, mode: 'review' | 'detail' }

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    setLoadError('')
    try {
      const [leaseRows, tenantRows] = await Promise.all([getLeases(), getTenants()])
      setLeases(leaseRows)
      setTenants(tenantRows)
    } catch (err) {
      setLoadError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function openLease(row) {
    const full = await getLease(row.id)
    setActiveLease({ lease: full, mode: row.status === 'draft' ? 'review' : 'detail' })
  }

  const visibleLeases = filter === 'all' ? leases : leases.filter((l) => l.status === filter)

  return (
    <div>
      <PageHeader title="Leases" subtitle="Create and manage lease agreements from one place">
        <button type="button" className="btn btn-primary" onClick={() => setShowCreate(true)}>
          + New Lease
        </button>
      </PageHeader>

      <div className="content">
        <div className="lease-filter-tabs">
          {['all', 'draft', 'sent', 'signed', 'void'].map((f) => (
            <button
              key={f}
              type="button"
              className={'lease-filter-tab' + (filter === f ? ' active' : '')}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'All' : STATUS_LABEL[f]}
            </button>
          ))}
        </div>

        {loadError && <p className="form-error">{loadError}</p>}

        {!loading && visibleLeases.length === 0 && (
          <div className="empty-state card">
            <h3>No leases yet</h3>
            <p>Create your first lease to get started.</p>
          </div>
        )}

        {visibleLeases.length > 0 && (
          <div className="card table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Tenant</th>
                  <th>Property / Unit</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Sent</th>
                  <th>Signed</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visibleLeases.map((l) => (
                  <tr key={l.id}>
                    <td>{l.tenant_name_snapshot}</td>
                    <td>
                      {l.property_name} · {l.unit_number}
                    </td>
                    <td>
                      <Badge variant={STATUS_VARIANT[l.status]}>{STATUS_LABEL[l.status]}</Badge>
                    </td>
                    <td>{formatDate(l.created_at)}</td>
                    <td>{formatDate(l.sent_at)}</td>
                    <td>{formatDate(l.signed_at)}</td>
                    <td className="table-actions">
                      <button type="button" className="btn btn-ghost" onClick={() => openLease(l)}>
                        {l.status === 'draft' ? 'Continue' : 'View'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreate && (
        <Modal title="New Lease" onClose={() => setShowCreate(false)}>
          <CreateLeaseForm
            admin={admin}
            tenants={tenants}
            onAdminRefresh={refreshAdmin}
            onCancel={() => setShowCreate(false)}
            onCreated={(lease) => {
              setShowCreate(false)
              setActiveLease({ lease, mode: 'review' })
              load()
            }}
          />
        </Modal>
      )}

      {activeLease?.mode === 'review' && (
        <Modal title="Review Lease" onClose={() => setActiveLease(null)}>
          <ReviewLease
            lease={activeLease.lease}
            admin={admin}
            onChange={(lease) => setActiveLease({ lease, mode: 'review' })}
            onSent={() => {
              setActiveLease(null)
              load()
            }}
            onDeleted={() => {
              setActiveLease(null)
              load()
            }}
            onClose={() => {
              setActiveLease(null)
              load()
            }}
          />
        </Modal>
      )}

      {activeLease?.mode === 'detail' && (
        <Modal title="Lease" onClose={() => setActiveLease(null)}>
          <LeaseDetail
            lease={activeLease.lease}
            onVoided={(lease) => {
              setActiveLease({ lease, mode: 'detail' })
              load()
            }}
            onClose={() => setActiveLease(null)}
          />
        </Modal>
      )}
    </div>
  )
}

export default Leases
