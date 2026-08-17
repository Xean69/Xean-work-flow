import { useEffect, useState } from 'react'
import {
  getComplianceChecks,
  createComplianceCheck,
  updateComplianceCheck,
  updateComplianceCheckStatus,
  deleteComplianceCheck,
  getProperties,
} from '../api/client.js'
import PageHeader from '../components/PageHeader.jsx'
import Modal from '../components/Modal.jsx'
import ComplianceCheckForm from '../components/ComplianceCheckForm.jsx'
import './Compliance.css'

// Resolved always reads as the green checkmark regardless of the
// severity it was originally flagged at — it's handled, that's the part
// that matters at a glance. Among still-open checks, severity decides
// red/amber/green.
function flagAppearance(check) {
  if (check.status === 'resolved') return { icon: 'green', symbol: '✓' }
  if (check.severity === 'high') return { icon: 'red', symbol: '!' }
  if (check.severity === 'medium') return { icon: 'amber', symbol: 'i' }
  return { icon: 'green', symbol: '✓' }
}

function clauseLine(check) {
  const parts = []
  if (check.clause_reference) parts.push(check.clause_reference)
  parts.push(check.status === 'resolved' ? 'resolved' : `${check.severity} priority`)
  return parts.join(' · ')
}

// Checks arrive already ordered by property name, then newest first
// within each — this just buckets them without disturbing that order.
function groupByProperty(checks) {
  const groups = []
  const byId = new Map()
  for (const check of checks) {
    let group = byId.get(check.property_id)
    if (!group) {
      group = { property_id: check.property_id, property_name: check.property_name, checks: [] }
      byId.set(check.property_id, group)
      groups.push(group)
    }
    group.checks.push(check)
  }
  return groups
}

function Compliance() {
  const [checks, setChecks] = useState([])
  const [properties, setProperties] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  // null = closed, {} = new check, { check } = editing
  const [formState, setFormState] = useState(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    setLoadError('')
    try {
      const [checkRows, propRows] = await Promise.all([getComplianceChecks(), getProperties()])
      setChecks(checkRows)
      setProperties(propRows)
    } catch (err) {
      setLoadError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(values) {
    if (formState.check) {
      await updateComplianceCheck(formState.check.id, values)
    } else {
      await createComplianceCheck(values)
    }
    setFormState(null)
    await load()
  }

  async function handleToggleResolved(check) {
    await updateComplianceCheckStatus(check.id, check.status === 'resolved' ? 'open' : 'resolved')
    await load()
  }

  async function handleDelete(check) {
    if (!window.confirm(`Delete "${check.title}"?`)) return
    await deleteComplianceCheck(check.id)
    await load()
  }

  const groups = groupByProperty(checks)

  return (
    <div>
      <PageHeader title="Compliance" subtitle="Checks new leases and bylaws against Alberta RTA + condo rules">
        <button className="btn btn-ghost" title="AI-assisted document checking isn't built yet">
          Check a document
        </button>
        <button className="btn btn-primary" onClick={() => setFormState({})} disabled={properties.length === 0}>
          + Add compliance check
        </button>
      </PageHeader>

      <div className="content">
        {loadError && <p className="form-error">{loadError}</p>}

        {!loading && !loadError && properties.length === 0 && (
          <div className="empty-state card">
            <h3>No properties yet</h3>
            <p>Add a property first, then track compliance checks against it here.</p>
          </div>
        )}

        {!loading && !loadError && properties.length > 0 && groups.length === 0 && (
          <div className="empty-state card">
            <h3>No compliance checks yet</h3>
            <p>Add your first check above — a bylaw restriction, an RTA concern, anything worth flagging.</p>
          </div>
        )}

        {groups.map((group) => (
          <div key={group.property_id}>
            <div className="section-head">
              <h2>{group.property_name}</h2>
            </div>
            <div className="card">
              {group.checks.map((check) => {
                const { icon, symbol } = flagAppearance(check)
                return (
                  <div className="flag-row" key={check.id}>
                    <div className={`flag-icon ${icon}`}>{symbol}</div>
                    <div className="flag-body">
                      <div className="flag-title">{check.title}</div>
                      {check.description && <div className="flag-desc">{check.description}</div>}
                      <div className="flag-clause mono">{clauseLine(check)}</div>
                    </div>
                    <div className="flag-actions">
                      <label className="flag-resolved-toggle">
                        <input
                          type="checkbox"
                          checked={check.status === 'resolved'}
                          onChange={() => handleToggleResolved(check)}
                        />
                        Resolved
                      </label>
                      <button className="btn btn-ghost btn-sm" onClick={() => setFormState({ check })}>
                        Edit
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(check)}>
                        Delete
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {formState && (
        <Modal title={formState.check ? 'Edit compliance check' : 'Add compliance check'} onClose={() => setFormState(null)}>
          <ComplianceCheckForm
            initialValues={
              formState.check
                ? {
                    property_id: formState.check.property_id,
                    title: formState.check.title,
                    description: formState.check.description ?? '',
                    clause_reference: formState.check.clause_reference ?? '',
                    severity: formState.check.severity,
                  }
                : undefined
            }
            properties={properties}
            onSubmit={handleSubmit}
            onCancel={() => setFormState(null)}
          />
        </Modal>
      )}
    </div>
  )
}

export default Compliance
