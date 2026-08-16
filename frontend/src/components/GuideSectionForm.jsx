import { useState } from 'react'

const emptyValues = {
  section_title: '',
  content: '',
}

function GuideSectionForm({ initialValues, onSubmit, onCancel }) {
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
      await onSubmit(values)
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <p className="form-error">{error}</p>}

      <div className="form-field">
        <label htmlFor="section_title">Section title</label>
        <input
          id="section_title"
          name="section_title"
          value={values.section_title}
          onChange={handleChange}
          placeholder="e.g. Parking"
          required
        />
      </div>

      <div className="form-field">
        <label htmlFor="content">Content</label>
        <textarea id="content" name="content" value={values.content} onChange={handleChange} rows={5} required />
      </div>

      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save section'}
        </button>
      </div>
    </form>
  )
}

export default GuideSectionForm
