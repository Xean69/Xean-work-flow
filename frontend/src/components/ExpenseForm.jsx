import { useState } from 'react'

const CATEGORY_OPTIONS = [
  { value: '', label: 'Uncategorized' },
  { value: 'repairs', label: 'Repairs' },
  { value: 'cleaning', label: 'Cleaning' },
  { value: 'landscaping', label: 'Landscaping' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'property_tax', label: 'Property tax' },
  { value: 'supplies', label: 'Supplies' },
  { value: 'other', label: 'Other' },
]

const emptyValues = {
  amount: '',
  category: '',
  vendor_name: '',
  expense_date: '',
  property_id: '',
  unit_id: '',
  notes: '',
}

// properties: [{id, name}]. units: [{unit_id, label}]. existingReceiptUrl is
// set only when editing an expense that already has a receipt attached.
function ExpenseForm({ initialValues, existingReceiptUrl, properties, units, onSubmit, onCancel }) {
  const [values, setValues] = useState({ ...emptyValues, ...initialValues })
  const [file, setFile] = useState(null)
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
      const formData = new FormData()
      if (file) formData.append('receipt', file)
      formData.append('amount', values.amount)
      if (values.category) formData.append('category', values.category)
      formData.append('vendor_name', values.vendor_name)
      formData.append('expense_date', values.expense_date)
      if (values.property_id) formData.append('property_id', values.property_id)
      if (values.unit_id) formData.append('unit_id', values.unit_id)
      if (values.notes) formData.append('notes', values.notes)
      await onSubmit(formData)
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <p className="form-error">{error}</p>}

      <div className="form-field">
        <label htmlFor="receipt">Receipt photo (optional)</label>
        <input id="receipt" type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        {!file && existingReceiptUrl && (
          <a href={existingReceiptUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
            View current receipt
          </a>
        )}
        {file && <span style={{ fontSize: 12, color: 'var(--slate)' }}>{file.name}</span>}
      </div>

      <div className="form-row">
        <div className="form-field">
          <label htmlFor="amount">Amount ($)</label>
          <input
            id="amount"
            name="amount"
            type="number"
            min="0"
            step="0.01"
            value={values.amount}
            onChange={handleChange}
            required
          />
        </div>
        <div className="form-field">
          <label htmlFor="category">Category</label>
          <select id="category" name="category" value={values.category} onChange={handleChange}>
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="form-row">
        <div className="form-field">
          <label htmlFor="vendor_name">Vendor</label>
          <input
            id="vendor_name"
            name="vendor_name"
            value={values.vendor_name}
            onChange={handleChange}
            placeholder="e.g. ABC Plumbing"
            required
          />
        </div>
        <div className="form-field">
          <label htmlFor="expense_date">Date</label>
          <input
            id="expense_date"
            name="expense_date"
            type="date"
            value={values.expense_date}
            onChange={handleChange}
            required
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-field">
          <label htmlFor="property_id">Property (optional)</label>
          <select id="property_id" name="property_id" value={values.property_id} onChange={handleChange}>
            <option value="">None</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label htmlFor="unit_id">Unit (optional)</label>
          <select id="unit_id" name="unit_id" value={values.unit_id} onChange={handleChange}>
            <option value="">None</option>
            {units.map((u) => (
              <option key={u.unit_id} value={u.unit_id}>
                {u.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="form-field">
        <label htmlFor="notes">Notes (optional)</label>
        <textarea id="notes" name="notes" value={values.notes} onChange={handleChange} rows={2} />
      </div>

      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save expense'}
        </button>
      </div>
    </form>
  )
}

export default ExpenseForm
