import { Fragment, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  getPortalMaintenance,
  createPortalMaintenance,
  getPortalMaintenanceDetail,
  addPortalMaintenanceComment,
  flagPortalMaintenanceEmergency,
  respondToPortalReschedule,
  answerPortalRescheduleEntryPermission,
} from '../portalApi.js'

const STATUS_VARIANT = {
  pending: 'slate',
  new: 'slate',
  in_progress: 'amber',
  resolved: 'green',
}

function formatDate(value, locale) {
  return new Date(value).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' })
}

// entry_date is a plain calendar date (no time component), unlike
// created_at above — displaying it via the viewer's local timezone (like
// formatDate does, correctly, for a real timestamp) could roll it back a
// day for a viewer west of UTC. Reading it in UTC guarantees the displayed
// day always matches the date the tenant actually picked.
function formatEntryDate(value, locale) {
  return new Date(value).toLocaleDateString(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function formatTime(value, locale) {
  return new Date(value).toLocaleString(locale, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

// resource_type comes straight from Cloudinary ('image', 'video', or 'raw'
// for anything else — PDFs, docs) — that's already exactly the distinction
// needed to pick a preview.
function AttachmentPreview({ url, resourceType, fileName }) {
  const { t } = useTranslation('portal-repairs')
  if (resourceType === 'image') {
    return (
      <a href={url} target="_blank" rel="noreferrer">
        <img src={url} alt={fileName || t('attachmentAlt')} className="portal-bubble-attachment-img" />
      </a>
    )
  }
  if (resourceType === 'video') {
    return <video src={url} controls className="portal-bubble-attachment-video" />
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="portal-bubble-attachment-file">
      📄 {fileName || t('downloadAttachment')}
    </a>
  )
}

const ATTACHMENT_ACCEPT = '.jpg,.jpeg,.png,.webp,.heic,.pdf,.mp4,.mov,.webm'

function Repairs() {
  const { t, i18n } = useTranslation('portal-repairs')
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('medium')
  const [entryPermission, setEntryPermission] = useState('')
  const [entryDate, setEntryDate] = useState('')
  const [reportFile, setReportFile] = useState(null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Which ticket's thread is expanded, and its fetched detail (comments).
  const [expandedId, setExpandedId] = useState(null)
  const [threadData, setThreadData] = useState(null)
  const [commentDraft, setCommentDraft] = useState('')
  const [commentFile, setCommentFile] = useState(null)
  const [sendingComment, setSendingComment] = useState(false)
  // Ticket id currently being flagged, or null — the button now lives on
  // each card's header, so more than one card could act at once.
  const [flagging, setFlagging] = useState(null)
  const [respondingReschedule, setRespondingReschedule] = useState(false)
  const [rescheduleEntryPermission, setRescheduleEntryPermission] = useState('')
  const [rescheduleEntryDate, setRescheduleEntryDate] = useState('')
  const [answeringEntryPermission, setAnsweringEntryPermission] = useState(false)
  const threadBodyRef = useRef(null)

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (threadBodyRef.current) threadBodyRef.current.scrollTop = threadBodyRef.current.scrollHeight
  }, [threadData])

  async function load() {
    setLoading(true)
    try {
      setRequests(await getPortalMaintenance())
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const formData = new FormData()
      formData.append('title', title)
      if (description) formData.append('description', description)
      formData.append('priority', priority)
      formData.append('entry_permission', entryPermission)
      if (entryPermission === 'yes') formData.append('entry_date', entryDate)
      if (reportFile) formData.append('attachment', reportFile)
      const created = await createPortalMaintenance(formData)
      setTitle('')
      setDescription('')
      setPriority('medium')
      setEntryPermission('')
      setEntryDate('')
      setReportFile(null)
      setShowForm(false)
      await load()
      // Open straight into the conversation — the assistant's first reply
      // is already waiting, and chatting is the whole point before a real
      // ticket exists.
      setExpandedId(created.id)
      setThreadData(await getPortalMaintenanceDetail(created.id))
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // Tapping a card toggles its thread open/closed. Opening it marks the
  // ticket read server-side, so clear the badge locally right away too.
  async function toggleThread(request) {
    if (expandedId === request.id) {
      setExpandedId(null)
      setThreadData(null)
      setCommentDraft('')
      setCommentFile(null)
      setRescheduleEntryPermission('')
      setRescheduleEntryDate('')
      return
    }
    setExpandedId(request.id)
    setThreadData(null)
    setRescheduleEntryPermission('')
    setRescheduleEntryDate('')
    setThreadData(await getPortalMaintenanceDetail(request.id))
    setRequests((rows) => rows.map((r) => (r.id === request.id ? { ...r, unread_by_tenant: false } : r)))
  }

  async function handleRespondToReschedule(decision) {
    setRespondingReschedule(true)
    try {
      await respondToPortalReschedule(expandedId, decision)
      setThreadData(await getPortalMaintenanceDetail(expandedId))
    } finally {
      setRespondingReschedule(false)
    }
  }

  async function handleAnswerReschedulEntryPermission(e) {
    e.preventDefault()
    if (!rescheduleEntryPermission) return
    setAnsweringEntryPermission(true)
    try {
      await answerPortalRescheduleEntryPermission(
        expandedId,
        rescheduleEntryPermission,
        rescheduleEntryPermission === 'yes' ? rescheduleEntryDate : undefined
      )
      setRescheduleEntryPermission('')
      setRescheduleEntryDate('')
      const detail = await getPortalMaintenanceDetail(expandedId)
      setThreadData(detail)
      // The ticket's own entry_permission/entry_date just changed — sync the
      // card's cached copy so the tag on the list view reflects the new
      // answer without needing a full reload.
      setRequests((rows) =>
        rows.map((r) =>
          r.id === expandedId ? { ...r, entry_permission: detail.entry_permission, entry_date: detail.entry_date } : r
        )
      )
    } finally {
      setAnsweringEntryPermission(false)
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
      await addPortalMaintenanceComment(expandedId, formData)
      setCommentDraft('')
      setCommentFile(null)
      const detail = await getPortalMaintenanceDetail(expandedId)
      setThreadData(detail)
      // A reply can promote a pending conversation into a real ticket
      // server-side — sync the list's cached row so the card's status badge
      // reflects that without a full reload, same as handleFlagEmergency does.
      setRequests((rows) =>
        rows.map((r) =>
          r.id === expandedId
            ? {
                ...r,
                status: detail.status,
                priority: detail.priority,
                is_emergency: detail.is_emergency,
                ai_urgency: detail.ai_urgency,
                ai_trade: detail.ai_trade,
                ai_classification_status: detail.ai_classification_status,
              }
            : r
        )
      )
    } finally {
      setSendingComment(false)
    }
  }

  // Lives on the card header now, not just inside the expanded thread — can
  // be triggered for any ticket in the list, not only the one currently open.
  async function handleFlagEmergency(ticketId) {
    if (!window.confirm(t('confirmFlagEmergency'))) return
    setFlagging(ticketId)
    try {
      await flagPortalMaintenanceEmergency(ticketId)
      if (expandedId === ticketId) setThreadData(await getPortalMaintenanceDetail(ticketId))
      setRequests((rows) => rows.map((r) => (r.id === ticketId ? { ...r, is_emergency: true, priority: 'high' } : r)))
    } finally {
      setFlagging(null)
    }
  }

  return (
    <div>
      <p className="portal-greeting" style={{ fontSize: 20 }}>
        {t('title')}
      </p>

      {showForm ? (
        <div className="portal-card">
          <h2 style={{ marginBottom: 12 }}>{t('reportIssue')}</h2>
          <form onSubmit={handleSubmit}>
            {error && <p className="portal-error">{error}</p>}

            <div className="portal-field">
              <label htmlFor="title">{t('whatsWrong')}</label>
              <input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('whatsWrongPlaceholder')}
                required
              />
            </div>

            <div className="portal-field">
              <label htmlFor="description">{t('detailsOptional')}</label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>

            <div className="portal-field">
              <label htmlFor="priority">{t('howUrgent')}</label>
              <select id="priority" value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="low">{t('priorityLow')}</option>
                <option value="medium">{t('priorityMedium')}</option>
                <option value="high">{t('priorityHigh')}</option>
              </select>
            </div>

            <div className="portal-field">
              <label htmlFor="entry-permission">{t('entryPermissionQuestion')}</label>
              <select
                id="entry-permission"
                value={entryPermission}
                onChange={(e) => {
                  setEntryPermission(e.target.value)
                  if (e.target.value !== 'yes') setEntryDate('')
                }}
                required
              >
                <option value="" disabled>
                  {t('entryPermissionChoose')}
                </option>
                <option value="yes">{t('entryPermissionYes')}</option>
                <option value="no">{t('entryPermissionNo')}</option>
              </select>
            </div>

            {entryPermission === 'yes' && (
              <div className="portal-field">
                <label htmlFor="entry-date">{t('entryDateLabel')}</label>
                <input
                  id="entry-date"
                  type="date"
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                  required
                />
                <span style={{ fontSize: 12, color: 'var(--slate)' }}>{t('entryWindowNote')}</span>
              </div>
            )}

            <div className="portal-field">
              <label htmlFor="attachment">{t('photoOrVideoOptional')}</label>
              <input
                id="attachment"
                type="file"
                accept={ATTACHMENT_ACCEPT}
                onChange={(e) => setReportFile(e.target.files?.[0] || null)}
              />
              {reportFile && <span style={{ fontSize: 12, color: 'var(--slate)' }}>{reportFile.name}</span>}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                className="portal-btn"
                style={{ background: 'var(--line)', color: 'var(--ink)' }}
                onClick={() => setShowForm(false)}
                disabled={submitting}
              >
                {t('cancel')}
              </button>
              <button type="submit" className="portal-btn portal-btn-primary" disabled={submitting}>
                {submitting ? t('sending') : t('submit')}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <button className="portal-btn portal-btn-primary" style={{ marginBottom: 16 }} onClick={() => setShowForm(true)}>
          {t('reportIssueButton')}
        </button>
      )}

      {!loading && requests.length === 0 && (
        <div className="portal-card">
          <p>{t('noRequestsYet')}</p>
        </div>
      )}

      {requests.map((r) => {
        const isOpen = expandedId === r.id
        return (
          <div className="portal-card" key={r.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <h2>
                {r.title}
                {r.unread_by_tenant && <span className="portal-unread-dot" title={t('newReplyTitle')} />}
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                <span className={`portal-badge portal-badge-${STATUS_VARIANT[r.status]}`}>
                  {t(`statusMeta.${r.status}`)}
                </span>
                {!r.is_emergency && (
                  <button
                    className="portal-emergency-btn-sm"
                    onClick={() => handleFlagEmergency(r.id)}
                    disabled={flagging === r.id}
                  >
                    {flagging === r.id ? t('flagging') : t('flagAsEmergency')}
                  </button>
                )}
              </div>
            </div>
            {r.is_emergency && <div className="portal-emergency-tag">{t('emergency')}</div>}
            {r.entry_permission != null && (
              <div className={'portal-entry-tag ' + (r.entry_permission ? 'portal-entry-tag-granted' : 'portal-entry-tag-denied')}>
                {r.entry_permission
                  ? t('entryGranted', { date: formatEntryDate(r.entry_date, i18n.language) })
                  : t('entryNotGranted')}
              </div>
            )}
            {r.description && <p style={{ marginTop: 6 }}>{r.description}</p>}
            {r.ai_classification_status === 'success' && (
              <div className="portal-ai-tag">
                ⚡ {t(`aiUrgency.${r.ai_urgency}`, { defaultValue: r.ai_urgency })} ·{' '}
                {t(`aiTrade.${r.ai_trade}`, { defaultValue: r.ai_trade })}
              </div>
            )}
            <p style={{ marginTop: 8, fontSize: 11.5 }}>{t('submittedOn', { date: formatDate(r.created_at, i18n.language) })}</p>

            <button className="portal-ticket-toggle" onClick={() => toggleThread(r)}>
              {isOpen ? t('hideConversation') : t('viewConversation')}
            </button>

            {isOpen && (
              <div className="portal-ticket-thread">
                {!threadData ? (
                  <p style={{ fontSize: 12.5, color: 'var(--slate)' }}>{t('loading')}</p>
                ) : (
                  <>
                    {(() => {
                      const pending = threadData.reschedules?.find((rs) => rs.status === 'pending')
                      const awaitingEntry = threadData.reschedules?.find(
                        (rs) => rs.status === 'approved' && rs.entry_permission == null
                      )
                      if (pending) {
                        return (
                          <div className="portal-reschedule-card">
                            <p>
                              {t('reschedule.proposedTitle')}: {formatEntryDate(pending.proposed_date, i18n.language)}
                              {pending.proposed_time_window ? ` · ${pending.proposed_time_window}` : ''}
                            </p>
                            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                              <button
                                type="button"
                                className="portal-btn portal-btn-primary"
                                style={{ padding: '6px 12px', fontSize: 12.5 }}
                                onClick={() => handleRespondToReschedule('approved')}
                                disabled={respondingReschedule}
                              >
                                {t('reschedule.approve')}
                              </button>
                              <button
                                type="button"
                                className="portal-btn"
                                style={{ padding: '6px 12px', fontSize: 12.5, background: 'var(--line)', color: 'var(--ink)' }}
                                onClick={() => handleRespondToReschedule('declined')}
                                disabled={respondingReschedule}
                              >
                                {t('reschedule.decline')}
                              </button>
                            </div>
                          </div>
                        )
                      }
                      if (awaitingEntry) {
                        return (
                          <form className="portal-reschedule-card" onSubmit={handleAnswerReschedulEntryPermission}>
                            <p>{t('reschedule.entryPermissionIntro')}</p>
                            <div className="portal-field">
                              <select
                                value={rescheduleEntryPermission}
                                onChange={(e) => {
                                  setRescheduleEntryPermission(e.target.value)
                                  if (e.target.value !== 'yes') setRescheduleEntryDate('')
                                }}
                                disabled={answeringEntryPermission}
                                required
                              >
                                <option value="" disabled>
                                  {t('entryPermissionChoose')}
                                </option>
                                <option value="yes">{t('entryPermissionYes')}</option>
                                <option value="no">{t('entryPermissionNo')}</option>
                              </select>
                            </div>
                            {rescheduleEntryPermission === 'yes' && (
                              <div className="portal-field">
                                <label htmlFor="reschedule-entry-date">{t('entryDateLabel')}</label>
                                <input
                                  id="reschedule-entry-date"
                                  type="date"
                                  value={rescheduleEntryDate}
                                  onChange={(e) => setRescheduleEntryDate(e.target.value)}
                                  disabled={answeringEntryPermission}
                                  required
                                />
                                <span style={{ fontSize: 12, color: 'var(--slate)' }}>{t('entryWindowNote')}</span>
                              </div>
                            )}
                            <button
                              type="submit"
                              className="portal-btn portal-btn-primary"
                              style={{ padding: '6px 12px', fontSize: 12.5 }}
                              disabled={answeringEntryPermission || !rescheduleEntryPermission}
                            >
                              {answeringEntryPermission ? t('sending') : t('submit')}
                            </button>
                          </form>
                        )
                      }
                      return null
                    })()}

                    {threadData.reschedules?.length > 0 && (
                      <div className="portal-reschedule-history">
                        <h4>{t('reschedule.historyTitle')}</h4>
                        {threadData.reschedules.map((rs) => (
                          <div key={rs.id} className="portal-reschedule-row">
                            <span>
                              {t('reschedule.proposedBy', {
                                name: rs.proposed_by === 'staff' ? t('reschedule.maintenanceLabel') : t('reschedule.managerLabel'),
                                date: formatEntryDate(rs.proposed_date, i18n.language),
                              })}
                            </span>
                            <span className={`reschedule-status-${rs.status}`}>
                              {t(`reschedule.status${rs.status.charAt(0).toUpperCase()}${rs.status.slice(1)}`)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="portal-ticket-messages" ref={threadBodyRef}>
                      {threadData.comments.length === 0 && (
                        <p style={{ fontSize: 12.5, color: 'var(--slate)', textAlign: 'center' }}>
                          {t('noMessagesYet')}
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
                                <div className="portal-join-banner">
                                  {c.staff_first_name} (Maintenance) joined the conversation
                                </div>
                              )}
                              <div
                                className={`portal-bubble ${c.sender === 'tenant' ? 'out' : c.sender === 'ai' ? 'ai' : 'in'}`}
                              >
                                {c.sender === 'ai' && <div className="portal-bubble-sender">{t('assistant')}</div>}
                                {isStaffChat && (
                                  <div className="portal-bubble-sender portal-bubble-sender-staff">
                                    {c.staff_first_name} (Maintenance)
                                  </div>
                                )}
                                {c.body}
                                {c.attachment_url && (
                                  <AttachmentPreview
                                    url={c.attachment_url}
                                    resourceType={c.attachment_cloudinary_resource_type}
                                    fileName={c.attachment_file_name}
                                  />
                                )}
                                <div className="portal-bubble-time">{formatTime(c.created_at, i18n.language)}</div>
                              </div>
                            </Fragment>
                          )
                        })
                      })()}
                    </div>

                    <form className="portal-ticket-composer" onSubmit={handleSendComment}>
                      <label className="portal-attach-btn" title={t('attachTitle')}>
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
                        placeholder={commentFile ? commentFile.name : t('replyPlaceholder')}
                        disabled={sendingComment}
                      />
                      <button
                        type="submit"
                        className="portal-btn portal-btn-primary"
                        disabled={sendingComment || (!commentDraft.trim() && !commentFile)}
                      >
                        {t('send')}
                      </button>
                    </form>
                  </>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default Repairs
