import { useEffect, useRef, useState } from 'react'
import {
  getPortalMaintenance,
  createPortalMaintenance,
  getPortalMaintenanceDetail,
  addPortalMaintenanceComment,
  flagPortalMaintenanceEmergency,
} from '../portalApi.js'

const STATUS_META = {
  pending: { label: 'Chatting with assistant', variant: 'slate' },
  new: { label: 'Submitted', variant: 'slate' },
  in_progress: { label: 'In progress', variant: 'amber' },
  resolved: { label: 'Resolved', variant: 'green' },
}

// Same mapping as the dashboard's Maintenance.jsx — raw classifier tokens
// to the "⚡ Urgent · Plumbing" mockup labels.
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

// resource_type comes straight from Cloudinary ('image', 'video', or 'raw'
// for anything else — PDFs, docs) — that's already exactly the distinction
// needed to pick a preview.
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

const ATTACHMENT_ACCEPT = '.jpg,.jpeg,.png,.webp,.heic,.pdf,.mp4,.mov,.webm'

function Repairs() {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('medium')
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
      if (reportFile) formData.append('attachment', reportFile)
      const created = await createPortalMaintenance(formData)
      setTitle('')
      setDescription('')
      setPriority('medium')
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
      return
    }
    setExpandedId(request.id)
    setThreadData(null)
    setThreadData(await getPortalMaintenanceDetail(request.id))
    setRequests((rows) => rows.map((r) => (r.id === request.id ? { ...r, unread_by_tenant: false } : r)))
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
    if (!window.confirm('Flag this as an emergency? A manager will be notified right away.')) return
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
        Repairs
      </p>

      {showForm ? (
        <div className="portal-card">
          <h2 style={{ marginBottom: 12 }}>Report an issue</h2>
          <form onSubmit={handleSubmit}>
            {error && <p className="portal-error">{error}</p>}

            <div className="portal-field">
              <label htmlFor="title">What's wrong?</label>
              <input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Leaky kitchen faucet"
                required
              />
            </div>

            <div className="portal-field">
              <label htmlFor="description">Details (optional)</label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>

            <div className="portal-field">
              <label htmlFor="priority">How urgent is it?</label>
              <select id="priority" value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="low">Low — whenever's convenient</option>
                <option value="medium">Medium — sometime this week</option>
                <option value="high">High — needs attention soon</option>
              </select>
            </div>

            <div className="portal-field">
              <label htmlFor="attachment">Photo or video (optional)</label>
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
                Cancel
              </button>
              <button type="submit" className="portal-btn portal-btn-primary" disabled={submitting}>
                {submitting ? 'Sending…' : 'Submit'}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <button className="portal-btn portal-btn-primary" style={{ marginBottom: 16 }} onClick={() => setShowForm(true)}>
          + Report an issue
        </button>
      )}

      {!loading && requests.length === 0 && (
        <div className="portal-card">
          <p>No repair requests yet.</p>
        </div>
      )}

      {requests.map((r) => {
        const status = STATUS_META[r.status]
        const isOpen = expandedId === r.id
        return (
          <div className="portal-card" key={r.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <h2>
                {r.title}
                {r.unread_by_tenant && <span className="portal-unread-dot" title="New reply" />}
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                <span className={`portal-badge portal-badge-${status.variant}`}>{status.label}</span>
                {!r.is_emergency && (
                  <button
                    className="portal-emergency-btn-sm"
                    onClick={() => handleFlagEmergency(r.id)}
                    disabled={flagging === r.id}
                  >
                    {flagging === r.id ? 'Flagging…' : '🚨 Flag as emergency'}
                  </button>
                )}
              </div>
            </div>
            {r.is_emergency && <div className="portal-emergency-tag">🚨 Emergency</div>}
            {r.description && <p style={{ marginTop: 6 }}>{r.description}</p>}
            {r.ai_classification_status === 'success' && (
              <div className="portal-ai-tag">
                ⚡ {AI_URGENCY_LABELS[r.ai_urgency] || r.ai_urgency} · {AI_TRADE_LABELS[r.ai_trade] || r.ai_trade}
              </div>
            )}
            <p style={{ marginTop: 8, fontSize: 11.5 }}>Submitted {formatDate(r.created_at)}</p>

            <button className="portal-ticket-toggle" onClick={() => toggleThread(r)}>
              {isOpen ? 'Hide conversation ▲' : 'View conversation ▼'}
            </button>

            {isOpen && (
              <div className="portal-ticket-thread">
                {!threadData ? (
                  <p style={{ fontSize: 12.5, color: 'var(--slate)' }}>Loading…</p>
                ) : (
                  <>
                    <div className="portal-ticket-messages" ref={threadBodyRef}>
                      {threadData.comments.length === 0 && (
                        <p style={{ fontSize: 12.5, color: 'var(--slate)', textAlign: 'center' }}>
                          No messages yet — you can add details or a photo description here.
                        </p>
                      )}
                      {threadData.comments.map((c) => (
                        <div
                          key={c.id}
                          className={`portal-bubble ${c.sender === 'tenant' ? 'out' : c.sender === 'ai' ? 'ai' : 'in'}`}
                        >
                          {c.sender === 'ai' && <div className="portal-bubble-sender">Assistant</div>}
                          {c.body}
                          {c.attachment_url && (
                            <AttachmentPreview
                              url={c.attachment_url}
                              resourceType={c.attachment_cloudinary_resource_type}
                              fileName={c.attachment_file_name}
                            />
                          )}
                          <div className="portal-bubble-time">{formatTime(c.created_at)}</div>
                        </div>
                      ))}
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
                        placeholder={commentFile ? commentFile.name : 'Type a reply…'}
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
