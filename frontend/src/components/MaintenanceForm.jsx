import { useState } from 'react'

const emptyValues = {
  unit_id: '',
  title: '',
  description: '',
  priority: 'medium',
}

// units: [{ unit_id, tenant_id, label }] — every unit in the portfolio.
// Picking one also determines the tenant (if any) automatically, since a
// unit has at most one current tenant.
function MaintenanceForm({ initialValues, units, onSubmit, onCancel }) {
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
      const unit = units.find((u) => String(u.unit_id) === String(values.unit_id))
      await onSubmit({
        unit_id: Number(values.unit_id),
        tenant_id: unit?.tenant_id ?? null,
        title: values.title,
        description: values.description,
        priority: values.priority,
      })
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <p className="form-error">{error}</p>}

      <div className="form-field">
        <label htmlFor="unit_id">Property / Unit</label>
        <select id="unit_id" name="unit_id" value={values.unit_id} onChange={handleChange} required>
          <option value="" disabled>
            Select a unit…
          </option>
          {units.map((u) => (
            <option key={u.unit_id} value={u.unit_id}>
              {u.label}
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
          placeholder="e.g. No hot water in unit"
          required
        />
      </div>

      <div className="form-field">
        <label htmlFor="description">Description</label>
        <textarea id="description" name="description" value={values.description} onChange={handleChange} rows={3} />
      </div>

      <div className="form-field">
        <label htmlFor="priority">Priority</label>
        <select id="priority" name="priority" value={values.priority} onChange={handleChange}>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </div>

      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save request'}
        </button>
      </div>
    </form>
  )
}

export default MaintenanceForm
