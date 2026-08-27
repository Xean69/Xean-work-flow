import { useState } from 'react'
import { submitContactInquiry, submitDemoRequest } from '../api/publicContact.js'

// Loose client-side check only — the backend is the real gate (see
// requireEmailFormat in validate.js). This just avoids a round trip for an
// obviously-wrong address.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Rendered identically in all three forms below, always named "website" —
// a real visitor never sees or fills this (positioned off-screen, not
// display:none, since some bots skip fields hidden that way), so a
// non-empty value on submit means a bot filled in every input it found.
// The backend silently no-ops on a tripped honeypot rather than erroring,
// so this never needs to be checked client-side — it only needs to exist.
// Controlled like every other field: an uncontrolled native input here
// would let a bot (or Playwright) set the DOM value directly without it
// ever reaching the `values` state actually sent to the server.
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

function ContactInquiryForm() {
  const [values, setValues] = useState({ name: '', email: '', phone: '', message: '', website: '' })
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
      await submitContactInquiry(values)
      setDone(true)
    } catch {
      setError('Something went wrong sending your message — please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (done) return <SuccessNote>Thanks — we'll get back to you shortly.</SuccessNote>

  return (
    <form className="lnd-contact-form" onSubmit={handleSubmit}>
      <Honeypot value={values.website} onChange={update('website')} />
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
      <input
        className="lnd-input"
        type="tel"
        placeholder="Phone (optional)"
        value={values.phone}
        onChange={update('phone')}
        disabled={submitting}
      />
      <textarea
        className="lnd-input lnd-textarea"
        placeholder="How can we help?"
        value={values.message}
        onChange={update('message')}
        disabled={submitting}
      />
      {error && <p className="lnd-contact-error">{error}</p>}
      <button type="submit" className="lnd-btn lnd-btn-primary" disabled={submitting}>
        {submitting ? 'Sending…' : 'Send message'}
      </button>
    </form>
  )
}

function DemoForm() {
  const [values, setValues] = useState({ name: '', email: '', phone: '', preferred_time: '', website: '' })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  function update(field) {
    return (e) => setValues((v) => ({ ...v, [field]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!values.name.trim() || !values.preferred_time)
      return setError('Please fill in your name and a preferred time.')
    if (!EMAIL_RE.test(values.email.trim())) return setError('Please enter a valid email address.')
    setError('')
    setSubmitting(true)
    try {
      await submitDemoRequest(values)
      setDone(true)
    } catch {
      setError('Something went wrong sending your request — please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (done) return <SuccessNote>Thanks — we'll confirm a time by email shortly.</SuccessNote>

  return (
    <form className="lnd-contact-form" onSubmit={handleSubmit}>
      <Honeypot value={values.website} onChange={update('website')} />
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
      <input
        className="lnd-input"
        type="tel"
        placeholder="Phone (optional)"
        value={values.phone}
        onChange={update('phone')}
        disabled={submitting}
      />
      <label className="lnd-input-label">
        Preferred date/time
        <input
          className="lnd-input"
          type="datetime-local"
          value={values.preferred_time}
          onChange={update('preferred_time')}
          disabled={submitting}
        />
      </label>
      {error && <p className="lnd-contact-error">{error}</p>}
      <button type="submit" className="lnd-btn lnd-btn-primary" disabled={submitting}>
        {submitting ? 'Sending…' : 'Request a demo'}
      </button>
    </form>
  )
}

// Two of the three ways to reach the same inbox (hrsupport@xean.ca) — see
// backend/src/routes/contact.js. The third, "Chat with us", is now the
// floating bubble widget (see ChatWidget.jsx) instead of an inline card
// here, so it stays reachable from anywhere on the page, not just this
// section.
function ContactSection() {
  return (
    <section className="lnd-section" id="contact">
      <div className="lnd-wrap">
        <div className="lnd-section-tag">Get in touch</div>
        <div className="lnd-section-head">
          <h2>Talk to a real person</h2>
          <p>
            Send a message or book time to see Xean live — we reply by email either way. Or use the chat bubble in
            the corner for a quick question.
          </p>
        </div>

        <div className="lnd-contact-grid">
          <div className="lnd-contact-card">
            <h3>Contact us</h3>
            <p className="lnd-contact-card-desc">The straightforward way — tell us what's on your mind.</p>
            <ContactInquiryForm />
          </div>

          <div className="lnd-contact-card">
            <h3>Book a demo</h3>
            <p className="lnd-contact-card-desc">Pick a time that works and we'll coordinate the rest by email.</p>
            <DemoForm />
          </div>
        </div>
      </div>
    </section>
  )
}

export default ContactSection
