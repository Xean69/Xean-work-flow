import { useEffect, useRef, useState } from 'react'
import { getMyTickets, getTicketDetail, updateTicketStatus } from '../staffApi.js'
import { linkify } from '../../utils/linkify.jsx'
import PrintableTicket from '../../components/PrintableTicket.jsx'

const STATUS_LABEL = { new: 'New', in_progress: 'In progress', resolved: 'Resolved' }
const STATUS_VARIANT = { new: 'slate', in_progress: 'amber', resolved: 'green' }

function formatDate(value) {
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatTime(value) {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

// resource_type comes straight from Cloudinary — same distinction the
// manager and tenant sides already use to pick a preview.
function AttachmentPreview({ url, resourceType, fileName }) {
  if (resourceType === 'image') {
    return (
      <a href={url} target="_blank" rel="noreferrer">
        <img src={url} alt={fileName || 'Attachment'} className="portal-bubble-attachment-img" />
      </a>
    )
  }
  if (resourceType === 'video') {
    return <video src={url} controls className="portal-bubble-attachment-video" />
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="portal-bubble-attachment-file">
      📄 {fileName || 'Download attachment'}
    </a>
  )
}

function Tickets() {
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState(null)
  const [threadData, setThreadData] = useState(null)
  const [updating, setUpdating] = useState(false)
  // Ticket id currently showing the "describe what you did" note field —
  // the client-side half of the block; the server rejects a bare resolve
  // with no note regardless, this is just so the request never fires at all.
  const [resolvingId, setResolvingId] = useState(null)
  const [completionNote, setCompletionNote] = useState('')
  const threadBodyRef = useRef(null)

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (threadBodyRef.current) threadBodyRef.current.scrollTop = threadBodyRef.current.scrollHeight
  }, [threadData])

  async function load() {
    setLoading(true)
    try {
      setTickets(await getMyTickets())
    } finally {
      setLoading(false)
    }
  }

  async function toggleThread(ticket) {
    if (expandedId === ticket.id) {
      setExpandedId(null)
      setThreadData(null)
      return
    }
    setExpandedId(ticket.id)
    setThreadData(null)
    setThreadData(await getTicketDetail(ticket.id))
  }

  async function handleStatusChange(ticketId, status, note) {
    setUpdating(true)
    try {
      await updateTicketStatus(ticketId, status, note)
      if (expandedId === ticketId) setThreadData(await getTicketDetail(ticketId))
      await load()
    } finally {
      setUpdating(false)
    }
  }

  function openResolve(ticketId) {
    setResolvingId(ticketId)
    setCompletionNote('')
  }

  async function confirmResolve(ticketId) {
    if (!completionNote.trim()) return
    await handleStatusChange(ticketId, 'resolved', completionNote.trim())
    setResolvingId(null)
    setCompletionNote('')
  }

  return (
    <div>
      <p className="portal-greeting" style={{ fontSize: 20 }}>
        My Tickets
      </p>

      {!loading && tickets.length === 0 && (
        <div className="portal-card">
          <p>Nothing assigned to you right now.</p>
        </div>
      )}

      {tickets.map((t) => {
        const isOpen = expandedId === t.id
        return (
          <div className="portal-card" key={t.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <h2>{t.title}</h2>
              <span className={`portal-badge portal-badge-${STATUS_VARIANT[t.status]}`}>
                {STATUS_LABEL[t.status]}
              </span>
            </div>
            <p style={{ marginTop: 6, fontSize: 12.5, color: 'var(--slate)' }}>
              {t.property_name} · {t.unit_number}
              {t.tenant_name ? ` · ${t.tenant_name}` : ''}
            </p>
            {t.description && <p style={{ marginTop: 6 }}>{t.description}</p>}
            <p style={{ marginTop: 8, fontSize: 11.5 }}>Reported {formatDate(t.created_at)}</p>

            {resolvingId === t.id ? (
              <div style={{ marginTop: 10 }}>
                <textarea
                  value={completionNote}
                  onChange={(e) => setCompletionNote(e.target.value)}
                  placeholder="Describe what you did to resolve this…"
                  rows={3}
                  autoFocus
                  style={{ width: '100%' }}
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <button
                    className="portal-btn"
                    style={{ padding: '6px 12px', fontSize: 12.5, background: 'var(--line)', color: 'var(--ink)' }}
                    onClick={() => setResolvingId(null)}
                    disabled={updating}
                  >
                    Cancel
                  </button>
                  <button
                    className="portal-btn portal-btn-primary"
                    style={{ padding: '6px 12px', fontSize: 12.5 }}
                    onClick={() => confirmResolve(t.id)}
                    disabled={updating || !completionNote.trim()}
                  >
                    Confirm complete
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                {t.status !== 'in_progress' && (
                  <button
                    className="portal-btn portal-btn-primary"
                    style={{ padding: '6px 12px', fontSize: 12.5 }}
                    onClick={() => handleStatusChange(t.id, 'in_progress')}
                    disabled={updating}
                  >
                    Mark in progress
                  </button>
                )}
                {t.status !== 'resolved' && (
                  <button
                    className="portal-btn portal-btn-primary"
                    style={{ padding: '6px 12px', fontSize: 12.5 }}
                    onClick={() => openResolve(t.id)}
                    disabled={updating}
                  >
                    Mark complete
                  </button>
                )}
                {t.status === 'resolved' && (
                  <button
                    className="portal-btn"
                    style={{ padding: '6px 12px', fontSize: 12.5, background: 'var(--line)', color: 'var(--ink)' }}
                    onClick={() => handleStatusChange(t.id, 'in_progress')}
                    disabled={updating}
                  >
                    Reopen
                  </button>
                )}
              </div>
            )}

            <button className="portal-ticket-toggle" onClick={() => toggleThread(t)}>
              {isOpen ? 'Hide details ▲' : 'View details ▼'}
            </button>

            {isOpen && (
              <div className="portal-ticket-thread">
                {!threadData ? (
                  <p style={{ fontSize: 12.5, color: 'var(--slate)' }}>Loading…</p>
                ) : (
                  <>
                    <button
                      type="button"
                      className="portal-btn"
                      style={{ padding: '6px 12px', fontSize: 12.5, marginBottom: 10 }}
                      onClick={() => window.print()}
                    >
                      Print
                    </button>
                    <PrintableTicket ticket={threadData} />

                    <div className="portal-ticket-messages" ref={threadBodyRef}>
                      {threadData.comments.length === 0 && (
                        <p style={{ fontSize: 12.5, color: 'var(--slate)', textAlign: 'center' }}>
                          No messages on this ticket yet.
                        </p>
                      )}
                      {threadData.comments.map((c, i) => (
                        <div
                          key={i}
                          className={`portal-bubble ${c.sender === 'manager' ? 'out' : c.sender === 'staff' ? 'out' : c.sender === 'ai' ? 'ai' : 'in'}`}
                        >
                          {c.sender === 'ai' && <div className="portal-bubble-sender">Assistant</div>}
                          {c.sender === 'manager' && <div className="portal-bubble-sender">Manager</div>}
                          {c.sender === 'tenant' && <div className="portal-bubble-sender">Tenant</div>}
                          {/* Every sender='staff' comment is a completion note — the resolve
                              flow in staffApi.js/routes/staff.js is the only way one is ever
                              created, so there's no ambiguity to label around. */}
                          {c.sender === 'staff' && <div className="portal-bubble-sender">✅ Completion note</div>}
                          {linkify(c.body)}
                          {c.attachment_url && (
                            <AttachmentPreview
                              url={c.attachment_url}
                              resourceType={c.attachment_cloudinary_resource_type}
                              fileName={c.attachment_file_name}
                            />
                          )}
                          <div className="portal-bubble-time">{formatTime(c.created_at)}</div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default Tickets
