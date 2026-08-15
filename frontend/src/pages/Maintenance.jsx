import { useEffect, useState } from 'react'
import {
  getMaintenanceRequests,
  getTenants,
  createMaintenanceRequest,
  updateMaintenanceRequest,
  deleteMaintenanceRequest,
} from '../api/client.js'
import PageHeader from '../components/PageHeader.jsx'
import Modal from '../components/Modal.jsx'
import MaintenanceForm from '../components/MaintenanceForm.jsx'
import './Maintenance.css'

const COLUMNS = [
  { status: 'new', title: 'New' },
  { status: 'in_progress', title: 'In Progress' },
  { status: 'resolved', title: 'Resolved' },
]

// Priority is stored as low/medium/high; the urgency-dot CSS classes are
// named low/mid/high (from the original mockup), so this bridges the two.
const PRIORITY_DOT_CLASS = { low: 'low', medium: 'mid', high: 'high' }

function Maintenance() {
  const [tickets, setTickets] = useState([])
  const [unitRows, setUnitRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  // null = closed, {} = new ticket, { ticket } = editing
  const [formState, setFormState] = useState(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    setLoadError('')
    try {
      const [maintenanceRows, tenantRows] = await Promise.all([getMaintenanceRequests(), getTenants()])
      setTickets(maintenanceRows)
      setUnitRows(tenantRows)
    } catch (err) {
      setLoadError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const unitOptions = unitRows.map((r) => ({
    unit_id: r.unit_id,
    tenant_id: r.tenant_id,
    label: `${r.property_name} — ${r.unit_number}${r.tenant_id ? ` · ${r.full_name}` : ''}`,
  }))

  async function handleFormSubmit(values) {
    if (formState?.ticket) {
      await updateMaintenanceRequest(formState.ticket.id, { ...values, status: formState.ticket.status })
    } else {
      await createMaintenanceRequest(values)
    }
    setFormState(null)
    await load()
  }

  async function handleMove(ticket, status) {
    await updateMaintenanceRequest(ticket.id, {
      unit_id: ticket.unit_id,
      tenant_id: ticket.tenant_id,
      title: ticket.title,
      description: ticket.description,
      priority: ticket.priority,
      status,
    })
    await load()
  }

  async function handleDelete(ticket) {
    if (!window.confirm(`Delete "${ticket.title}"?`)) return
    await deleteMaintenanceRequest(ticket.id)
    await load()
  }

  const initialValues = formState?.ticket
    ? {
        unit_id: formState.ticket.unit_id,
        title: formState.ticket.title,
        description: formState.ticket.description || '',
        priority: formState.ticket.priority,
      }
    : undefined

  return (
    <div>
      <PageHeader title="Maintenance" subtitle="Track and triage requests across your portfolio">
        <button className="btn btn-primary" onClick={() => setFormState({})} disabled={!loading && unitOptions.length === 0}>
          + New ticket
        </button>
      </PageHeader>

      <div className="content">
        {loadError && <p className="form-error">{loadError}</p>}

        {!loading && !loadError && unitOptions.length === 0 && (
          <div className="empty-state card">
            <h3>No units yet</h3>
            <p>Add a property and some units first, then come back to log maintenance requests.</p>
          </div>
        )}

        {unitOptions.length > 0 && (
          <div className="board">
            {COLUMNS.map((col) => {
              const columnTickets = tickets.filter((t) => t.status === col.status)
              return (
                <div key={col.status}>
                  <div className="board-col-head">
                    <h3>{col.title}</h3>
                    <span className="board-count mono">{columnTickets.length}</span>
                  </div>

                  {columnTickets.length === 0 && <p className="board-empty">No tickets</p>}

                  {columnTickets.map((t) => (
                    <div className="ticket" key={t.id}>
                      <div className="ticket-top">
                        <div className={`urgency-dot ${PRIORITY_DOT_CLASS[t.priority]}`} />
                        <div className="ticket-title">{t.title}</div>
                      </div>
                      <div className="ticket-meta">
                        {t.property_name} · {t.unit_number}
                        {t.tenant_name ? ` · ${t.tenant_name}` : ''}
                      </div>

                      <div className="ticket-actions">
                        {col.status === 'new' && (
                          <button className="btn btn-ghost btn-sm" onClick={() => handleMove(t, 'in_progress')}>
                            Start →
                          </button>
                        )}
                        {col.status === 'in_progress' && (
                          <>
                            <button className="btn btn-ghost btn-sm" onClick={() => handleMove(t, 'new')}>
                              ← New
                            </button>
                            <button className="btn btn-ghost btn-sm" onClick={() => handleMove(t, 'resolved')}>
                              Resolve ✓
                            </button>
                          </>
                        )}
                        {col.status === 'resolved' && (
                          <button className="btn btn-ghost btn-sm" onClick={() => handleMove(t, 'in_progress')}>
                            ↺ Reopen
                          </button>
                        )}
                      </div>
                      <div className="ticket-actions">
                        <button className="btn btn-ghost btn-sm" onClick={() => setFormState({ ticket: t })}>
                          Edit
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(t)}>
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {formState && (
        <Modal title={formState?.ticket ? 'Edit ticket' : 'New ticket'} onClose={() => setFormState(null)}>
          <MaintenanceForm
            initialValues={initialValues}
            units={unitOptions}
            onSubmit={handleFormSubmit}
            onCancel={() => setFormState(null)}
          />
        </Modal>
      )}
    </div>
  )
}

export default Maintenance
