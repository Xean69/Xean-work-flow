import { useEffect, useState } from 'react'
import {
  getStays,
  createStay,
  updateStay,
  deleteStay,
  getScheduledMessages,
  updateScheduledMessage,
  getTenants,
} from '../api/client.js'
import PageHeader from '../components/PageHeader.jsx'
import Modal from '../components/Modal.jsx'
import StayForm from '../components/StayForm.jsx'
import './GuestStays.css'

const TURNOVER_STEPS = ['checkout_done', 'inspection_done', 'cleaning_done', 'checkin_ready']
const STEP_LABELS = ['Checkout', 'Inspection', 'Cleaning', 'Check-in']

// turnover_status stores only "the furthest milestone reached" — everything
// visual (which dots are done/active, the summary pill) is derived from
// that single value rather than stored separately.
function getTrackSteps(status) {
  const currentIndex = TURNOVER_STEPS.indexOf(status)
  return STEP_LABELS.map((label, i) => ({
    label,
    state: i <= currentIndex ? 'done' : i === currentIndex + 1 ? 'active' : '',
  }))
}

function getStatusPill(status) {
  switch (status) {
    case 'checkout_done':
      return { pill: 'amber', label: 'INSPECTION DUE' }
    case 'inspection_done':
      return { pill: 'amber', label: 'CLEANING DUE' }
    case 'cleaning_done':
      return { pill: 'green', label: 'CHECK-IN READY' }
    case 'checkin_ready':
      return { pill: 'green', label: 'COMPLETE' }
    default:
      return { pill: 'slate', label: status }
  }
}

const PLATFORM_META = {
  airbnb: { label: 'Airbnb', dot: '#FF5A5F', pillStyle: { background: '#FFE4E5', color: '#FF5A5F' } },
  vrbo: { label: 'Vrbo', dot: '#00447C', pillStyle: { background: '#E5EDF5', color: '#00447C' } },
  booking: { label: 'Booking.com', dot: '#003580', pillStyle: { background: '#E5EDF5', color: '#003580' } },
  direct: { label: 'Direct booking', dot: 'var(--brass)', pillStyle: { background: 'var(--brass-light)', color: 'var(--brass-deep)' } },
}

const MESSAGE_META = {
  checkin_instructions: { icon: '🕐', title: 'Check-in instructions', sub: 'Door code, WiFi, parking' },
  welcome: { icon: '📋', title: 'Welcome message', sub: 'House rules + local tips' },
  checkout_reminder: { icon: '⏰', title: 'Checkout reminder', sub: 'Keys, trash, checklist' },
  review_request: { icon: '⭐', title: 'Review request', sub: 'Sent after checkout' },
}

function formatTiming(value) {
  return value.replace(/_/g, ' ')
}

function formatDate(value) {
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function GuestStays() {
  const [stays, setStays] = useState([])
  const [messages, setMessages] = useState([])
  const [unitRows, setUnitRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [activePlatform, setActivePlatform] = useState('all')
  // null = closed, {} = new booking, { stay } = editing
  const [formState, setFormState] = useState(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    setLoadError('')
    try {
      const [stayRows, messageRows, units] = await Promise.all([
        getStays(),
        getScheduledMessages(),
        getTenants(),
      ])
      setStays(stayRows)
      setMessages(messageRows)
      setUnitRows(units)
    } catch (err) {
      setLoadError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const unitOptions = unitRows.map((r) => ({
    unit_id: r.unit_id,
    label: `${r.property_name} — ${r.unit_number}`,
  }))

  const platformTabs = [
    { key: 'all', label: 'All platforms', dot: 'var(--ink)', count: stays.length },
    ...Object.entries(PLATFORM_META).map(([key, meta]) => ({
      key,
      label: meta.label,
      dot: meta.dot,
      count: stays.filter((s) => s.platform === key).length,
    })),
  ]

  const visibleStays = activePlatform === 'all' ? stays : stays.filter((s) => s.platform === activePlatform)

  async function handleFormSubmit(values) {
    if (formState?.stay) {
      await updateStay(formState.stay.id, { ...values, turnover_status: formState.stay.turnover_status })
    } else {
      await createStay(values)
    }
    setFormState(null)
    await load()
  }

  async function handleStepChange(stay, newStatus) {
    await updateStay(stay.id, {
      unit_id: stay.unit_id,
      platform: stay.platform,
      guest_name: stay.guest_name,
      checkout_date: stay.checkout_date,
      next_checkin_date: stay.next_checkin_date,
      turnover_status: newStatus,
    })
    await load()
  }

  async function handleDelete(stay) {
    if (!window.confirm(`Delete the booking for ${stay.guest_name}?`)) return
    await deleteStay(stay.id)
    await load()
  }

  async function handleToggleMessage(msg) {
    await updateScheduledMessage(msg.id, {
      stay_id: msg.stay_id,
      message_type: msg.message_type,
      send_timing: msg.send_timing,
      is_active: !msg.is_active,
    })
    await load()
  }

  const initialValues = formState?.stay
    ? {
        unit_id: formState.stay.unit_id,
        platform: formState.stay.platform,
        guest_name: formState.stay.guest_name,
        checkout_date: formState.stay.checkout_date?.slice(0, 10) || '',
        next_checkin_date: formState.stay.next_checkin_date?.slice(0, 10) || '',
      }
    : undefined

  return (
    <div>
      <PageHeader title="Guest Stays" subtitle="Short-term turnovers and scheduled guest messages">
        <button className="btn btn-primary" onClick={() => setFormState({})} disabled={!loading && unitOptions.length === 0}>
          + New booking
        </button>
      </PageHeader>

      <div className="content">
        {loadError && <p className="form-error">{loadError}</p>}

        {!loading && !loadError && unitOptions.length === 0 && (
          <div className="empty-state card">
            <h3>No units yet</h3>
            <p>Add a property and some units first, then come back to log guest stays.</p>
          </div>
        )}

        {unitOptions.length > 0 && (
          <>
            <div className="subtabs">
              {platformTabs.map((p) => (
                <button
                  key={p.key}
                  className={'subtab' + (activePlatform === p.key ? ' active' : '')}
                  onClick={() => setActivePlatform(p.key)}
                >
                  <span className="subtab-dot" style={{ background: p.dot }} />
                  {p.label} <span className="subtab-count">{p.count}</span>
                </button>
              ))}
            </div>

            <div className="dash-grid">
              <div>
                <div className="section-head">
                  <h2>Active turnovers</h2>
                </div>

                {visibleStays.length === 0 && <p className="board-empty">No bookings for this platform</p>}

                {visibleStays.map((s) => {
                  const steps = getTrackSteps(s.turnover_status)
                  const status = getStatusPill(s.turnover_status)
                  const platform = PLATFORM_META[s.platform]
                  const currentIndex = TURNOVER_STEPS.indexOf(s.turnover_status)
                  const nextStatus = TURNOVER_STEPS[currentIndex + 1]
                  const prevStatus = TURNOVER_STEPS[currentIndex - 1]

                  return (
                    <div className="turnover-card" key={s.id}>
                      <div className="turnover-top">
                        <div>
                          <div className="turnover-unit">
                            {s.property_name} — {s.unit_number}
                            <span className="pill" style={platform.pillStyle}>
                              {platform.label.toUpperCase()}
                            </span>
                          </div>
                          <div className="turnover-addr">
                            {s.guest_name} · Checkout {formatDate(s.checkout_date)} · Next check-in{' '}
                            {formatDate(s.next_checkin_date)}
                          </div>
                        </div>
                        <span className={`pill pill-${status.pill}`}>{status.label}</span>
                      </div>

                      <div className="turnover-track">
                        {steps.map((step) => (
                          <div className={`track-step ${step.state}`} key={step.label}>
                            <div className="track-dot" />
                            <div className="track-label">{step.label}</div>
                          </div>
                        ))}
                      </div>

                      <div className="ticket-actions">
                        {prevStatus && (
                          <button className="btn btn-ghost btn-sm" onClick={() => handleStepChange(s, prevStatus)}>
                            ← Back
                          </button>
                        )}
                        {nextStatus && (
                          <button className="btn btn-ghost btn-sm" onClick={() => handleStepChange(s, nextStatus)}>
                            {STEP_LABELS[currentIndex + 1]} done →
                          </button>
                        )}
                      </div>
                      <div className="ticket-actions">
                        <button className="btn btn-ghost btn-sm" onClick={() => setFormState({ stay: s })}>
                          Edit
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(s)}>
                          Delete
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div>
                <div className="section-head">
                  <h2>Scheduled messages</h2>
                </div>
                <div className="card">
                  {messages.map((m) => {
                    const meta = MESSAGE_META[m.message_type]
                    return (
                      <div className="msg-row" key={m.id}>
                        <div className="msg-icon">{meta.icon}</div>
                        <div>
                          <div className="msg-title">{meta.title}</div>
                          <div className="msg-sub">{meta.sub}</div>
                        </div>
                        <div className="msg-timing">
                          Sends
                          <b>{formatTiming(m.send_timing)}</b>
                        </div>
                        <button
                          className={'toggle' + (m.is_active ? '' : ' off')}
                          onClick={() => handleToggleMessage(m)}
                          aria-label={`Turn ${meta.title} ${m.is_active ? 'off' : 'on'}`}
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {formState && (
        <Modal title={formState?.stay ? 'Edit booking' : 'New booking'} onClose={() => setFormState(null)}>
          <StayForm initialValues={initialValues} units={unitOptions} onSubmit={handleFormSubmit} onCancel={() => setFormState(null)} />
        </Modal>
      )}
    </div>
  )
}

export default GuestStays
