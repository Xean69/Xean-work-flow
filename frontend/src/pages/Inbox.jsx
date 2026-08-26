import { useEffect, useState } from 'react'
import {
  getMessageThreads,
  getMessageThread,
  sendManagerMessage,
  getTenants,
  getProperties,
  sendBulkAnnouncement,
  getStaffThreads,
  getStaffThread,
  sendManagerMessageToStaff,
} from '../api/client.js'
import PageHeader from '../components/PageHeader.jsx'
import Modal from '../components/Modal.jsx'
import AnnouncementForm from '../components/AnnouncementForm.jsx'
import { linkify } from '../utils/linkify.jsx'
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

// Same resource_type-driven preview the maintenance ticket chat already
// uses — staff messages reuse the exact same Cloudinary upload pipeline.
function AttachmentPreview({ url, resourceType, fileName }) {
  if (resourceType === 'image') {
    return (
      <a href={url} target="_blank" rel="noreferrer">
        <img src={url} alt={fileName || 'Attachment'} className="bubble-attachment-img" />
      </a>
    )
  }
  if (resourceType === 'video') {
    return <video src={url} controls className="bubble-attachment-video" />
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="bubble-attachment-file">
      📄 {fileName || 'Download attachment'}
    </a>
  )
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

  // A second, independent inbox — the staff-manager thread (see
  // schema.sql's staff_messages note) is a completely separate concept
  // from tenant messaging above, just given the same thread-list/chat-pane
  // treatment on the same page, mirroring how Team.jsx already stacks two
  // separate sections (admin team, maintenance team) on one page.
  const [staffThreads, setStaffThreads] = useState([])
  const [staffLoading, setStaffLoading] = useState(true)
  const [activeStaffId, setActiveStaffId] = useState(null)
  const [activeStaffMessages, setActiveStaffMessages] = useState([])
  const [staffDraft, setStaffDraft] = useState('')
  const [staffSending, setStaffSending] = useState(false)

  useEffect(() => {
    loadThreads()
    loadStaffThreads()
    getProperties().then(setProperties)
    getTenants().then((rows) => setTenants(rows.filter((r) => r.tenant_id)))
  }, [])

  async function loadStaffThreads() {
    setStaffLoading(true)
    try {
      const rows = await getStaffThreads()
      setStaffThreads(rows)
      if (rows.length > 0) selectStaffThread(rows[0].staff_id)
    } finally {
      setStaffLoading(false)
    }
  }

  async function selectStaffThread(staffId) {
    setActiveStaffId(staffId)
    setActiveStaffMessages(await getStaffThread(staffId))
  }

  async function handleSendToStaff(e) {
    e.preventDefault()
    if (!staffDraft.trim() || !activeStaffId) return
    setStaffSending(true)
    try {
      await sendManagerMessageToStaff(activeStaffId, staffDraft.trim())
      setStaffDraft('')
      await selectStaffThread(activeStaffId)
      await loadStaffThreads()
    } finally {
      setStaffSending(false)
    }
  }

  const activeStaff = staffThreads.find((s) => s.staff_id === activeStaffId)

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
                        {linkify(m.body)}
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

      <div className="content" style={{ paddingTop: 0 }}>
        <div className="section-head">
          <h2>Maintenance Team</h2>
        </div>

        {staffThreads.length > 0 ? (
          <div className="inbox-shell">
            <div className="thread-list">
              {staffThreads.map((s) => (
                <div
                  key={s.staff_id}
                  className={'thread' + (s.staff_id === activeStaffId ? ' active' : '')}
                  onClick={() => selectStaffThread(s.staff_id)}
                >
                  <div className="thread-avatar">{initials(`${s.first_name} ${s.last_name}`)}</div>
                  <div>
                    <div className="thread-name">
                      {s.first_name} {s.last_name}
                    </div>
                    <div className="thread-preview">
                      {s.last_message
                        ? `${s.last_sender === 'manager' ? 'You: ' : ''}${s.last_message}`
                        : 'No messages yet'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="chat-pane">
              {activeStaff && (
                <>
                  <div className="chat-head">
                    <b>
                      {activeStaff.first_name} {activeStaff.last_name}
                    </b>
                  </div>
                  <div className="chat-body">
                    {activeStaffMessages.length === 0 && (
                      <p style={{ fontSize: 12.5, color: 'var(--slate)', textAlign: 'center' }}>No messages yet</p>
                    )}
                    {activeStaffMessages.map((m) => (
                      <div className={`bubble ${m.sender === 'manager' ? 'out' : 'in'}`} key={m.id}>
                        {linkify(m.body)}
                        {m.attachment_url && (
                          <AttachmentPreview
                            url={m.attachment_url}
                            resourceType={m.attachment_cloudinary_resource_type}
                            fileName={m.attachment_file_name}
                          />
                        )}
                        <div style={{ fontSize: 10, opacity: 0.65, marginTop: 4 }}>{formatTime(m.created_at)}</div>
                      </div>
                    ))}
                  </div>
                  <form className="chat-composer" onSubmit={handleSendToStaff}>
                    <input
                      value={staffDraft}
                      onChange={(e) => setStaffDraft(e.target.value)}
                      placeholder="Type a reply…"
                      disabled={staffSending}
                    />
                    <button type="submit" className="btn btn-primary" disabled={staffSending || !staffDraft.trim()}>
                      Send
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>
        ) : (
          !staffLoading && (
            <div className="empty-state card">
              <h3>No maintenance team members yet</h3>
              <p>Add one on the Team page to start messaging them.</p>
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
