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

// Fixed bottom-right on the landing page only — Landing.jsx mounts this
// directly rather than it living in a shared layout, so it never appears
// on any other page (login, dashboard, tenant portal, blog).
function ChatWidget() {
  const [open, setOpen] = useState(false)

  return (
    <div className="lnd-chat-fab-wrap">
      {open && (
        <div className="lnd-chat-fab-panel">
          <div className="lnd-chat-fab-header">
            <span>Chat with us</span>
            <button
              type="button"
              className="lnd-chat-fab-close"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
            >
              ✕
            </button>
          </div>
          <ChatForm />
        </div>
      )}
      <button
        type="button"
        className="lnd-chat-fab"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close chat' : 'Open chat'}
      >
        {open ? '✕' : '💬'}
      </button>
    </div>
  )
}

export default ChatWidget
