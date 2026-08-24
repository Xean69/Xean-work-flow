import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
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

const COLUMN_STATUSES = ['new', 'in_progress', 'resolved']

// Priority is stored as low/medium/high; the urgency-dot CSS classes are
// named low/mid/high (from the original mockup), so this bridges the two.
const PRIORITY_DOT_CLASS = { low: 'low', medium: 'mid', high: 'high' }

function AiTag({ ticket }) {
  const { t } = useTranslation('maintenance')
  if (ticket.ai_classification_status !== 'success') return null
  return (
    <div className="ai-tag" title={ticket.ai_reasoning || undefined}>
      ⚡ {t(`aiUrgency.${ticket.ai_urgency}`, { defaultValue: ticket.ai_urgency })} ·{' '}
      {t(`aiTrade.${ticket.ai_trade}`, { defaultValue: ticket.ai_trade })}
    </div>
  )
}

function formatTime(value, locale) {
  return new Date(value).toLocaleString(locale, {
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
  const { t } = useTranslation('maintenance')
  if (resourceType === 'image') {
    return (
      <a href={url} target="_blank" rel="noreferrer">
        <img src={url} alt={fileName || t('attachmentAlt')} className="bubble-attachment-img" />
      </a>
    )
  }
  if (resourceType === 'video') {
    return <video src={url} controls className="bubble-attachment-video" />
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="bubble-attachment-file">
      📄 {fileName || t('downloadAttachment')}
    </a>
  )
}

function Maintenance() {
  const { t: tr, i18n } = useTranslation('maintenance')
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
    if (!window.confirm(tr('confirmDelete', { title: ticket.title }))) return
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
      <PageHeader title={tr('title')} subtitle={tr('subtitle')}>
        <button className="btn btn-primary" onClick={() => setFormState({})} disabled={!loading && unitOptions.length === 0}>
          {tr('newTicket')}
        </button>
      </PageHeader>

      <div className="content">
        {loadError && <p className="form-error">{loadError}</p>}

        {!loading && !loadError && unitOptions.length === 0 && (
          <div className="empty-state card">
            <h3>{tr('emptyNoUnitsTitle')}</h3>
            <p>{tr('emptyNoUnitsBody')}</p>
          </div>
        )}

        {unitOptions.length > 0 && (
          <div className="board">
            {COLUMN_STATUSES.map((status) => {
              const columnTickets = tickets.filter((t) => t.status === status)
              return (
                <div key={status}>
                  <div className="board-col-head">
                    <h3>{tr(`columns.${status}`)}</h3>
                    <span className="board-count mono">{columnTickets.length}</span>
                  </div>

                  {columnTickets.length === 0 && <p className="board-empty">{tr('noTickets')}</p>}

                  {columnTickets.map((t) => (
                    <div className="ticket" key={t.id}>
                      <div className="ticket-top">
                        <div className={`urgency-dot ${PRIORITY_DOT_CLASS[t.priority]}`} />
                        <button className="ticket-title-link" onClick={() => openThread(t)}>
                          {t.title}
                          {t.unread_by_manager && <span className="ticket-unread-dot" title={tr('newCommentTitle')} />}
                        </button>
                      </div>
                      <div className="ticket-meta">
                        {t.property_name} · {t.unit_number}
                        {t.tenant_name ? ` · ${t.tenant_name}` : ''}
                      </div>
                      {t.is_emergency && <div className="ticket-emergency-tag">{tr('emergency')}</div>}
                      <AiTag ticket={t} />

                      <div className="ticket-actions">
                        {status === 'new' && (
                          <button className="btn btn-ghost btn-sm" onClick={() => handleMove(t, 'in_progress')}>
                            {tr('actions.start')}
                          </button>
                        )}
                        {status === 'in_progress' && (
                          <>
                            <button className="btn btn-ghost btn-sm" onClick={() => handleMove(t, 'new')}>
                              {tr('actions.backToNew')}
                            </button>
                            <button className="btn btn-ghost btn-sm" onClick={() => handleMove(t, 'resolved')}>
                              {tr('actions.resolve')}
                            </button>
                          </>
                        )}
                        {status === 'resolved' && (
                          <button className="btn btn-ghost btn-sm" onClick={() => handleMove(t, 'in_progress')}>
                            {tr('actions.reopen')}
                          </button>
                        )}
                      </div>
                      <div className="ticket-actions">
                        <button className="btn btn-ghost btn-sm" onClick={() => setFormState({ ticket: t })}>
                          {tr('actions.edit')}
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(t)}>
                          {tr('actions.delete')}
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
        <Modal title={formState?.ticket ? tr('editTicketModalTitle') : tr('newTicketModalTitle')} onClose={() => setFormState(null)}>
          <MaintenanceForm
            initialValues={initialValues}
            units={unitOptions}
            onSubmit={handleFormSubmit}
            onCancel={() => setFormState(null)}
          />
        </Modal>
      )}

      {threadTicketId && (
        <Modal title={threadData?.title || tr('ticketFallbackTitle')} onClose={closeThread}>
          {!threadData ? (
            <p>{tr('loading')}</p>
          ) : (
            <div>
              <p className="ticket-thread-meta">
                {threadData.property_name} · {threadData.unit_number}
                {threadData.tenant_name ? ` · ${threadData.tenant_name}` : ''}
              </p>
              {threadData.description && <p className="ticket-thread-description">{threadData.description}</p>}
              {threadData.is_emergency && <p className="ticket-thread-emergency-note">{tr('emergencyNote')}</p>}
              {threadData.ai_classification_status === 'success' && (
                <p className="ticket-thread-ai-note">
                  {tr('aiReadNote', {
                    urgency: tr(`aiUrgency.${threadData.ai_urgency}`, { defaultValue: threadData.ai_urgency }),
                    trade: tr(`aiTrade.${threadData.ai_trade}`, { defaultValue: threadData.ai_trade }),
                    reasoning: threadData.ai_reasoning,
                  })}
                </p>
              )}

              <div className="ticket-thread-body" ref={threadBodyRef}>
                {threadData.comments.length === 0 && (
                  <p style={{ fontSize: 12.5, color: 'var(--slate)', textAlign: 'center' }}>
                    {tr('noCommentsYet')}
                  </p>
                )}
                {threadData.comments.map((c) => (
                  <div className={`bubble ${c.sender === 'manager' ? 'out' : c.sender === 'ai' ? 'ai' : 'in'}`} key={c.id}>
                    {c.sender === 'ai' && <div className="bubble-sender">{tr('assistant')}</div>}
                    {c.body}
                    {c.attachment_url && (
                      <AttachmentPreview
                        url={c.attachment_url}
                        resourceType={c.attachment_cloudinary_resource_type}
                        fileName={c.attachment_file_name}
                      />
                    )}
                    <div style={{ fontSize: 10, opacity: 0.65, marginTop: 4 }}>{formatTime(c.created_at, i18n.language)}</div>
                  </div>
                ))}
              </div>

              <form className="ticket-thread-composer" onSubmit={handleSendComment}>
                <label className="attach-btn" title={tr('attachTitle')}>
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
                  placeholder={commentFile ? commentFile.name : tr('commentPlaceholder')}
                  disabled={sendingComment}
                />
                <button type="submit" className="btn btn-primary" disabled={sendingComment || (!commentDraft.trim() && !commentFile)}>
                  {tr('send')}
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
