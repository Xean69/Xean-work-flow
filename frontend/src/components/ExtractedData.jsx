import { useState } from 'react'
import Badge from './Badge.jsx'
import { extractDocument, updateExtractedData } from '../api/client.js'

// Mirrors the tool schemas in backend/src/services/extraction.js — same
// fields, same doc_types. Exported so Documents.jsx can reuse the same
// per-type field list to detect a likely doc_type/content mismatch.
export const FIELD_CONFIG = {
  lease: [
    { key: 'tenant_name', label: 'Tenant', type: 'text' },
    { key: 'rent_amount', label: 'Rent', type: 'currency' },
    { key: 'deposit_amount', label: 'Deposit', type: 'currency' },
    { key: 'lease_start_date', label: 'Start', type: 'date' },
    { key: 'lease_end_date', label: 'End', type: 'date' },
  ],
  invoice: [
    { key: 'vendor_name', label: 'Vendor', type: 'text' },
    { key: 'amount', label: 'Amount', type: 'currency' },
    { key: 'due_date', label: 'Due', type: 'date' },
  ],
  inspection: [
    { key: 'deductions', label: 'Deductions', type: 'deductions' },
    { key: 'total_amount', label: 'Total', type: 'currency' },
  ],
}

function formatCurrency(value) {
  if (value === null || value === undefined || value === '') return '—'
  return `$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDeductions(list) {
  if (!Array.isArray(list) || list.length === 0) return 'None noted'
  return list.map((d) => (d.amount != null ? `${d.description} ($${d.amount})` : d.description)).join(', ')
}

function deductionsToText(list) {
  if (!Array.isArray(list)) return ''
  return list.map((d) => (d.amount != null ? `${d.description} | ${d.amount}` : d.description)).join('\n')
}

function parseDeductionsText(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [description, amount] = line.split('|').map((s) => s.trim())
      return { description, amount: amount ? Number(amount) : null }
    })
}

function buildForm(doc, fields) {
  const source = doc.extracted_data || {}
  const out = {}
  for (const f of fields) {
    out[f.key] = f.type === 'deductions' ? deductionsToText(source[f.key]) : source[f.key] ?? ''
  }
  return out
}

function StatusBadge({ doc }) {
  if (doc.extraction_status === 'success') {
    return doc.extraction_confidence === 'high' ? (
      <Badge variant="green">High confidence</Badge>
    ) : (
      <Badge variant="amber">Low confidence — review</Badge>
    )
  }
  if (doc.extraction_status === 'manual') return <Badge variant="slate">Manually entered</Badge>
  if (doc.extraction_status === 'failed') return <Badge variant="amber">Extraction failed</Badge>
  if (doc.extraction_status === 'not_run') return <Badge variant="slate">Not yet extracted</Badge>
  return null
}

// Shows (and lets staff edit or re-run) the AI-extracted fields for a lease,
// invoice, or inspection document. Renders nothing for doc_types that don't
// support extraction (application, other).
function ExtractedData({ doc, canWrite, onChange }) {
  const fields = FIELD_CONFIG[doc.doc_type]
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(() => (fields ? buildForm(doc, fields) : {}))
  const [saving, setSaving] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [error, setError] = useState('')

  if (!fields) return null

  function startEdit() {
    setForm(buildForm(doc, fields))
    setError('')
    setEditing(true)
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const payload = {}
      for (const f of fields) {
        payload[f.key] = f.type === 'deductions' ? parseDeductionsText(form[f.key]) : form[f.key]
      }
      await updateExtractedData(doc.id, payload)
      setEditing(false)
      await onChange()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleReExtract() {
    setExtracting(true)
    setError('')
    try {
      await extractDocument(doc.id)
      await onChange()
    } catch (err) {
      setError(err.message)
    } finally {
      setExtracting(false)
    }
  }

  const data = doc.extracted_data || {}

  return (
    <div className="doc-extracted">
      <div className="doc-extracted-head">
        <StatusBadge doc={doc} />
        {canWrite && !editing && (
          <div className="doc-extracted-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={handleReExtract} disabled={extracting}>
              {extracting ? 'Extracting…' : doc.extraction_status === 'not_run' ? 'Extract' : 'Re-extract'}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={startEdit}>
              Edit
            </button>
          </div>
        )}
      </div>

      {error && <p className="form-error">{error}</p>}

      {editing ? (
        <div className="doc-extracted-form">
          {fields.map((f) => (
            <div className="form-field" key={f.key}>
              <label htmlFor={`ext-${doc.id}-${f.key}`}>{f.label}</label>
              {f.type === 'deductions' ? (
                <textarea
                  id={`ext-${doc.id}-${f.key}`}
                  rows={3}
                  placeholder="One per line: description | amount"
                  value={form[f.key]}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                />
              ) : (
                <input
                  id={`ext-${doc.id}-${f.key}`}
                  type={f.type === 'date' ? 'date' : 'text'}
                  value={form[f.key]}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                />
              )}
            </div>
          ))}
          <div className="form-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      ) : (
        <div className="doc-extracted-fields">
          {fields.map((f) => (
            <span key={f.key} className="doc-extracted-field">
              <strong>{f.label}:</strong>{' '}
              {f.type === 'deductions'
                ? formatDeductions(data[f.key])
                : f.type === 'currency'
                ? formatCurrency(data[f.key])
                : data[f.key] || '—'}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export default ExtractedData
