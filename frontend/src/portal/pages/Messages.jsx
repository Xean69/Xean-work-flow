import { useEffect, useRef, useState } from 'react'
import { getPortalMessages, sendPortalMessage } from '../portalApi.js'

function formatTime(value) {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function Messages() {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const bodyRef = useRef(null)

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight
  }, [messages])

  async function load() {
    setLoading(true)
    try {
      setMessages(await getPortalMessages())
    } finally {
      setLoading(false)
    }
  }

  async function handleSend(e) {
    e.preventDefault()
    if (!draft.trim()) return
    setSending(true)
    try {
      await sendPortalMessage(draft.trim())
      setDraft('')
      await load()
    } finally {
      setSending(false)
    }
  }

  return (
    <div>
      <p className="portal-greeting" style={{ fontSize: 20 }}>
        Messages
      </p>

      <div className="portal-chat">
        <div className="portal-chat-body" ref={bodyRef}>
          {!loading && messages.length === 0 && (
            <p style={{ color: 'var(--slate)', fontSize: 13, textAlign: 'center', margin: 'auto' }}>
              Send a message to your property manager below.
            </p>
          )}
          {messages.map((m) => (
            <div key={m.id} className={`portal-bubble ${m.sender === 'tenant' ? 'out' : 'in'}`}>
              {m.subject && <div className="portal-bubble-announce-subject">📢 {m.subject}</div>}
              {m.body}
              <div className="portal-bubble-time">{formatTime(m.created_at)}</div>
            </div>
          ))}
        </div>

        <form className="portal-chat-composer" onSubmit={handleSend}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type a message…"
            disabled={sending}
          />
          <button type="submit" className="portal-btn portal-btn-primary" disabled={sending || !draft.trim()}>
            Send
          </button>
        </form>
      </div>
    </div>
  )
}

export default Messages
