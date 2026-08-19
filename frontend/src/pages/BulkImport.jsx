import { useState } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../components/PageHeader.jsx'
import {
  previewPropertyImport,
  commitPropertyImport,
  previewTenantImport,
  commitTenantImport,
} from '../api/client.js'
import './BulkImport.css'

// Column order here drives both the downloadable template and the preview
// table — must match the backend's PROPERTY_CSV_HEADERS/TENANT_CSV_HEADERS
// (backend/src/utils/importValidate.js) since that's what it reads by name.
const IMPORT_TYPES = {
  properties: {
    label: 'Properties & Units',
    description: 'One row per unit. Rows sharing the same name + address are grouped into one property.',
    headers: ['name', 'address', 'city', 'province', 'postal_code', 'unit_number', 'bedrooms', 'bathrooms', 'rent_amount'],
    required: ['name', 'address', 'city', 'province', 'postal_code', 'unit_number', 'rent_amount'],
    example: ['Maple Court', '123 Maple Ave', 'Edmonton', 'AB', 'T5J 0N3', '101', '2', '1', '1450'],
    templateFile: 'xean-properties-template.csv',
    preview: previewPropertyImport,
    commit: commitPropertyImport,
  },
  tenants: {
    label: 'Tenants',
    description: 'Each row must reference a property + unit that already exists in your portfolio.',
    headers: ['full_name', 'email', 'phone', 'property_name', 'unit_number', 'lease_start', 'lease_end', 'rent_amount', 'deposit_amount'],
    required: ['full_name', 'property_name', 'unit_number', 'lease_start', 'lease_end', 'rent_amount', 'deposit_amount'],
    example: ['Jamie Rivera', 'jamie@example.com', '780-555-0100', 'Maple Court', '101', '2026-01-01', '2027-01-01', '1450', '1450'],
    templateFile: 'xean-tenants-template.csv',
    preview: previewTenantImport,
    commit: commitTenantImport,
  },
}

const HEADER_LABELS = {
  name: 'Name',
  address: 'Address',
  city: 'City',
  province: 'Province',
  postal_code: 'Postal code',
  unit_number: 'Unit #',
  bedrooms: 'Beds',
  bathrooms: 'Baths',
  rent_amount: 'Rent',
  full_name: 'Full name',
  email: 'Email',
  phone: 'Phone',
  property_name: 'Property',
  lease_start: 'Lease start',
  lease_end: 'Lease end',
  deposit_amount: 'Deposit',
}

function downloadCsv(headers, exampleRow, filename) {
  const csv = [headers.join(','), exampleRow.map((v) => (v.includes(',') ? `"${v}"` : v)).join(',')].join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function BulkImport() {
  const [importType, setImportType] = useState('properties')
  const [file, setFile] = useState(null)
  const [previewing, setPreviewing] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [preview, setPreview] = useState(null) // { rows: [{row, values, errors}], validCount, errorCount }
  const [rowState, setRowState] = useState({}) // { [row]: { included, values } }
  const [committing, setCommitting] = useState(false)
  const [commitError, setCommitError] = useState('')
  const [summary, setSummary] = useState(null)

  const config = IMPORT_TYPES[importType]

  function resetAll() {
    setFile(null)
    setPreview(null)
    setRowState({})
    setPreviewError('')
    setCommitError('')
    setSummary(null)
  }

  function selectType(type) {
    setImportType(type)
    resetAll()
  }

  async function handlePreview() {
    if (!file) return
    setPreviewing(true)
    setPreviewError('')
    setSummary(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const result = await config.preview(formData)
      setPreview(result)
      const seeded = {}
      for (const row of result.rows) {
        seeded[row.row] = { included: row.errors.length === 0, values: { ...row.values } }
      }
      setRowState(seeded)
    } catch (err) {
      setPreviewError(err.message)
      setPreview(null)
    } finally {
      setPreviewing(false)
    }
  }

  function updateCell(rowNum, field, value) {
    setRowState((prev) => ({
      ...prev,
      [rowNum]: { ...prev[rowNum], values: { ...prev[rowNum].values, [field]: value } },
    }))
  }

  function toggleIncluded(rowNum) {
    setRowState((prev) => ({ ...prev, [rowNum]: { ...prev[rowNum], included: !prev[rowNum].included } }))
  }

  function setAllIncluded(included) {
    setRowState((prev) => {
      const next = {}
      for (const [row, state] of Object.entries(prev)) next[row] = { ...state, included }
      return next
    })
  }

  const includedCount = Object.values(rowState).filter((r) => r.included).length

  async function handleCommit() {
    const rowsToImport = preview.rows.filter((r) => rowState[r.row]?.included).map((r) => rowState[r.row].values)
    if (rowsToImport.length === 0) return
    setCommitting(true)
    setCommitError('')
    try {
      const result = await config.commit(rowsToImport)
      setSummary(result)
      setPreview(null)
      setRowState({})
    } catch (err) {
      setCommitError(err.message)
    } finally {
      setCommitting(false)
    }
  }

  return (
    <div>
      <PageHeader title="Bulk Import" subtitle="Bring in your existing portfolio from a CSV file instead of adding everything one by one.">
        <Link to="/properties" className="btn btn-ghost">
          ← Back to Properties
        </Link>
      </PageHeader>

      <div className="content">
        <div className="import-type-tabs">
          {Object.entries(IMPORT_TYPES).map(([key, cfg]) => (
            <button
              key={key}
              className={'import-type-tab' + (importType === key ? ' active' : '')}
              onClick={() => selectType(key)}
            >
              {cfg.label}
            </button>
          ))}
        </div>

        {!summary && (
          <div className="card import-setup">
            <p className="import-desc">{config.description}</p>

            <div className="import-setup-row">
              <button className="btn btn-ghost btn-sm" onClick={() => downloadCsv(config.headers, config.example, config.templateFile)}>
                ↓ Download {config.label} template
              </button>
            </div>

            <div className="import-setup-row">
              <input
                type="file"
                accept=".csv"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null)
                  setPreview(null)
                  setPreviewError('')
                }}
              />
              <button className="btn btn-primary btn-sm" onClick={handlePreview} disabled={!file || previewing}>
                {previewing ? 'Reading file…' : 'Preview import'}
              </button>
            </div>

            {previewError && <p className="form-error">{previewError}</p>}
          </div>
        )}

        {preview && (
          <div className="import-review">
            <div className="import-review-head">
              <div>
                <strong>{preview.validCount}</strong> row{preview.validCount === 1 ? '' : 's'} ready
                {preview.errorCount > 0 && (
                  <>
                    {' '}
                    · <strong>{preview.errorCount}</strong> flagged
                  </>
                )}
                {' '}· <strong>{includedCount}</strong> selected to import
              </div>
              <div className="import-review-actions">
                <button className="btn btn-ghost btn-sm" onClick={() => setAllIncluded(true)}>
                  Select all
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setAllIncluded(false)}>
                  Select none
                </button>
              </div>
            </div>

            <div className="card import-table-wrap">
              <table className="import-table">
                <thead>
                  <tr>
                    <th></th>
                    {config.headers.map((h) => (
                      <th key={h}>{HEADER_LABELS[h] ?? h}</th>
                    ))}
                    <th>Issues</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row) => {
                    const state = rowState[row.row]
                    if (!state) return null
                    return (
                      <tr key={row.row} className={row.errors.length > 0 ? 'import-row-error' : undefined}>
                        <td>
                          <input type="checkbox" checked={state.included} onChange={() => toggleIncluded(row.row)} />
                        </td>
                        {config.headers.map((h) => (
                          <td key={h}>
                            <input
                              className="import-cell-input"
                              value={state.values[h] ?? ''}
                              onChange={(e) => updateCell(row.row, h, e.target.value)}
                            />
                          </td>
                        ))}
                        <td className="import-issues-cell">
                          {row.errors.length > 0 && (
                            <ul className="import-error-list">
                              {row.errors.map((e, i) => (
                                <li key={i}>{e}</li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {commitError && <p className="form-error">{commitError}</p>}

            <div className="import-commit-row">
              <button className="btn btn-ghost" onClick={resetAll} disabled={committing}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleCommit} disabled={committing || includedCount === 0}>
                {committing ? 'Importing…' : `Import ${includedCount} row${includedCount === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        )}

        {summary && (
          <div className="card import-summary">
            <h3>Import complete</h3>
            {importType === 'properties' ? (
              <p>
                Created <strong>{summary.createdProperties}</strong> propert{summary.createdProperties === 1 ? 'y' : 'ies'} and{' '}
                <strong>{summary.createdUnits}</strong> unit{summary.createdUnits === 1 ? '' : 's'}.
              </p>
            ) : (
              <p>
                Created <strong>{summary.created}</strong> tenant{summary.created === 1 ? '' : 's'}.
              </p>
            )}

            {summary.skipped.length > 0 && (
              <>
                <p className="import-summary-skipped-label">
                  {summary.skipped.length} row{summary.skipped.length === 1 ? '' : 's'} skipped:
                </p>
                <ul className="import-error-list">
                  {summary.skipped.map((s, i) => (
                    <li key={i}>
                      Row {s.row}: {s.reason}
                    </li>
                  ))}
                </ul>
              </>
            )}

            <div className="import-commit-row">
              <button className="btn btn-ghost" onClick={resetAll}>
                Import another file
              </button>
              <Link to={importType === 'properties' ? '/properties' : '/tenants'} className="btn btn-primary">
                Go to {importType === 'properties' ? 'Properties' : 'Tenants'}
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default BulkImport
