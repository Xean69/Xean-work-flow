import { useState } from 'react'

const emptyValues = {
  property_id: '',
  title: '',
  description: '',
  clause_reference: '',
  severity: 'medium',
}

// properties: [{ id, name }]
function ComplianceCheckForm({ initialValues, properties, onSubmit, onCancel }) {
  const [values, setValues] = useState({ ...emptyValues, ...initialValues })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function handleChange(e) {
    const { name, value } = e.target
    setValues((v) => ({ ...v, [name]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await onSubmit({ ...values, property_id: Number(values.property_id) })
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <p className="form-error">{error}</p>}

      <div className="form-field">
        <label htmlFor="property_id">Property</label>
        <select id="property_id" name="property_id" value={values.property_id} onChange={handleChange} required>
          <option value="" disabled>
            Select a property…
          </option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="form-field">
        <label htmlFor="title">Title</label>
        <input
          id="title"
          name="title"
          value={values.title}
          onChange={handleChange}
          placeholder="e.g. Short-term rental restriction"
          required
          autoFocus
        />
      </div>

      <div className="form-field">
        <label htmlFor="description">Description</label>
        <textarea id="description" name="description" value={values.description} onChange={handleChange} />
      </div>

      <div className="form-row">
        <div className="form-field">
          <label htmlFor="clause_reference">Clause reference (optional)</label>
          <input
            id="clause_reference"
            name="clause_reference"
            value={values.clause_reference}
            onChange={handleChange}
            placeholder="e.g. BYLAW §7.3"
          />
        </div>
        <div className="form-field">
          <label htmlFor="severity">Severity</label>
          <select id="severity" name="severity" value={values.severity} onChange={handleChange}>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>

      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save check'}
        </button>
      </div>
    </form>
  )
}

export default ComplianceCheckForm
