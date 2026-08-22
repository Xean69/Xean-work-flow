import { useState } from 'react'

const DOC_TYPE_LABELS = {
  lease: 'Lease',
  invoice: 'Invoice',
  inspection: 'Inspection',
  application: 'Application',
  id: 'ID',
  other: 'Other',
}

// Collects the metadata for a file the user just selected (via drag-drop or
// browse) before it's actually uploaded. properties: [{id, name}]. tenants:
// [{value, label}]. presetTenantId/presetPropertyId (from the Tenant Profile
// page, where both are already known) hide those pickers and default them,
// instead of asking the manager to re-select a tenant they're already
// looking at.
function DocumentForm({ file, properties, tenants, presetTenantId, presetPropertyId, onSubmit, onCancel }) {
  const [docType, setDocType] = useState('other')
  const [propertyId, setPropertyId] = useState(presetPropertyId || '')
  const [tenantId, setTenantId] = useState(presetTenantId || '')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('doc_type', docType)
      if (propertyId) formData.append('property_id', propertyId)
      if (tenantId) formData.append('tenant_id', tenantId)
      if (notes) formData.append('notes', notes)
      await onSubmit(formData)
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <p className="form-error">{error}</p>}

      <div className="doc-upload-file">
        <span className="doc-icon">📄</span>
        <span>{file.name}</span>
      </div>

      <div className="form-row">
        <div className="form-field">
          <label htmlFor="doc_type">Document type</label>
          <select id="doc_type" value={docType} onChange={(e) => setDocType(e.target.value)}>
            {Object.entries(DOC_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        {!presetPropertyId && (
          <div className="form-field">
            <label htmlFor="property_id">Property (optional)</label>
            <select id="property_id" value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
              <option value="">None</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {!presetTenantId && (
        <div className="form-field">
          <label htmlFor="tenant_id">Tenant (optional)</label>
          <select id="tenant_id" value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
            <option value="">None</option>
            {tenants.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="form-field">
        <label htmlFor="notes">Notes (optional)</label>
        <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </div>

      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Uploading…' : 'Upload'}
        </button>
      </div>
    </form>
  )
}

export default DocumentForm
