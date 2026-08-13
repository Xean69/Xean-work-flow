import { useState } from 'react'
import PageHeader from '../components/PageHeader.jsx'
import './Inbox.css'

const threads = [
  {
    id: 1,
    initials: 'SK',
    name: 'Sarah K.',
    preview: 'Can I pay rent a day late this month?',
    chan: 'SMS · 177 Ave 1A',
    head: 'Sarah K.',
    headSub: '177 Avenue · Unit 1A · via SMS',
    messages: [
      { dir: 'in', text: 'Hey! Quick question — can I pay rent a day late this month? Pay day shifted at work.' },
      { dir: 'out', text: 'No problem at all, thanks for the heads up. One day is totally fine.' },
      { dir: 'in', text: 'Thank you so much, appreciate it 🙏' },
    ],
  },
  {
    id: 2,
    initials: 'MO',
    name: 'Marcus O.',
    preview: 'Still no hot water, any update?',
    chan: 'EMAIL · Cy Becker 2',
    head: 'Marcus O.',
    headSub: 'Cy Becker Road · Unit 2 · via Email',
    messages: [
      { dir: 'in', text: 'Still no hot water, any update on when the plumber is coming?' },
      { dir: 'out', text: "Plumber's on the way, ETA 2pm today. Sorry for the wait." },
    ],
  },
  {
    id: 3,
    initials: 'JT',
    name: 'Jordan T. (guest)',
    preview: "What's the WiFi password?",
    chan: 'AIRBNB · 94 St 3B',
    head: 'Jordan T.',
    headSub: '94 Street · Unit 3B · via Airbnb',
    messages: [
      { dir: 'in', text: "Hi! What's the WiFi password?" },
      { dir: 'out', text: "It's on the welcome card on the counter — network is 94St_Guest." },
    ],
  },
  {
    id: 4,
    initials: 'DO',
    name: 'D. Osei',
    preview: 'Dishwasher guy came, all fixed',
    chan: 'SMS · 94 St 3B',
    head: 'D. Osei',
    headSub: '94 Street · Unit 3B · via SMS',
    messages: [{ dir: 'in', text: 'Dishwasher guy came, all fixed. Thanks!' }],
  },
]

function Inbox() {
  const [activeId, setActiveId] = useState(threads[0].id)
  const active = threads.find((t) => t.id === activeId)

  return (
    <div>
      <PageHeader title="Inbox" subtitle="Texts, email, and Airbnb messages — one thread per unit">
        <button className="btn btn-primary">+ New message</button>
      </PageHeader>

      <div className="content">
        <div className="inbox-shell">
          <div className="thread-list">
            {threads.map((t) => (
              <div
                key={t.id}
                className={'thread' + (t.id === activeId ? ' active' : '')}
                onClick={() => setActiveId(t.id)}
              >
                <div className="thread-avatar">{t.initials}</div>
                <div>
                  <div className="thread-name">{t.name}</div>
                  <div className="thread-preview">{t.preview}</div>
                  <div className="thread-chan mono">{t.chan}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="chat-pane">
            <div className="chat-head">
              <b>{active.head}</b>
              <span>{active.headSub}</span>
            </div>
            <div className="chat-body">
              <div className="bubble-chan mono">TODAY</div>
              {active.messages.map((m, i) => (
                <div className={`bubble ${m.dir}`} key={i}>
                  {m.text}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Inbox
