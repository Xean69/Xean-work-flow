import { useEffect, useRef, useState } from 'react'
import { getPortalMaintenance, createPortalMaintenance, getPortalMaintenanceDetail, addPortalMaintenanceComment } from '../portalApi.js'

const STATUS_META = {
  new: { label: 'Submitted', variant: 'slate' },
  in_progress: { label: 'In progress', variant: 'amber' },
  resolved: { label: 'Resolved', variant: 'green' },
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

function Repairs() {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('medium')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Which ticket's thread is expanded, and its fetched detail (comments).
  const [expandedId, setExpandedId] = useState(null)
  const [threadData, setThreadData] = useState(null)
  const [commentDraft, setCommentDraft] = useState('')
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
      await createPortalMaintenance({ title, description, priority })
      setTitle('')
      setDescription('')
      setPriority('medium')
      setShowForm(false)
      await load()
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
      return
    }
    setExpandedId(request.id)
    setThreadData(null)
    setThreadData(await getPortalMaintenanceDetail(request.id))
    setRequests((rows) => rows.map((r) => (r.id === request.id ? { ...r, unread_by_tenant: false } : r)))
  }

  async function handleSendComment(e) {
    e.preventDefault()
    if (!commentDraft.trim()) return
    setSendingComment(true)
    try {
      await addPortalMaintenanceComment(expandedId, commentDraft.trim())
      setCommentDraft('')
      setThreadData(await getPortalMaintenanceDetail(expandedId))
    } finally {
      setSendingComment(false)
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
              <span className={`portal-badge portal-badge-${status.variant}`}>{status.label}</span>
            </div>
            {r.description && <p style={{ marginTop: 6 }}>{r.description}</p>}
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
                        <div key={c.id} className={`portal-bubble ${c.sender === 'tenant' ? 'out' : 'in'}`}>
                          {c.body}
                          <div className="portal-bubble-time">{formatTime(c.created_at)}</div>
                        </div>
                      ))}
                    </div>

                    <form className="portal-ticket-composer" onSubmit={handleSendComment}>
                      <input
                        value={commentDraft}
                        onChange={(e) => setCommentDraft(e.target.value)}
                        placeholder="Type a reply…"
                        disabled={sendingComment}
                      />
                      <button type="submit" className="portal-btn portal-btn-primary" disabled={sendingComment || !commentDraft.trim()}>
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
