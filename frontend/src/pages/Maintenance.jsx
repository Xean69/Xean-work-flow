import { useEffect, useRef, useState } from 'react'
import {
  getMaintenanceRequests,
  getTenants,
  createMaintenanceRequest,
  updateMaintenanceRequest,
  deleteMaintenanceRequest,
  getMaintenanceRequest,
  addMaintenanceComment,
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

// AI urgency/trade values are stored as their raw classifier tokens
// (high/medium/low, plumbing/electrical/…); these map them to the
// "⚡ Urgent · Plumbing" labels from the original mockup.
const AI_URGENCY_LABELS = { high: 'Urgent', medium: 'Moderate', low: 'Routine' }
const AI_TRADE_LABELS = {
  plumbing: 'Plumbing',
  electrical: 'Electrical',
  hvac: 'HVAC',
  appliance: 'Appliance',
  structural: 'Structural',
  pest_control: 'Pest control',
  locksmith: 'Locksmith',
  general: 'General',
}

function AiTag({ ticket }) {
  if (ticket.ai_classification_status !== 'success') return null
  return (
    <div className="ai-tag" title={ticket.ai_reasoning || undefined}>
      ⚡ {AI_URGENCY_LABELS[ticket.ai_urgency] || ticket.ai_urgency} · {AI_TRADE_LABELS[ticket.ai_trade] || ticket.ai_trade}
    </div>
  )
}

function formatTime(value) {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

const ATTACHMENT_ACCEPT = '.jpg,.jpeg,.png,.webp,.heic,.pdf,.mp4,.mov,.webm'

// resource_type comes straight from Cloudinary ('image', 'video', or 'raw'
// for anything else — PDFs, docs) — that's already exactly the distinction
// needed to pick a preview.
function AttachmentPreview({ url, resourceType, fileName }) {
  if (resourceType === 'image') {
    return (
      <a href={url} target="_blank" rel="noreferrer">
        <img src={url} alt={fileName || 'Attachment'} className="bubble-attachment-img" />
      </a>
    )
  }
  if (resourceType === 'video') {
    return <video src={url} controls className="bubble-attachment-video" />
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="bubble-attachment-file">
      📄 {fileName || 'Download attachment'}
    </a>
  )
}

function Maintenance() {
  const [tickets, setTickets] = useState([])
  const [unitRows, setUnitRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  // null = closed, {} = new ticket, { ticket } = editing
  const [formState, setFormState] = useState(null)
  // null = closed, otherwise the ticket whose thread is open
  const [threadTicketId, setThreadTicketId] = useState(null)
  const [threadData, setThreadData] = useState(null)
  const [commentDraft, setCommentDraft] = useState('')
  const [commentFile, setCommentFile] = useState(null)
  const [sendingComment, setSendingComment] = useState(false)
  const threadBodyRef = useRef(null)

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (threadBodyRef.current) threadBodyRef.current.scrollTop = threadBodyRef.current.scrollHeight
  }, [threadData])

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

  // Opening the thread marks it read server-side; clear the badge locally
  // right away instead of waiting on a full board reload.
  async function openThread(ticket) {
    setThreadTicketId(ticket.id)
    setThreadData(await getMaintenanceRequest(ticket.id))
    setTickets((rows) => rows.map((r) => (r.id === ticket.id ? { ...r, unread_by_manager: false } : r)))
  }

  function closeThread() {
    setThreadTicketId(null)
    setThreadData(null)
    setCommentDraft('')
    setCommentFile(null)
  }

  async function handleSendComment(e) {
    e.preventDefault()
    if (!commentDraft.trim() && !commentFile) return
    setSendingComment(true)
    try {
      const formData = new FormData()
      if (commentDraft.trim()) formData.append('body', commentDraft.trim())
      if (commentFile) formData.append('attachment', commentFile)
      await addMaintenanceComment(threadTicketId, formData)
      setCommentDraft('')
      setCommentFile(null)
      setThreadData(await getMaintenanceRequest(threadTicketId))
    } finally {
      setSendingComment(false)
    }
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
                        <button className="ticket-title-link" onClick={() => openThread(t)}>
                          {t.title}
                          {t.unread_by_manager && <span className="ticket-unread-dot" title="New comment" />}
                        </button>
                      </div>
                      <div className="ticket-meta">
                        {t.property_name} · {t.unit_number}
                        {t.tenant_name ? ` · ${t.tenant_name}` : ''}
                      </div>
                      {t.is_emergency && <div className="ticket-emergency-tag">🚨 Emergency</div>}
                      <AiTag ticket={t} />

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

      {threadTicketId && (
        <Modal title={threadData?.title || 'Ticket'} onClose={closeThread}>
          {!threadData ? (
            <p>Loading…</p>
          ) : (
            <div>
              <p className="ticket-thread-meta">
                {threadData.property_name} · {threadData.unit_number}
                {threadData.tenant_name ? ` · ${threadData.tenant_name}` : ''}
              </p>
              {threadData.description && <p className="ticket-thread-description">{threadData.description}</p>}
              {threadData.is_emergency && <p className="ticket-thread-emergency-note">🚨 Flagged as an emergency by the tenant</p>}
              {threadData.ai_classification_status === 'success' && (
                <p className="ticket-thread-ai-note">
                  ⚡ AI read: {AI_URGENCY_LABELS[threadData.ai_urgency] || threadData.ai_urgency} ·{' '}
                  {AI_TRADE_LABELS[threadData.ai_trade] || threadData.ai_trade} — {threadData.ai_reasoning}
                </p>
              )}

              <div className="ticket-thread-body" ref={threadBodyRef}>
                {threadData.comments.length === 0 && (
                  <p style={{ fontSize: 12.5, color: 'var(--slate)', textAlign: 'center' }}>
                    No comments yet — say hello, or ask for a photo.
                  </p>
                )}
                {threadData.comments.map((c) => (
                  <div className={`bubble ${c.sender === 'manager' ? 'out' : c.sender === 'ai' ? 'ai' : 'in'}`} key={c.id}>
                    {c.sender === 'ai' && <div className="bubble-sender">Assistant</div>}
                    {c.body}
                    {c.attachment_url && (
                      <AttachmentPreview
                        url={c.attachment_url}
                        resourceType={c.attachment_cloudinary_resource_type}
                        fileName={c.attachment_file_name}
                      />
                    )}
                    <div style={{ fontSize: 10, opacity: 0.65, marginTop: 4 }}>{formatTime(c.created_at)}</div>
                  </div>
                ))}
              </div>

              <form className="ticket-thread-composer" onSubmit={handleSendComment}>
                <label className="attach-btn" title="Attach a photo, video, or document">
                  📎
                  <input
                    type="file"
                    accept={ATTACHMENT_ACCEPT}
                    onChange={(e) => setCommentFile(e.target.files?.[0] || null)}
                    disabled={sendingComment}
                    style={{ display: 'none' }}
                  />
                </label>
                <input
                  value={commentDraft}
                  onChange={(e) => setCommentDraft(e.target.value)}
                  placeholder={commentFile ? commentFile.name : 'Type a comment…'}
                  disabled={sendingComment}
                />
                <button type="submit" className="btn btn-primary" disabled={sendingComment || (!commentDraft.trim() && !commentFile)}>
                  Send
                </button>
              </form>
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}

export default Maintenance
