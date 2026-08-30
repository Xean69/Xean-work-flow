import { useEffect, useMemo, useState } from 'react'
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

// Only one maintenance team type exists today, so this is a fixed label
// rather than a per-staff role field — maintenance_staff has no role
// column to pull from.
const STAFF_ROLE_LABEL = 'Maintenance'

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
// Tenant messages never carry an attachment_url (the messages table has no
// attachment columns), so this simply never renders for tenant threads.
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

// Merges the two independent thread sources (tenant threads and the
// staff-manager inbox — see schema.sql's staff_messages note for why
// they're separate tables) into one list for the unified thread list.
// Threads with a message sort by that timestamp, mixed across both types;
// threads with no messages yet sink to the bottom and keep each source's
// own order there (there's no shared timestamp to compare them by).
function buildCombinedThreads(tenantRows, staffRows) {
  const tenantItems = tenantRows.map((t) => ({
    type: 'tenant',
    id: t.tenant_id,
    name: t.full_name,
    meta: `${t.property_name} · ${t.unit_number}`,
    preview: t.last_message
      ? `${t.last_sender === 'manager' ? 'You: ' : ''}${t.last_subject ? `📢 ${t.last_subject} — ` : ''}${t.last_message}`
      : 'No messages yet',
    last_message_at: t.last_message_at,
  }))
  const staffItems = staffRows.map((s) => ({
    type: 'staff',
    id: s.staff_id,
    name: `${s.first_name} ${s.last_name}`,
    roleLabel: STAFF_ROLE_LABEL,
    meta: null,
    preview: s.last_message ? `${s.last_sender === 'manager' ? 'You: ' : ''}${s.last_message}` : 'No messages yet',
    last_message_at: s.last_message_at,
  }))
  return [...tenantItems, ...staffItems].sort((a, b) => {
    if (a.last_message_at && b.last_message_at) return new Date(b.last_message_at) - new Date(a.last_message_at)
    if (a.last_message_at) return -1
    if (b.last_message_at) return 1
    return 0
  })
}

function Inbox() {
  const [threads, setThreads] = useState([])
  const [staffThreads, setStaffThreads] = useState([])
  const [loading, setLoading] = useState(true)

  const [active, setActive] = useState(null) // { type: 'tenant' | 'staff', id }
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

  const combinedThreads = useMemo(() => buildCombinedThreads(threads, staffThreads), [threads, staffThreads])

  useEffect(() => {
    loadAll()
    getProperties().then(setProperties)
    getTenants().then((rows) => setTenants(rows.filter((r) => r.tenant_id)))
  }, [])

  async function loadAll() {
    setLoading(true)
    try {
      const [tenantRows, staffRows] = await Promise.all([getMessageThreads(), getStaffThreads()])
      setThreads(tenantRows)
      setStaffThreads(staffRows)
      const combined = buildCombinedThreads(tenantRows, staffRows)
      if (combined.length > 0) await selectThread(combined[0].type, combined[0].id)
    } finally {
      setLoading(false)
    }
  }

  async function loadThreads() {
    setThreads(await getMessageThreads())
  }

  async function loadStaffThreads() {
    setStaffThreads(await getStaffThreads())
  }

  async function selectThread(type, id) {
    setActive({ type, id })
    setActiveMessages(type === 'tenant' ? await getMessageThread(id) : await getStaffThread(id))
  }

  function closeAnnounceModal() {
    setShowAnnounce(false)
    setAnnounceResult(null)
  }

  async function handleAnnounce(subject, body, tenantIds) {
    const result = await sendBulkAnnouncement(subject, body, tenantIds)
    setAnnounceResult(result)
    await loadThreads()
    if (active?.type === 'tenant') await selectThread('tenant', active.id)
  }

  async function handleSend(e) {
    e.preventDefault()
    if (!draft.trim() || !active) return
    setSending(true)
    try {
      if (active.type === 'tenant') {
        await sendManagerMessage(active.id, draft.trim())
        setDraft('')
        await selectThread('tenant', active.id)
        await loadThreads()
      } else {
        await sendManagerMessageToStaff(active.id, draft.trim())
        setDraft('')
        await selectThread('staff', active.id)
        await loadStaffThreads()
      }
    } finally {
      setSending(false)
    }
  }

  const activeInfo = !active
    ? null
    : active.type === 'tenant'
      ? threads.find((t) => t.tenant_id === active.id)
      : staffThreads.find((s) => s.staff_id === active.id)

  return (
    <div>
      <PageHeader title="Inbox" subtitle="Messages from tenants and your maintenance team">
        <button className="btn btn-primary" onClick={() => setShowAnnounce(true)} disabled={tenants.length === 0}>
          Send Announcement
        </button>
      </PageHeader>

      <div className="content">
        {combinedThreads.length > 0 ? (
          <div className="inbox-shell">
            <div className="thread-list">
              {combinedThreads.map((item) => (
                <div
                  key={`${item.type}-${item.id}`}
                  className={
                    'thread' +
                    (item.type === 'staff' ? ' thread-staff' : '') +
                    (active && active.type === item.type && active.id === item.id ? ' active' : '')
                  }
                  onClick={() => selectThread(item.type, item.id)}
                >
                  <div className="thread-avatar">{initials(item.name)}</div>
                  <div>
                    <div className="thread-name">
                      {item.name}
                      {item.roleLabel && <span className="thread-role"> ({item.roleLabel})</span>}
                    </div>
                    <div className="thread-preview">{item.preview}</div>
                    {item.meta && <div className="thread-chan mono">{item.meta}</div>}
                  </div>
                </div>
              ))}
            </div>
            <div className="chat-pane">
              {active && activeInfo && (
                <>
                  <div className={'chat-head' + (active.type === 'staff' ? ' chat-head-staff' : '')}>
                    <b>
                      {active.type === 'tenant'
                        ? activeInfo.full_name
                        : `${activeInfo.first_name} ${activeInfo.last_name}`}
                      {active.type === 'staff' && <span className="thread-role"> ({STAFF_ROLE_LABEL})</span>}
                    </b>
                    {active.type === 'tenant' && (
                      <span>
                        {activeInfo.property_name} · Unit {activeInfo.unit_number}
                      </span>
                    )}
                  </div>
                  <div className="chat-body">
                    {activeMessages.length === 0 && (
                      <p style={{ fontSize: 12.5, color: 'var(--slate)', textAlign: 'center' }}>No messages yet</p>
                    )}
                    {activeMessages.map((m) => (
                      <div
                        className={`bubble ${m.sender === 'manager' ? 'out' : active.type === 'staff' ? 'staff-in' : 'in'}`}
                        key={m.id}
                      >
                        {m.subject && <div className="bubble-announce-subject">📢 {m.subject}</div>}
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
                Set up a portal login for a tenant on the Tenants page, add a maintenance team member on
                the Team page, or use Send Announcement above to reach tenants by email even before they've logged
                in.
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
