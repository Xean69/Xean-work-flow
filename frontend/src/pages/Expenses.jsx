import { useEffect, useState } from 'react'
import {
  getExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  getExpenseReceiptUrl,
  getProperties,
  getTenants,
} from '../api/client.js'
import PageHeader from '../components/PageHeader.jsx'
import StatCard from '../components/StatCard.jsx'
import Modal from '../components/Modal.jsx'
import ExpenseForm from '../components/ExpenseForm.jsx'
import './Expenses.css'

const CATEGORY_LABELS = {
  repairs: 'Repairs',
  cleaning: 'Cleaning',
  landscaping: 'Landscaping',
  utilities: 'Utilities',
  property_tax: 'Property tax',
  supplies: 'Supplies',
  other: 'Other',
}

function formatCategory(cat) {
  return cat ? CATEGORY_LABELS[cat] || cat : 'Uncategorized'
}

function formatMoney(amount) {
  return `$${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
}

function formatDate(value) {
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function isImageReceipt(filePath) {
  return /\.(jpe?g|png)$/i.test(filePath || '')
}

function Expenses() {
  const [expenses, setExpenses] = useState([])
  const [properties, setProperties] = useState([])
  const [unitRows, setUnitRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  // null = closed, {} = new expense, { expense } = editing
  const [formState, setFormState] = useState(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    setLoadError('')
    try {
      const [expenseRows, propRows, units] = await Promise.all([getExpenses(), getProperties(), getTenants()])
      setExpenses(expenseRows)
      setProperties(propRows)
      setUnitRows(units)
    } catch (err) {
      setLoadError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const unitOptions = unitRows.map((r) => ({
    unit_id: r.unit_id,
    label: `${r.property_name} — ${r.unit_number}`,
  }))

  const now = new Date()
  const thisMonthExpenses = expenses.filter((e) => {
    const d = new Date(e.expense_date)
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  })
  const totalThisMonth = thisMonthExpenses.reduce((sum, e) => sum + Number(e.amount), 0)

  const categoryTotals = {}
  thisMonthExpenses.forEach((e) => {
    if (!e.category) return
    categoryTotals[e.category] = (categoryTotals[e.category] || 0) + Number(e.amount)
  })
  const topCategory = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1])[0]

  const unreviewedCount = expenses.filter((e) => !e.category).length

  const yearToDateTotal = expenses
    .filter((e) => new Date(e.expense_date).getFullYear() === now.getFullYear())
    .reduce((sum, e) => sum + Number(e.amount), 0)

  async function handleFormSubmit(formData) {
    if (formState?.expense) {
      await updateExpense(formState.expense.id, formData)
    } else {
      await createExpense(formData)
    }
    setFormState(null)
    await load()
  }

  async function handleDelete(expense) {
    if (!window.confirm(`Delete this ${formatMoney(expense.amount)} expense from ${expense.vendor_name}?`)) return
    await deleteExpense(expense.id)
    await load()
  }

  const initialValues = formState?.expense
    ? {
        amount: formState.expense.amount,
        category: formState.expense.category || '',
        vendor_name: formState.expense.vendor_name,
        expense_date: formState.expense.expense_date?.slice(0, 10) || '',
        property_id: formState.expense.property_id || '',
        unit_id: formState.expense.unit_id || '',
        notes: formState.expense.notes || '',
      }
    : undefined

  return (
    <div>
      <PageHeader title="Expenses" subtitle="Log a receipt — amount, category, and property, all in one place">
        <button className="btn btn-primary" onClick={() => setFormState({})}>
          Upload receipt
        </button>
      </PageHeader>

      <div className="content">
        {loadError && <p className="form-error">{loadError}</p>}

        <div className="stat-row">
          <StatCard
            label="This month"
            value={loading ? '—' : formatMoney(totalThisMonth)}
            sub={`across ${thisMonthExpenses.length} ${thisMonthExpenses.length === 1 ? 'expense' : 'expenses'}`}
          />
          <StatCard
            label={topCategory ? formatCategory(topCategory[0]) : 'No expenses yet'}
            value={loading ? '—' : formatMoney(topCategory ? topCategory[1] : 0)}
            sub="largest category this month"
          />
          <StatCard
            label="Unreviewed"
            value={loading ? '—' : unreviewedCount}
            sub="needs a category check"
            subVariant={unreviewedCount > 0 ? 'warn' : undefined}
          />
          <StatCard label="Year to date" value={loading ? '—' : formatMoney(yearToDateTotal)} sub={String(now.getFullYear())} />
        </div>

        <div className="section-head">
          <h2>Recent receipts</h2>
        </div>

        {!loading && !loadError && expenses.length === 0 && (
          <div className="empty-state card">
            <h3>No expenses yet</h3>
            <p>Upload your first receipt above to start tracking spending.</p>
          </div>
        )}

        {expenses.length > 0 && (
          <div className="exp-grid">
            {expenses.map((e) => (
              <div className="exp-card" key={e.id}>
                {e.receipt_file_path ? (
                  <a href={getExpenseReceiptUrl(e.id)} target="_blank" rel="noreferrer" className="exp-thumb">
                    {isImageReceipt(e.receipt_file_path) ? (
                      <img src={getExpenseReceiptUrl(e.id)} alt="Receipt" className="exp-thumb-img" />
                    ) : (
                      '📄'
                    )}
                  </a>
                ) : (
                  <div className="exp-thumb">🧾</div>
                )}
                <div className="exp-body">
                  <div className="exp-amount">{formatMoney(e.amount)}</div>
                  <div className="exp-cat">{formatCategory(e.category)}</div>
                  <div className="exp-sub">
                    {[e.property_name, e.unit_number, e.vendor_name, formatDate(e.expense_date)]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                  <div className="exp-actions">
                    <button className="btn btn-ghost btn-sm" onClick={() => setFormState({ expense: e })}>
                      Edit
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(e)}>
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {formState && (
        <Modal title={formState?.expense ? 'Edit expense' : 'Upload receipt'} onClose={() => setFormState(null)}>
          <ExpenseForm
            initialValues={initialValues}
            existingReceiptUrl={formState?.expense?.receipt_file_path ? getExpenseReceiptUrl(formState.expense.id) : null}
            properties={properties}
            units={unitOptions}
            onSubmit={handleFormSubmit}
            onCancel={() => setFormState(null)}
          />
        </Modal>
      )}
    </div>
  )
}

export default Expenses
