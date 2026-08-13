import { useState } from 'react'
import PageHeader from '../components/PageHeader.jsx'
import './GuestStays.css'

const platforms = [
  { key: 'all', label: 'All platforms', dot: 'var(--ink)', count: 3 },
  { key: 'airbnb', label: 'Airbnb', dot: '#FF5A5F', count: 2 },
  { key: 'vrbo', label: 'Vrbo', dot: '#00447C', count: 1 },
  { key: 'booking', label: 'Booking.com', dot: '#003580', count: 0 },
  { key: 'direct', label: 'Direct booking', dot: 'var(--brass)', count: 0 },
]

const turnovers = [
  {
    unit: 'Cy Becker Summit — Unit 1',
    platform: 'AIRBNB',
    platformStyle: { background: '#FFE4E5', color: '#FF5A5F' },
    dates: 'Checkout Aug 12 · Next check-in Aug 14',
    status: { pill: 'amber', label: 'CLEANING DUE' },
    steps: [
      { label: 'Checkout', state: 'done' },
      { label: 'Inspection', state: 'done' },
      { label: 'Cleaning', state: 'active' },
      { label: 'Check-in', state: '' },
    ],
  },
  {
    unit: '177 Avenue — Unit 1A',
    platform: 'VRBO',
    platformStyle: { background: '#E5EDF5', color: '#00447C' },
    dates: 'Checkout Aug 15 · Next check-in Aug 16',
    status: { pill: 'green', label: 'ON TRACK' },
    steps: [
      { label: 'Checkout', state: '' },
      { label: 'Inspection', state: '' },
      { label: 'Cleaning', state: '' },
      { label: 'Check-in', state: '' },
    ],
  },
  {
    unit: '94 Street — Unit 3B',
    platform: 'AIRBNB',
    platformStyle: { background: '#FFE4E5', color: '#FF5A5F' },
    dates: 'Checkout Aug 10 · Guest checked in Aug 11',
    status: { pill: 'green', label: 'COMPLETE' },
    steps: [
      { label: 'Checkout', state: 'done' },
      { label: 'Inspection', state: 'done' },
      { label: 'Cleaning', state: 'done' },
      { label: 'Check-in', state: 'done' },
    ],
  },
]

const scheduledMessages = [
  { icon: '🕐', title: 'Check-in instructions', sub: 'Door code, WiFi, parking', timing: '24h before', on: true },
  { icon: '📋', title: 'Welcome message', sub: 'House rules + local tips', timing: 'on arrival', on: true },
  { icon: '⏰', title: 'Checkout reminder', sub: 'Keys, trash, checklist', timing: '8am, checkout day', on: true },
  { icon: '⭐', title: 'Review request', sub: 'Sent after checkout', timing: '2h after checkout', on: false },
]

function TrackStep({ step }) {
  return (
    <div className={`track-step ${step.state}`}>
      <div className="track-dot" />
      <div className="track-label">{step.label}</div>
    </div>
  )
}

function GuestStays() {
  const [activePlatform, setActivePlatform] = useState('all')

  return (
    <div>
      <PageHeader title="Guest Stays" subtitle="Short-term turnovers and scheduled guest messages">
        <button className="btn btn-primary">+ New booking</button>
      </PageHeader>

      <div className="content">
        <div className="subtabs">
          {platforms.map((p) => (
            <button
              key={p.key}
              className={'subtab' + (activePlatform === p.key ? ' active' : '')}
              onClick={() => setActivePlatform(p.key)}
            >
              <span className="subtab-dot" style={{ background: p.dot }} />
              {p.label} <span className="subtab-count">{p.count}</span>
            </button>
          ))}
          <button className="subtab" style={{ marginLeft: 'auto', color: 'var(--brass-deep)' }}>
            + Connect a platform
          </button>
        </div>

        <div className="dash-grid">
          <div>
            <div className="section-head">
              <h2>Active turnovers</h2>
              <span className="section-head-link">View calendar</span>
            </div>

            {turnovers.map((t) => (
              <div className="turnover-card" key={t.unit}>
                <div className="turnover-top">
                  <div>
                    <div className="turnover-unit">
                      {t.unit} <span className="pill" style={t.platformStyle}>{t.platform}</span>
                    </div>
                    <div className="turnover-addr">{t.dates}</div>
                  </div>
                  <span className={`pill pill-${t.status.pill}`}>{t.status.label}</span>
                </div>
                <div className="turnover-track">
                  {t.steps.map((s) => (
                    <TrackStep step={s} key={s.label} />
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div>
            <div className="section-head">
              <h2>Scheduled messages</h2>
              <span className="section-head-link">+ Add</span>
            </div>
            <div className="card">
              {scheduledMessages.map((m) => (
                <div className="msg-row" key={m.title}>
                  <div className="msg-icon">{m.icon}</div>
                  <div>
                    <div className="msg-title">{m.title}</div>
                    <div className="msg-sub">{m.sub}</div>
                  </div>
                  <div className="msg-timing">
                    Sends
                    <b>{m.timing}</b>
                  </div>
                  <div className={'toggle' + (m.on ? '' : ' off')} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default GuestStays
