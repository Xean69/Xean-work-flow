import { useState } from 'react'
import { submitContactChat } from '../api/publicContact.js'

// Same small helpers ContactSection.jsx has its own copies of — this
// codebase deliberately re-implements trivial per-file pieces like this
// rather than sharing them (see AttachmentPreview elsewhere), and these
// three are simple enough it's not worth a shared import for.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function Honeypot({ value, onChange }) {
  return (
    <input
      type="text"
      name="website"
      value={value}
      onChange={onChange}
      tabIndex={-1}
      autoComplete="off"
      aria-hidden="true"
      className="lnd-hp-field"
    />
  )
}

function SuccessNote({ children }) {
  return <p className="lnd-contact-success">✓ {children}</p>
}

// Identical form/validation/endpoint to what used to be the inline
// "Chat with us" card in ContactSection.jsx — only the presentation moved.
function ChatForm() {
  const [values, setValues] = useState({ name: '', email: '', message: '', website: '' })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  function update(field) {
    return (e) => setValues((v) => ({ ...v, [field]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!values.name.trim() || !values.message.trim()) return setError('Please fill in your name and message.')
    if (!EMAIL_RE.test(values.email.trim())) return setError('Please enter a valid email address.')
    setError('')
    setSubmitting(true)
    try {
      await submitContactChat(values)
      setDone(true)
    } catch {
      setError('Something went wrong sending your message — please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="lnd-chat-widget">
      <div className="lnd-chat-bubble lnd-chat-bubble-them">
        Hey! 👋 Leave your details and a quick message — a real person replies by email.
      </div>

      {done ? (
        <div className="lnd-chat-bubble lnd-chat-bubble-me">
          <SuccessNote>Sent — we'll reply to your email soon.</SuccessNote>
        </div>
      ) : (
        <form className="lnd-chat-form" onSubmit={handleSubmit}>
          <Honeypot value={values.website} onChange={update('website')} />
          <div className="lnd-chat-row">
            <input
              className="lnd-input"
              placeholder="Name"
              value={values.name}
              onChange={update('name')}
              disabled={submitting}
            />
            <input
              className="lnd-input"
              type="email"
              placeholder="Email"
              value={values.email}
              onChange={update('email')}
              disabled={submitting}
            />
          </div>
          <textarea
            className="lnd-input lnd-textarea lnd-textarea-sm"
            placeholder="Type a message…"
            value={values.message}
            onChange={update('message')}
            disabled={submitting}
          />
          {error && <p className="lnd-contact-error">{error}</p>}
          <button type="submit" className="lnd-btn lnd-btn-primary" disabled={submitting}>
            {submitting ? 'Sending…' : 'Send →'}
          </button>
        </form>
      )}
    </div>
  )
}

function ChevronDown() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

// Three states: 'preview' (the rich avatar/greeting card, the default),
// 'collapsed' (just the small round avatar bubble, for a visitor who
// wants it out of the way without fully dismissing it — the chevron
// toggles this), and 'chat' (the actual form). Fixed bottom-right on the
// landing page only — Landing.jsx mounts this directly rather than it
// living in a shared layout, so it never appears on any other page
// (login, dashboard, tenant portal, blog).
function ChatWidget() {
  const [mode, setMode] = useState('preview')

  if (mode === 'collapsed') {
    return (
      <div className="lnd-chat-fab-wrap">
        <button
          type="button"
          className="lnd-chat-avatar-fab"
          onClick={() => setMode('preview')}
          aria-label="Open chat preview"
        >
          <img src="/avatar.jpg" alt="" className="lnd-chat-avatar-fab-img" />
          <span className="lnd-chat-status-dot" />
        </button>
      </div>
    )
  }

  if (mode === 'chat') {
    return (
      <div className="lnd-chat-fab-wrap">
        <div className="lnd-chat-fab-panel">
          <div className="lnd-chat-fab-header">
            <span>Chat with us</span>
            <button
              type="button"
              className="lnd-chat-fab-close"
              onClick={() => setMode('collapsed')}
              aria-label="Close chat"
            >
              ✕
            </button>
          </div>
          <ChatForm />
        </div>
      </div>
    )
  }

  return (
    <div className="lnd-chat-fab-wrap">
      <div className="lnd-chat-preview-card">
        <button
          type="button"
          className="lnd-chat-preview-collapse"
          onClick={() => setMode('collapsed')}
          aria-label="Minimize"
        >
          <ChevronDown />
        </button>
        <div className="lnd-chat-preview-avatar-wrap">
          <img src="/avatar.jpg" alt="" className="lnd-chat-preview-avatar" />
          <span className="lnd-chat-status-dot lnd-chat-status-dot-lg" />
        </div>
        <p className="lnd-chat-preview-greeting">Have a question? I'm happy to help!</p>
        <button type="button" className="lnd-btn lnd-btn-primary lnd-chat-preview-btn" onClick={() => setMode('chat')}>
          Chat
        </button>
      </div>
    </div>
  )
}

export default ChatWidget
