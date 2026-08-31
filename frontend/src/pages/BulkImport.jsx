import { useState } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../components/PageHeader.jsx'
import {
  previewPropertyImport,
  commitPropertyImport,
  previewTenantImport,
  commitTenantImport,
  analyzeMigrationImport,
  previewMigrationImport,
  commitMigrationImport,
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

// The full set of Xean fields the migration importer's AI mapping step can
// target (mirrors services/importMapping.js's TARGET_FIELDS on the
// backend) — a superset of the two fixed-template imports' headers above,
// since one migration row commonly carries both a unit and its current
// tenant together.
const MIGRATE_TARGET_FIELDS = [
  'name', 'address', 'city', 'province', 'postal_code', 'unit_number', 'bedrooms', 'bathrooms', 'rent_amount',
  'tenant_full_name', 'tenant_email', 'tenant_phone', 'lease_start', 'lease_end', 'deposit_amount',
]
const MIGRATE_FIELD_LABELS = {
  ...HEADER_LABELS,
  tenant_full_name: 'Tenant name',
  tenant_email: 'Tenant email',
  tenant_phone: 'Tenant phone',
}
const MIGRATE_UNIT_FIELDS = ['name', 'address', 'city', 'province', 'postal_code', 'unit_number', 'bedrooms', 'bathrooms', 'rent_amount']
const MIGRATE_TENANT_FIELDS = ['full_name', 'email', 'phone', 'lease_start', 'lease_end', 'deposit_amount']
const MIGRATE_TENANT_FIELD_LABELS = {
  full_name: 'Tenant name',
  email: 'Tenant email',
  phone: 'Tenant phone',
  lease_start: 'Lease start',
  lease_end: 'Lease end',
  deposit_amount: 'Deposit',
}

// "Migrate from any spreadsheet" — the AI-mapping flow. Unlike the two
// fixed-template imports below (which require an exact header match),
// this has its own extra step up front: upload -> AI proposes a column
// mapping -> manager confirms/edits it -> the same kind of editable
// review grid, just fed from arbitrary columns instead of a template.
function MigrateImport() {
  const [step, setStep] = useState('upload') // 'upload' | 'mapping' | 'review' | 'summary'
  const [file, setFile] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState('')
  const [analyzeResult, setAnalyzeResult] = useState(null) // { headers, rows, rowCount, suggestedMapping }
  const [mapping, setMapping] = useState({}) // { sourceHeader: targetField }

  const [previewing, setPreviewing] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [previewResult, setPreviewResult] = useState(null)
  const [rowState, setRowState] = useState({}) // { [row]: { unitIncluded, unitValues, tenantIncluded, tenantValues } }

  const [committing, setCommitting] = useState(false)
  const [commitError, setCommitError] = useState('')
  const [summary, setSummary] = useState(null)

  function resetAll() {
    setStep('upload')
    setFile(null)
    setAnalyzeError('')
    setAnalyzeResult(null)
    setMapping({})
    setPreviewError('')
    setPreviewResult(null)
    setRowState({})
    setCommitError('')
    setSummary(null)
  }

  async function handleAnalyze() {
    if (!file) return
    setAnalyzing(true)
    setAnalyzeError('')
    try {
      const formData = new FormData()
      formData.append('file', file)
      const result = await analyzeMigrationImport(formData)
      setAnalyzeResult(result)
      const seededMapping = {}
      for (const m of result.suggestedMapping) {
        if (m.targetField !== 'unmapped') seededMapping[m.sourceHeader] = m.targetField
      }
      setMapping(seededMapping)
      setStep('mapping')
    } catch (err) {
      setAnalyzeError(err.message)
    } finally {
      setAnalyzing(false)
    }
  }

  function setColumnTarget(sourceHeader, targetField) {
    setMapping((prev) => {
      const next = { ...prev }
      if (targetField) next[sourceHeader] = targetField
      else delete next[sourceHeader]
      return next
    })
  }

  // A target field can only be claimed by one source column at a time —
  // picking it for a new column silently un-assigns whichever column had
  // it before, so the confirmation table can never show two rows both
  // pointed at the same Xean field.
  function assignTarget(sourceHeader, targetField) {
    setMapping((prev) => {
      const next = {}
      for (const [src, tgt] of Object.entries(prev)) {
        if (tgt !== targetField) next[src] = tgt
      }
      if (targetField) next[sourceHeader] = targetField
      return next
    })
  }

  async function handleConfirmMapping() {
    setPreviewing(true)
    setPreviewError('')
    try {
      const result = await previewMigrationImport(analyzeResult.rows, mapping)
      setPreviewResult(result)
      const seeded = {}
      for (const row of result.rows) {
        seeded[row.row] = {
          unitIncluded: row.unit.errors.length === 0,
          unitValues: { ...row.unit.values },
          tenantIncluded: row.tenant ? row.tenant.errors.length === 0 : false,
          tenantValues: row.tenant ? { ...row.tenant.values } : null,
        }
      }
      setRowState(seeded)
      setStep('review')
    } catch (err) {
      setPreviewError(err.message)
    } finally {
      setPreviewing(false)
    }
  }

  function updateUnitCell(rowNum, field, value) {
    setRowState((prev) => ({ ...prev, [rowNum]: { ...prev[rowNum], unitValues: { ...prev[rowNum].unitValues, [field]: value } } }))
  }
  function updateTenantCell(rowNum, field, value) {
    setRowState((prev) => ({ ...prev, [rowNum]: { ...prev[rowNum], tenantValues: { ...prev[rowNum].tenantValues, [field]: value } } }))
  }
  function toggleUnitIncluded(rowNum) {
    setRowState((prev) => ({ ...prev, [rowNum]: { ...prev[rowNum], unitIncluded: !prev[rowNum].unitIncluded } }))
  }
  function toggleTenantIncluded(rowNum) {
    setRowState((prev) => ({ ...prev, [rowNum]: { ...prev[rowNum], tenantIncluded: !prev[rowNum].tenantIncluded } }))
  }
  function setAllIncluded(included) {
    setRowState((prev) => {
      const next = {}
      for (const [row, state] of Object.entries(prev)) {
        next[row] = { ...state, unitIncluded: included, tenantIncluded: state.tenantValues ? included : false }
      }
      return next
    })
  }

  const includedUnitCount = Object.values(rowState).filter((r) => r.unitIncluded).length
  const includedTenantCount = Object.values(rowState).filter((r) => r.tenantIncluded).length

  async function handleCommit() {
    const rows = previewResult.rows.map((r) => {
      const state = rowState[r.row]
      return {
        unitValues: state.unitValues,
        unitIncluded: state.unitIncluded,
        tenantValues: state.tenantValues,
        tenantIncluded: state.tenantIncluded,
      }
    })
    if (rows.every((r) => !r.unitIncluded && !r.tenantIncluded)) return
    setCommitting(true)
    setCommitError('')
    try {
      const result = await commitMigrationImport(rows)
      setSummary(result)
      setStep('summary')
    } catch (err) {
      setCommitError(err.message)
    } finally {
      setCommitting(false)
    }
  }

  if (step === 'upload') {
    return (
      <div className="card import-setup">
        <p className="import-desc">
          Upload a spreadsheet exported from Yardi, AppFolio, Buildium, or any generic property list — AI reads the
          column headers and maps them to Xean's fields automatically. You'll review and confirm the mapping before
          anything is imported.
        </p>
        <div className="import-setup-row">
          <input
            type="file"
            accept=".csv,.xlsx"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null)
              setAnalyzeError('')
            }}
          />
          <button className="btn btn-primary btn-sm" onClick={handleAnalyze} disabled={!file || analyzing}>
            {analyzing ? 'Reading file…' : 'Analyze file'}
          </button>
        </div>
        {analyzeError && <p className="form-error">{analyzeError}</p>}
      </div>
    )
  }

  if (step === 'mapping') {
    // mapping is keyed by sourceHeader -> targetField, so this checks
    // whether any column has been pointed at "name", not whether the
    // mapping object happens to have a key literally called "name".
    const hasNameMapped = Object.values(mapping).includes('name')
    return (
      <div className="import-review">
        <div className="import-review-head">
          <div>
            Found <strong>{analyzeResult.headers.length}</strong> column{analyzeResult.headers.length === 1 ? '' : 's'} and{' '}
            <strong>{analyzeResult.rowCount}</strong> row{analyzeResult.rowCount === 1 ? '' : 's'}. Confirm what each
            column means before continuing.
          </div>
        </div>

        <div className="card import-table-wrap">
          <table className="import-table migrate-mapping-table">
            <thead>
              <tr>
                <th>Your column</th>
                <th>Sample values</th>
                <th>Maps to</th>
              </tr>
            </thead>
            <tbody>
              {analyzeResult.headers.map((header) => {
                const suggestion = analyzeResult.suggestedMapping.find((m) => m.sourceHeader === header)
                const samples = analyzeResult.rows
                  .slice(0, 3)
                  .map((r) => r[header])
                  .filter((v) => v)
                return (
                  <tr key={header}>
                    <td>
                      <strong>{header}</strong>
                      {suggestion?.confidence === 'low' && (
                        <div className="migrate-low-confidence">⚠ {suggestion.notes || 'Uncertain mapping — please check'}</div>
                      )}
                    </td>
                    <td className="migrate-samples-cell">{samples.join(', ') || '—'}</td>
                    <td>
                      <select
                        className="import-cell-input"
                        value={mapping[header] ?? ''}
                        onChange={(e) => assignTarget(header, e.target.value)}
                      >
                        <option value="">Ignore this column</option>
                        {MIGRATE_TARGET_FIELDS.map((f) => (
                          <option key={f} value={f}>
                            {MIGRATE_FIELD_LABELS[f]}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {previewError && <p className="form-error">{previewError}</p>}

        <div className="import-commit-row">
          <button className="btn btn-ghost" onClick={resetAll} disabled={previewing}>
            Start over
          </button>
          <button className="btn btn-primary" onClick={handleConfirmMapping} disabled={previewing || !hasNameMapped}>
            {previewing ? 'Checking rows…' : 'Continue'}
          </button>
        </div>
        {!hasNameMapped && <p className="migrate-mapping-hint">Map at least the property name column to continue.</p>}
      </div>
    )
  }

  if (step === 'review') {
    return (
      <div className="import-review">
        <div className="import-review-head">
          <div>
            <strong>{previewResult.validUnitCount}</strong> unit{previewResult.validUnitCount === 1 ? '' : 's'} ready
            {previewResult.hasTenantData && (
              <>
                {' '}
                · <strong>{previewResult.validTenantCount}</strong> tenant{previewResult.validTenantCount === 1 ? '' : 's'} ready
              </>
            )}
            {' '}· <strong>{includedUnitCount}</strong> unit{includedUnitCount === 1 ? '' : 's'} and{' '}
            <strong>{includedTenantCount}</strong> tenant{includedTenantCount === 1 ? '' : 's'} selected
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
                <th>Unit</th>
                {MIGRATE_UNIT_FIELDS.map((f) => (
                  <th key={f}>{HEADER_LABELS[f] ?? f}</th>
                ))}
                <th>Issues</th>
                {previewResult.hasTenantData && (
                  <>
                    <th>Tenant</th>
                    {MIGRATE_TENANT_FIELDS.map((f) => (
                      <th key={f}>{MIGRATE_TENANT_FIELD_LABELS[f]}</th>
                    ))}
                    <th>Issues</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {previewResult.rows.map((row) => {
                const state = rowState[row.row]
                if (!state) return null
                return (
                  <tr key={row.row} className={row.unit.errors.length > 0 ? 'import-row-error' : undefined}>
                    <td>
                      <input type="checkbox" checked={state.unitIncluded} onChange={() => toggleUnitIncluded(row.row)} />
                    </td>
                    {MIGRATE_UNIT_FIELDS.map((f) => (
                      <td key={f}>
                        <input
                          className="import-cell-input"
                          value={state.unitValues[f] ?? ''}
                          onChange={(e) => updateUnitCell(row.row, f, e.target.value)}
                        />
                      </td>
                    ))}
                    <td className="import-issues-cell">
                      {row.unit.errors.length > 0 && (
                        <ul className="import-error-list">
                          {row.unit.errors.map((e, i) => (
                            <li key={i}>{e}</li>
                          ))}
                        </ul>
                      )}
                    </td>
                    {previewResult.hasTenantData && (
                      <>
                        <td>
                          {row.tenant && (
                            <input type="checkbox" checked={state.tenantIncluded} onChange={() => toggleTenantIncluded(row.row)} />
                          )}
                        </td>
                        {MIGRATE_TENANT_FIELDS.map((f) => (
                          <td key={f}>
                            {row.tenant && (
                              <input
                                className="import-cell-input"
                                value={state.tenantValues[f] ?? ''}
                                onChange={(e) => updateTenantCell(row.row, f, e.target.value)}
                              />
                            )}
                          </td>
                        ))}
                        <td className="import-issues-cell">
                          {row.tenant && row.tenant.errors.length > 0 && (
                            <ul className="import-error-list">
                              {row.tenant.errors.map((e, i) => (
                                <li key={i}>{e}</li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {commitError && <p className="form-error">{commitError}</p>}

        <div className="import-commit-row">
          <button className="btn btn-ghost" onClick={() => setStep('mapping')} disabled={committing}>
            ← Back to mapping
          </button>
          <button
            className="btn btn-primary"
            onClick={handleCommit}
            disabled={committing || (includedUnitCount === 0 && includedTenantCount === 0)}
          >
            {committing ? 'Importing…' : `Import ${includedUnitCount} unit${includedUnitCount === 1 ? '' : 's'}${includedTenantCount ? ` and ${includedTenantCount} tenant${includedTenantCount === 1 ? '' : 's'}` : ''}`}
          </button>
        </div>
      </div>
    )
  }

  // step === 'summary'
  return (
    <div className="card import-summary">
      <h3>Import complete</h3>
      <p>
        Created <strong>{summary.createdProperties}</strong> propert{summary.createdProperties === 1 ? 'y' : 'ies'},{' '}
        <strong>{summary.createdUnits}</strong> unit{summary.createdUnits === 1 ? '' : 's'}, and{' '}
        <strong>{summary.createdTenants}</strong> tenant{summary.createdTenants === 1 ? '' : 's'}.
      </p>

      {summary.skippedUnits.length > 0 && (
        <>
          <p className="import-summary-skipped-label">
            {summary.skippedUnits.length} unit{summary.skippedUnits.length === 1 ? '' : 's'} skipped:
          </p>
          <ul className="import-error-list">
            {summary.skippedUnits.map((s, i) => (
              <li key={i}>
                Row {s.row}: {s.reason}
              </li>
            ))}
          </ul>
        </>
      )}

      {summary.skippedTenants.length > 0 && (
        <>
          <p className="import-summary-skipped-label">
            {summary.skippedTenants.length} tenant{summary.skippedTenants.length === 1 ? '' : 's'} skipped:
          </p>
          <ul className="import-error-list">
            {summary.skippedTenants.map((s, i) => (
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
        <Link to="/properties" className="btn btn-primary">
          Go to Properties
        </Link>
      </div>
    </div>
  )
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

const MIGRATE_TAB = { key: 'migrate', label: 'Migrate from any spreadsheet' }

function BulkImport() {
  const [importType, setImportType] = useState('migrate')
  const [file, setFile] = useState(null)
  const [previewing, setPreviewing] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [preview, setPreview] = useState(null) // { rows: [{row, values, errors}], validCount, errorCount }
  const [rowState, setRowState] = useState({}) // { [row]: { included, values } }
  const [committing, setCommitting] = useState(false)
  const [commitError, setCommitError] = useState('')
  const [summary, setSummary] = useState(null)

  const config = IMPORT_TYPES[importType] ?? null

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
      <PageHeader title="Migrate Your Data" subtitle="Bring in your existing portfolio from Yardi, AppFolio, Buildium, or any spreadsheet — instead of adding everything one by one.">
        <Link to="/properties" className="btn btn-ghost">
          ← Back to Properties
        </Link>
      </PageHeader>

      <div className="content">
        <div className="import-type-tabs">
          <button
            className={'import-type-tab' + (importType === MIGRATE_TAB.key ? ' active' : '')}
            onClick={() => selectType(MIGRATE_TAB.key)}
          >
            {MIGRATE_TAB.label}
          </button>
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

        {importType === MIGRATE_TAB.key && <MigrateImport />}

        {config && !summary && (
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

        {config && preview && (
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

        {config && summary && (
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
