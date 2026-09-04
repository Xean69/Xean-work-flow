import { Fragment, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  getMaintenanceRequests,
  getTenants,
  createMaintenanceRequest,
  updateMaintenanceRequest,
  deleteMaintenanceRequest,
  getMaintenanceRequest,
  addMaintenanceComment,
  getMaintenanceStaff,
  assignMaintenanceTicket,
  proposeMaintenanceReschedule,
} from '../api/client.js'
import PageHeader from '../components/PageHeader.jsx'
import Modal from '../components/Modal.jsx'
import MaintenanceForm from '../components/MaintenanceForm.jsx'
import PrintableTicket from '../components/PrintableTicket.jsx'
import { linkify } from '../utils/linkify.jsx'
import './Maintenance.css'

const COLUMN_STATUSES = ['new', 'in_progress', 'resolved']

// Priority is stored as low/medium/high; the urgency-dot CSS classes are
// named low/mid/high (from the original mockup), so this bridges the two.
const PRIORITY_DOT_CLASS = { low: 'low', medium: 'mid', high: 'high' }

// A native <select><option> can't render a styled span the way Team.jsx's
// presence-dot does — plain text is all an option's content can ever be —
// so this dropdown gets an emoji instead, same three-way status.
const PRESENCE_EMOJI = { online: '🟢', away: '🟡', offline: '⚪' }

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

// entry_date is a plain calendar date (no time component) — pg returns it
// as a UTC-midnight Date, so formatting with the viewer's local timezone
// (like formatTime above, correctly, for real timestamps) could roll it
// back a day in a negative-UTC-offset timezone. Reading it in UTC instead
// guarantees the displayed day always matches the date actually stored.
function formatEntryDate(value, locale) {
  return new Date(value).toLocaleDateString(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' })
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
  const [staffList, setStaffList] = useState([])
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
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [rescheduleTimeWindow, setRescheduleTimeWindow] = useState('')
  const [proposingReschedule, setProposingReschedule] = useState(false)
  const threadBodyRef = useRef(null)
  const [searchParams, setSearchParams] = useSearchParams()

  useEffect(() => {
    load()
  }, [])

  // Deep-link from a push notification — e.g. /maintenance?ticket=72. Gated
  // on the ticket list actually being loaded, since opening the thread
  // reuses an already-fetched row rather than fetching by id directly.
  useEffect(() => {
    const wanted = searchParams.get('ticket')
    if (!wanted || threadTicketId || tickets.length === 0) return
    const match = tickets.find((t) => String(t.id) === wanted)
    if (match) {
      openThread(match)
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.delete('ticket')
        return next
      })
    }
  }, [searchParams, tickets])

  useEffect(() => {
    if (threadBodyRef.current) threadBodyRef.current.scrollTop = threadBodyRef.current.scrollHeight
  }, [threadData])

  async function load() {
    setLoading(true)
    setLoadError('')
    try {
      const [maintenanceRows, tenantRows, staffRows] = await Promise.all([
        getMaintenanceRequests(),
        getTenants(),
        getMaintenanceStaff(),
      ])
      setTickets(maintenanceRows)
      setUnitRows(tenantRows)
      setStaffList(staffRows)
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

  async function handleAssign(ticket, staffId) {
    // Optimistic — the dropdown itself is the only feedback a manager gets,
    // so it should reflect the change immediately rather than waiting on a
    // full board reload (which still happens, to pick up the real state).
    setTickets((rows) => (rows.map((r) => (r.id === ticket.id ? { ...r, assigned_staff_id: staffId } : r))))
    await assignMaintenanceTicket(ticket.id, staffId)
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
    setRescheduleDate('')
    setRescheduleTimeWindow('')
  }

  async function handleProposeReschedule(e) {
    e.preventDefault()
    if (!rescheduleDate) return
    setProposingReschedule(true)
    try {
      await proposeMaintenanceReschedule(threadTicketId, {
        proposed_date: rescheduleDate,
        proposed_time_window: rescheduleTimeWindow.trim() || undefined,
      })
      setRescheduleDate('')
      setRescheduleTimeWindow('')
      setThreadData(await getMaintenanceRequest(threadTicketId))
    } finally {
      setProposingReschedule(false)
    }
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

  const assignedStaff = threadData ? staffList.find((s) => s.id === threadData.assigned_staff_id) : null
  const assignedStaffName = assignedStaff ? `${assignedStaff.first_name} ${assignedStaff.last_name}` : null

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
                      {t.sla_warning && <div className="ticket-sla-tag">{tr('slaBadge')}</div>}
                      {t.entry_permission != null && (
                        <div className={t.entry_permission ? 'ticket-entry-tag-granted' : 'ticket-entry-tag-denied'}>
                          {t.entry_permission
                            ? tr('entryGranted', { date: formatEntryDate(t.entry_date, i18n.language) })
                            : tr('entryNotGranted')}
                        </div>
                      )}
                      <AiTag ticket={t} />

                      <select
                        className="ticket-assign-select"
                        value={t.assigned_staff_id || ''}
                        onChange={(e) => handleAssign(t, e.target.value ? Number(e.target.value) : null)}
                      >
                        <option value="">{tr('unassigned')}</option>
                        {staffList.map((s) => (
                          <option key={s.id} value={s.id}>
                            {PRESENCE_EMOJI[s.presence]} {s.first_name} {s.last_name}
                          </option>
                        ))}
                      </select>

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
              <button type="button" className="btn btn-ghost" onClick={() => window.print()}>
                {tr('print')}
              </button>
              <div className="form-field" style={{ maxWidth: 260 }}>
                <label htmlFor="threadAssign">{tr('assignLabel')}</label>
                <select
                  id="threadAssign"
                  className="ticket-assign-select"
                  value={threadData.assigned_staff_id || ''}
                  onChange={(e) => {
                    const staffId = e.target.value ? Number(e.target.value) : null
                    setThreadData((prev) => ({ ...prev, assigned_staff_id: staffId }))
                    handleAssign({ id: threadTicketId }, staffId)
                  }}
                >
                  <option value="">{tr('unassigned')}</option>
                  {staffList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.first_name} {s.last_name}
                    </option>
                  ))}
                </select>
              </div>
              {threadData.description && <p className="ticket-thread-description">{threadData.description}</p>}
              {threadData.is_emergency && <p className="ticket-thread-emergency-note">{tr('emergencyNote')}</p>}
              {threadData.entry_permission != null && (
                <p className={threadData.entry_permission ? 'ticket-thread-entry-note-granted' : 'ticket-thread-entry-note-denied'}>
                  {threadData.entry_permission
                    ? tr('entryPermittedNote', { date: formatEntryDate(threadData.entry_date, i18n.language) })
                    : tr('entryNotGrantedNote')}
                </p>
              )}
              {threadData.ai_classification_status === 'success' && (
                <p className="ticket-thread-ai-note">
                  {tr('aiReadNote', {
                    urgency: tr(`aiUrgency.${threadData.ai_urgency}`, { defaultValue: threadData.ai_urgency }),
                    trade: tr(`aiTrade.${threadData.ai_trade}`, { defaultValue: threadData.ai_trade }),
                    reasoning: threadData.ai_reasoning,
                  })}
                </p>
              )}
              {threadData.reschedules?.some((r) => r.status === 'approved' && r.entry_permission == null) && (
                <p className="ticket-thread-entry-note-denied">{tr('reschedule.awaitingEntryPermission')}</p>
              )}

              {threadData.status !== 'resolved' && (
                <form className="ticket-reschedule-form" onSubmit={handleProposeReschedule}>
                  <div className="form-field">
                    <label htmlFor="rescheduleDate">{tr('reschedule.dateLabel')}</label>
                    <input
                      id="rescheduleDate"
                      type="date"
                      value={rescheduleDate}
                      onChange={(e) => setRescheduleDate(e.target.value)}
                      disabled={proposingReschedule}
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="rescheduleTimeWindow">{tr('reschedule.timeWindowLabel')}</label>
                    <input
                      id="rescheduleTimeWindow"
                      type="text"
                      placeholder={tr('reschedule.timeWindowPlaceholder')}
                      value={rescheduleTimeWindow}
                      onChange={(e) => setRescheduleTimeWindow(e.target.value)}
                      disabled={proposingReschedule}
                    />
                  </div>
                  <button type="submit" className="btn btn-ghost btn-sm" disabled={proposingReschedule || !rescheduleDate}>
                    {tr('reschedule.submit')}
                  </button>
                </form>
              )}

              {threadData.reschedules?.length > 0 && (
                <div className="ticket-reschedule-history">
                  <h4>{tr('reschedule.historyTitle')}</h4>
                  {threadData.reschedules.map((r) => (
                    <div key={r.id} className="ticket-reschedule-row">
                      <span>
                        {tr('reschedule.proposedBy', {
                          name: r.proposed_by === 'staff' ? `${r.staff_first_name} (${tr('reschedule.maintenanceLabel')})` : tr('reschedule.managerLabel'),
                          date: formatEntryDate(r.proposed_date, i18n.language),
                        })}
                      </span>
                      <span className={`reschedule-status-${r.status}`}>{tr(`reschedule.status${r.status.charAt(0).toUpperCase()}${r.status.slice(1)}`)}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="ticket-thread-body" ref={threadBodyRef}>
                {threadData.comments.length === 0 && (
                  <p style={{ fontSize: 12.5, color: 'var(--slate)', textAlign: 'center' }}>
                    {tr('noCommentsYet')}
                  </p>
                )}
                {(() => {
                  const seenStaffIds = new Set()
                  return threadData.comments.map((c) => {
                    const isStaffChat = c.sender === 'staff' && !c.is_completion_note
                    const isFirstFromThisStaffer = isStaffChat && !seenStaffIds.has(c.staff_id)
                    if (isStaffChat) seenStaffIds.add(c.staff_id)
                    return (
                      <Fragment key={c.id}>
                        {isFirstFromThisStaffer && (
                          <div className="join-banner">{c.staff_first_name} (Maintenance) joined the conversation</div>
                        )}
                        <div
                          className={`bubble ${c.sender === 'manager' ? 'out' : c.sender === 'staff' ? 'out' : c.sender === 'ai' ? 'ai' : 'in'}`}
                        >
                          {c.sender === 'ai' && <div className="bubble-sender">{tr('assistant')}</div>}
                          {/* is_completion_note distinguishes the resolve flow's note
                              from a real staff chat message. */}
                          {c.sender === 'staff' && c.is_completion_note && (
                            <div className="bubble-sender">{tr('completionNote')}</div>
                          )}
                          {isStaffChat && (
                            <div className="bubble-sender bubble-sender-staff">{c.staff_first_name} (Maintenance)</div>
                          )}
                          {linkify(c.body)}
                          {c.attachment_url && (
                            <AttachmentPreview
                              url={c.attachment_url}
                              resourceType={c.attachment_cloudinary_resource_type}
                              fileName={c.attachment_file_name}
                            />
                          )}
                          <div style={{ fontSize: 10, opacity: 0.65, marginTop: 4 }}>
                            {formatTime(c.created_at, i18n.language)}
                          </div>
                        </div>
                      </Fragment>
                    )
                  })
                })()}
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

              <PrintableTicket ticket={threadData} assignedStaffName={assignedStaffName} />
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}

export default Maintenance
