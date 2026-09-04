import { Fragment, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getTicketDetail, updateTicketStatus, addTicketComment, proposeTicketReschedule } from '../staffApi.js'
import { linkify } from '../../utils/linkify.jsx'
import PrintableTicket from '../../components/PrintableTicket.jsx'

const ATTACHMENT_ACCEPT = '.jpg,.jpeg,.png,.webp,.heic,.pdf,.mp4,.mov,.webm'

const STATUS_LABEL = { new: 'New', in_progress: 'In progress', resolved: 'Resolved' }
const STATUS_VARIANT = { new: 'slate', in_progress: 'amber', resolved: 'green' }

function formatDate(value) {
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatTime(value) {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

// entry_date is a plain calendar date (no time component) — reading it in
// UTC avoids rolling it back a day in a negative-UTC-offset timezone, same
// reasoning as Maintenance.jsx's and PrintableTicket.jsx's own copies of
// this helper.
function formatEntryDate(value) {
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

// resource_type comes straight from Cloudinary — same distinction the
// manager and tenant sides already use to pick a preview.
function AttachmentPreview({ url, resourceType, fileName }) {
  if (resourceType === 'image') {
    return (
      <a href={url} target="_blank" rel="noreferrer">
        <img src={url} alt={fileName || 'Attachment'} className="portal-bubble-attachment-img" />
      </a>
    )
  }
  if (resourceType === 'video') {
    return <video src={url} controls className="portal-bubble-attachment-video" />
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="portal-bubble-attachment-file">
      📄 {fileName || 'Download attachment'}
    </a>
  )
}

function TicketDetail() {
  const { id } = useParams()
  const [ticket, setTicket] = useState(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  // Same client-side-only gate Tickets.jsx used — the server rejects a bare
  // resolve with no note regardless, this just stops the request firing.
  const [resolving, setResolving] = useState(false)
  const [completionNote, setCompletionNote] = useState('')
  const [commentDraft, setCommentDraft] = useState('')
  const [commentFile, setCommentFile] = useState(null)
  const [sendingComment, setSendingComment] = useState(false)
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [rescheduleTimeWindow, setRescheduleTimeWindow] = useState('')
  const [proposingReschedule, setProposingReschedule] = useState(false)
  const messagesRef = useRef(null)

  useEffect(() => {
    load()
  }, [id])

  useEffect(() => {
    if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight
  }, [ticket])

  async function load() {
    setLoading(true)
    try {
      setTicket(await getTicketDetail(id))
    } finally {
      setLoading(false)
    }
  }

  async function handleStatusChange(status, note) {
    setUpdating(true)
    try {
      await updateTicketStatus(id, status, note)
      await load()
    } finally {
      setUpdating(false)
    }
  }

  function openResolve() {
    setResolving(true)
    setCompletionNote('')
  }

  async function confirmResolve() {
    if (!completionNote.trim()) return
    await handleStatusChange('resolved', completionNote.trim())
    setResolving(false)
    setCompletionNote('')
  }

  async function handleSendComment(e) {
    e.preventDefault()
    if (!commentDraft.trim() && !commentFile) return
    setSendingComment(true)
    try {
      const formData = new FormData()
      if (commentDraft.trim()) formData.append('body', commentDraft.trim())
      if (commentFile) formData.append('attachment', commentFile)
      await addTicketComment(id, formData)
      setCommentDraft('')
      setCommentFile(null)
      await load()
    } finally {
      setSendingComment(false)
    }
  }

  async function handleProposeReschedule(e) {
    e.preventDefault()
    if (!rescheduleDate) return
    setProposingReschedule(true)
    try {
      await proposeTicketReschedule(id, {
        proposed_date: rescheduleDate,
        proposed_time_window: rescheduleTimeWindow.trim() || undefined,
      })
      setRescheduleDate('')
      setRescheduleTimeWindow('')
      await load()
    } finally {
      setProposingReschedule(false)
    }
  }

  if (loading) return <p style={{ fontSize: 12.5, color: 'var(--slate)' }}>Loading…</p>
  if (!ticket) return null

  return (
    <div>
      <Link to="/staff/tickets" className="back-link">
        ← Back to My Tickets
      </Link>

      <div className="portal-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <h2>{ticket.title}</h2>
          <span className={`portal-badge portal-badge-${STATUS_VARIANT[ticket.status]}`}>
            {STATUS_LABEL[ticket.status]}
          </span>
        </div>
        <p style={{ marginTop: 6, fontSize: 12.5, color: 'var(--slate)' }}>
          {ticket.property_name} · {ticket.unit_number}
          {ticket.tenant_name ? ` · ${ticket.tenant_name}` : ''}
          {ticket.tenant_phone ? ` · ${ticket.tenant_phone}` : ''}
        </p>
        {ticket.entry_permission != null && (
          <div className={'portal-entry-tag ' + (ticket.entry_permission ? 'portal-entry-tag-granted' : 'portal-entry-tag-denied')}>
            {ticket.entry_permission ? `🔑 Entry OK — ${formatEntryDate(ticket.entry_date)}` : '🔒 No entry permission'}
          </div>
        )}
        {ticket.description && <p style={{ marginTop: 6 }}>{ticket.description}</p>}
        <p style={{ marginTop: 8, fontSize: 11.5 }}>Reported {formatDate(ticket.created_at)}</p>

        {resolving ? (
          <div style={{ marginTop: 10 }}>
            <textarea
              value={completionNote}
              onChange={(e) => setCompletionNote(e.target.value)}
              placeholder="Describe what you did to resolve this…"
              rows={3}
              autoFocus
              style={{ width: '100%' }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <button
                className="portal-btn"
                style={{ padding: '6px 12px', fontSize: 12.5, background: 'var(--line)', color: 'var(--ink)' }}
                onClick={() => setResolving(false)}
                disabled={updating}
              >
                Cancel
              </button>
              <button
                className="portal-btn portal-btn-primary"
                style={{ padding: '6px 12px', fontSize: 12.5 }}
                onClick={confirmResolve}
                disabled={updating || !completionNote.trim()}
              >
                Confirm complete
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            {ticket.status !== 'in_progress' && (
              <button
                className="portal-btn portal-btn-primary"
                style={{ padding: '6px 12px', fontSize: 12.5 }}
                onClick={() => handleStatusChange('in_progress')}
                disabled={updating}
              >
                Mark in progress
              </button>
            )}
            {ticket.status !== 'resolved' && (
              <button
                className="portal-btn portal-btn-primary"
                style={{ padding: '6px 12px', fontSize: 12.5 }}
                onClick={openResolve}
                disabled={updating}
              >
                Mark complete
              </button>
            )}
            {ticket.status === 'resolved' && (
              <button
                className="portal-btn"
                style={{ padding: '6px 12px', fontSize: 12.5, background: 'var(--line)', color: 'var(--ink)' }}
                onClick={() => handleStatusChange('in_progress')}
                disabled={updating}
              >
                Reopen
              </button>
            )}
          </div>
        )}

        {ticket.entry_permission != null && (
          <p
            className={ticket.entry_permission ? 'staff-entry-note-granted' : 'staff-entry-note-denied'}
            style={{ marginTop: 10 }}
          >
            {ticket.entry_permission
              ? `Entry permitted — available ${formatEntryDate(ticket.entry_date)}, anytime between 9am–5pm.`
              : 'Entry permission not granted — coordinate access with the tenant separately.'}
          </p>
        )}
        {ticket.reschedules?.some((r) => r.status === 'approved' && r.entry_permission == null) && (
          <p className="staff-entry-note-denied" style={{ marginTop: 10 }}>
            Waiting on the tenant to confirm entry permission for the new date.
          </p>
        )}

        {ticket.status !== 'resolved' && (
          <form className="staff-reschedule-form" onSubmit={handleProposeReschedule} style={{ marginTop: 10 }}>
            <div className="form-field">
              <label htmlFor="rescheduleDate">Propose new visit date</label>
              <input
                id="rescheduleDate"
                type="date"
                value={rescheduleDate}
                onChange={(e) => setRescheduleDate(e.target.value)}
                disabled={proposingReschedule}
              />
            </div>
            <div className="form-field">
              <label htmlFor="rescheduleTimeWindow">Time window (optional)</label>
              <input
                id="rescheduleTimeWindow"
                type="text"
                placeholder="e.g. 2:00 PM or morning"
                value={rescheduleTimeWindow}
                onChange={(e) => setRescheduleTimeWindow(e.target.value)}
                disabled={proposingReschedule}
              />
            </div>
            <button
              type="submit"
              className="portal-btn portal-btn-primary"
              style={{ padding: '6px 12px', fontSize: 12.5 }}
              disabled={proposingReschedule || !rescheduleDate}
            >
              Propose
            </button>
          </form>
        )}

        {ticket.reschedules?.length > 0 && (
          <div className="staff-reschedule-history">
            <h4>Reschedule history</h4>
            {ticket.reschedules.map((r) => (
              <div key={r.id} className="staff-reschedule-row">
                <span>
                  {r.proposed_by === 'staff' ? `${r.staff_first_name} (Maintenance)` : 'Manager'} proposed{' '}
                  {formatEntryDate(r.proposed_date)}
                </span>
                <span className={`reschedule-status-${r.status}`}>
                  {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                </span>
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          className="portal-btn"
          style={{ padding: '6px 12px', fontSize: 12.5, marginTop: 10 }}
          onClick={() => window.print()}
        >
          Print
        </button>
        <PrintableTicket ticket={ticket} />

        <div className="portal-ticket-messages" ref={messagesRef} style={{ marginTop: 14 }}>
          {ticket.comments.length === 0 && (
            <p style={{ fontSize: 12.5, color: 'var(--slate)', textAlign: 'center' }}>No messages on this ticket yet.</p>
          )}
          {(() => {
            const seenStaffIds = new Set()
            return ticket.comments.map((c) => {
              // A staff chat message (not a completion note) gets a one-time
              // "joined the conversation" banner the first time a given
              // staff_id shows up in the thread — same check every other
              // surface (tenant portal, manager dashboard) makes independently
              // off this same is_completion_note/staff_id data.
              const isStaffChat = c.sender === 'staff' && !c.is_completion_note
              const isFirstFromThisStaffer = isStaffChat && !seenStaffIds.has(c.staff_id)
              if (isStaffChat) seenStaffIds.add(c.staff_id)
              return (
                <Fragment key={c.id}>
                  {isFirstFromThisStaffer && (
                    <div className="portal-join-banner">{c.staff_first_name} (Maintenance) joined the conversation</div>
                  )}
                  <div
                    className={`portal-bubble ${c.sender === 'manager' ? 'out' : c.sender === 'staff' ? 'out' : c.sender === 'ai' ? 'ai' : 'in'}`}
                  >
                    {c.sender === 'ai' && <div className="portal-bubble-sender">Assistant</div>}
                    {c.sender === 'manager' && <div className="portal-bubble-sender">Manager</div>}
                    {c.sender === 'tenant' && <div className="portal-bubble-sender">Tenant</div>}
                    {/* is_completion_note distinguishes the resolve flow's
                        note (only way a 'staff' comment could exist before
                        staff got their own free-text reply route) from a
                        real chat message. */}
                    {c.sender === 'staff' && c.is_completion_note && (
                      <div className="portal-bubble-sender">✅ Completion note</div>
                    )}
                    {isStaffChat && (
                      <div className="portal-bubble-sender portal-bubble-sender-staff">
                        {c.staff_first_name} (Maintenance)
                      </div>
                    )}
                    {linkify(c.body)}
                    {c.attachment_url && (
                      <AttachmentPreview
                        url={c.attachment_url}
                        resourceType={c.attachment_cloudinary_resource_type}
                        fileName={c.attachment_file_name}
                      />
                    )}
                    <div className="portal-bubble-time">{formatTime(c.created_at)}</div>
                  </div>
                </Fragment>
              )
            })
          })()}
        </div>

        <form className="portal-ticket-composer" onSubmit={handleSendComment}>
          <label className="portal-attach-btn" title="Attach a photo, video, or document">
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
            placeholder={commentFile ? commentFile.name : 'Type a message…'}
            disabled={sendingComment}
          />
          <button
            type="submit"
            className="portal-btn portal-btn-primary"
            disabled={sendingComment || (!commentDraft.trim() && !commentFile)}
          >
            Send
          </button>
        </form>
      </div>
    </div>
  )
}

export default TicketDetail
