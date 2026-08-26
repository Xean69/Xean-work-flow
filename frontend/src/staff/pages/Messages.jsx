import { useEffect, useRef, useState } from 'react'
import { getMyMessages, sendStaffMessage } from '../staffApi.js'
import { linkify } from '../../utils/linkify.jsx'

function formatTime(value) {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

// Same resource_type-driven preview every other chat surface in this app
// uses — staff messages reuse the same Cloudinary upload pipeline.
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

const ATTACHMENT_ACCEPT = '.jpg,.jpeg,.png,.webp,.heic,.pdf,.mp4,.mov,.webm'

function Messages() {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [attachment, setAttachment] = useState(null)
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
      setMessages(await getMyMessages())
    } finally {
      setLoading(false)
    }
  }

  async function handleSend(e) {
    e.preventDefault()
    if (!draft.trim() && !attachment) return
    setSending(true)
    try {
      const formData = new FormData()
      if (draft.trim()) formData.append('body', draft.trim())
      if (attachment) formData.append('attachment', attachment)
      await sendStaffMessage(formData)
      setDraft('')
      setAttachment(null)
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
              Send a message to your property manager below — photos, videos, or a link to a part you need are all
              fine.
            </p>
          )}
          {messages.map((m) => (
            <div key={m.id} className={`portal-bubble ${m.sender === 'staff' ? 'out' : 'in'}`}>
              {linkify(m.body)}
              {m.attachment_url && (
                <AttachmentPreview
                  url={m.attachment_url}
                  resourceType={m.attachment_cloudinary_resource_type}
                  fileName={m.attachment_file_name}
                />
              )}
              <div className="portal-bubble-time">{formatTime(m.created_at)}</div>
            </div>
          ))}
        </div>

        <form className="portal-chat-composer" onSubmit={handleSend}>
          <label className="portal-attach-btn" title="Attach a photo, video, or document">
            📎
            <input
              type="file"
              accept={ATTACHMENT_ACCEPT}
              onChange={(e) => setAttachment(e.target.files?.[0] || null)}
              disabled={sending}
              style={{ display: 'none' }}
            />
          </label>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={attachment ? attachment.name : 'Type a message…'}
            disabled={sending}
          />
          <button type="submit" className="portal-btn portal-btn-primary" disabled={sending || (!draft.trim() && !attachment)}>
            Send
          </button>
        </form>
      </div>
    </div>
  )
}

export default Messages
