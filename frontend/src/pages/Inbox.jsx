import { useEffect, useState } from 'react'
import { getMessageThreads, getMessageThread, sendManagerMessage } from '../api/client.js'
import PageHeader from '../components/PageHeader.jsx'
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

  useEffect(() => {
    loadThreads()
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
        {threads.length === 0 && !loading && (
          <span style={{ fontSize: 13, color: 'var(--slate)' }}>No tenants have a portal login yet</span>
        )}
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
                      {t.last_message ? `${t.last_sender === 'manager' ? 'You: ' : ''}${t.last_message}` : 'No messages yet'}
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
              <p>Set up a portal login for a tenant on the Tenants &amp; Leases page to start messaging them.</p>
            </div>
          )
        )}
      </div>
    </div>
  )
}

export default Inbox
