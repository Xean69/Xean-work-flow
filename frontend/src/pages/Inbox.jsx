import { useEffect, useState } from 'react'
import {
  getMessageThreads,
  getMessageThread,
  sendManagerMessage,
  getTenants,
  getProperties,
  sendBulkAnnouncement,
} from '../api/client.js'
import PageHeader from '../components/PageHeader.jsx'
import Modal from '../components/Modal.jsx'
import AnnouncementForm from '../components/AnnouncementForm.jsx'
import './Inbox.css'

function initials(name) {
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function formatTime(value) {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function Inbox() {
  const [threads, setThreads] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeId, setActiveId] = useState(null)
  const [activeMessages, setActiveMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)

  // Loaded once, up front, so the announcement modal can open instantly —
  // reuses the exact same tenant list Tenants.jsx already loads client-side
  // (see that page's own note on why no separate backend endpoint is
  // needed), filtered down to rows that actually have a tenant on them.
  const [properties, setProperties] = useState([])
  const [tenants, setTenants] = useState([])
  const [showAnnounce, setShowAnnounce] = useState(false)
  const [announceResult, setAnnounceResult] = useState(null)

  useEffect(() => {
    loadThreads()
    getProperties().then(setProperties)
    getTenants().then((rows) => setTenants(rows.filter((r) => r.tenant_id)))
  }, [])

  async function loadThreads() {
    setLoading(true)
    try {
      const rows = await getMessageThreads()
      setThreads(rows)
      if (rows.length > 0) selectThread(rows[0].tenant_id)
    } finally {
      setLoading(false)
    }
  }

  function closeAnnounceModal() {
    setShowAnnounce(false)
    setAnnounceResult(null)
  }

  async function handleAnnounce(subject, body, tenantIds) {
    const result = await sendBulkAnnouncement(subject, body, tenantIds)
    setAnnounceResult(result)
    await loadThreads()
    if (activeId) await selectThread(activeId)
  }

  async function selectThread(tenantId) {
    setActiveId(tenantId)
    setActiveMessages(await getMessageThread(tenantId))
  }

  async function handleSend(e) {
    e.preventDefault()
    if (!draft.trim() || !activeId) return
    setSending(true)
    try {
      await sendManagerMessage(activeId, draft.trim())
      setDraft('')
      await selectThread(activeId)
      await loadThreads()
    } finally {
      setSending(false)
    }
  }

  const active = threads.find((t) => t.tenant_id === activeId)

  return (
    <div>
      <PageHeader title="Inbox" subtitle="Messages from tenants with a portal login">
        <button className="btn btn-primary" onClick={() => setShowAnnounce(true)} disabled={tenants.length === 0}>
          Send Announcement
        </button>
      </PageHeader>

      <div className="content">
        {threads.length > 0 ? (
          <div className="inbox-shell">
            <div className="thread-list">
              {threads.map((t) => (
                <div
                  key={t.tenant_id}
                  className={'thread' + (t.tenant_id === activeId ? ' active' : '')}
                  onClick={() => selectThread(t.tenant_id)}
                >
                  <div className="thread-avatar">{initials(t.full_name)}</div>
                  <div>
                    <div className="thread-name">{t.full_name}</div>
                    <div className="thread-preview">
                      {t.last_message
                        ? `${t.last_sender === 'manager' ? 'You: ' : ''}${t.last_subject ? `📢 ${t.last_subject} — ` : ''}${t.last_message}`
                        : 'No messages yet'}
                    </div>
                    <div className="thread-chan mono">
                      {t.property_name} · {t.unit_number}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="chat-pane">
              {active && (
                <>
                  <div className="chat-head">
                    <b>{active.full_name}</b>
                    <span>
                      {active.property_name} · Unit {active.unit_number}
                    </span>
                  </div>
                  <div className="chat-body">
                    {activeMessages.length === 0 && (
                      <p style={{ fontSize: 12.5, color: 'var(--slate)', textAlign: 'center' }}>No messages yet</p>
                    )}
                    {activeMessages.map((m) => (
                      <div className={`bubble ${m.sender === 'manager' ? 'out' : 'in'}`} key={m.id}>
                        {m.subject && <div className="bubble-announce-subject">📢 {m.subject}</div>}
                        {m.body}
                        <div style={{ fontSize: 10, opacity: 0.65, marginTop: 4 }}>{formatTime(m.created_at)}</div>
                      </div>
                    ))}
                  </div>
                  <form className="chat-composer" onSubmit={handleSend}>
                    <input
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder="Type a reply…"
                      disabled={sending}
                    />
                    <button type="submit" className="btn btn-primary" disabled={sending || !draft.trim()}>
                      Send
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>
        ) : (
          !loading && (
            <div className="empty-state card">
              <h3>No conversations yet</h3>
              <p>
                Set up a portal login for a tenant on the Tenants &amp; Leases page to start a 1:1 conversation, or
                use Send Announcement above to reach tenants by email even before they've logged in.
              </p>
            </div>
          )
        )}
      </div>

      {showAnnounce && (
        <Modal title={announceResult ? 'Announcement sent' : 'Send Announcement'} onClose={closeAnnounceModal}>
          {announceResult ? (
            <div>
              <p>
                Sent to <strong>{announceResult.sent}</strong> tenant{announceResult.sent === 1 ? '' : 's'}.
              </p>
              {announceResult.skipped.length > 0 && (
                <div className="form-error" style={{ marginTop: 10 }}>
                  <p style={{ marginBottom: 6 }}>
                    Skipped {announceResult.skipped.length} — no email on file:
                  </p>
                  <ul style={{ margin: 0, paddingInlineStart: 18 }}>
                    {announceResult.skipped.map((s) => (
                      <li key={s.tenant_id}>{s.full_name}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="form-actions">
                <button type="button" className="btn btn-primary" onClick={closeAnnounceModal}>
                  Done
                </button>
              </div>
            </div>
          ) : (
            <AnnouncementForm
              properties={properties}
              tenants={tenants}
              onSubmit={handleAnnounce}
              onCancel={closeAnnounceModal}
            />
          )}
        </Modal>
      )}
    </div>
  )
}

export default Inbox
