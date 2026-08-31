import { useEffect, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  getPortalDocuments,
  getPortalDocumentUrl,
  getPortalInspection,
  signPortalInspection,
  getPortalLeases,
  signPortalLease,
} from '../portalApi.js'
import SignaturePad from '../../components/SignaturePad.jsx'

function formatMoney(amount) {
  return `$${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
}

function formatDate(value) {
  return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

const DOC_TYPE_LABELS = {
  lease: 'Lease',
  invoice: 'Invoice',
  inspection: 'Inspection',
  application: 'Application',
  other: 'Document',
}

const CONDITION_LABEL = { good: 'Good', fair: 'Fair', poor: 'Poor', damaged: 'Damaged' }

function formatDateTime(value) {
  return new Date(value).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function MoveInInspection({ inspection, onSigned }) {
  const [signedName, setSignedName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  if (!inspection) return null

  async function handleSign(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      onSigned(await signPortalInspection(signedName))
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  return (
    <div className="portal-card" style={{ marginTop: 16 }}>
      <h2>Move-in inspection</h2>

      {inspection.rooms.map((room) => (
        <div key={room.id} style={{ marginTop: 14 }}>
          <strong style={{ fontSize: 13.5 }}>{room.name}</strong>
          {room.items.map((item) => (
            <div key={item.id} style={{ padding: '8px 0', borderTop: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span>{item.label}</span>
                <span style={{ color: 'var(--slate)' }}>
                  {item.condition ? CONDITION_LABEL[item.condition] : 'Not rated'}
                </span>
              </div>
              {item.notes && (
                <p style={{ fontSize: 12, color: 'var(--slate)', margin: '4px 0 0' }}>{item.notes}</p>
              )}
              {item.photos.length > 0 && (
                <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                  {item.photos.map((p) => (
                    <a key={p.id} href={p.photo_url} target="_blank" rel="noreferrer">
                      <img
                        src={p.photo_url}
                        alt={item.label}
                        style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--line)' }}
                      />
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}

      {inspection.signed_at ? (
        <p style={{ marginTop: 16, fontSize: 13, fontWeight: 600, color: 'var(--green)' }}>
          Signed by {inspection.signed_name} on {formatDateTime(inspection.signed_at)}
        </p>
      ) : (
        <form onSubmit={handleSign} style={{ marginTop: 16 }}>
          <p style={{ marginBottom: 10 }}>
            Review the report above, then type your full name to acknowledge and sign.
          </p>
          {error && <p className="portal-error">{error}</p>}
          <div className="portal-field">
            <label htmlFor="signed_name">Full name</label>
            <input
              id="signed_name"
              value={signedName}
              onChange={(e) => setSignedName(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="portal-btn portal-btn-primary" disabled={submitting}>
            {submitting ? 'Signing…' : 'Acknowledge & Sign'}
          </button>
        </form>
      )}
    </div>
  )
}

// One card per lease a manager has sent — a draft never reaches here at
// all (see GET /api/portal/leases). Reuses the exact typed-name + server-
// timestamp pattern MoveInInspection above uses, plus an optional drawn
// signature (net-new — see components/SignaturePad.jsx) as an addition,
// not a replacement: signed_name is always required even when a drawn
// image is also submitted.
function LeaseESign({ lease, onSigned }) {
  const [signMethod, setSignMethod] = useState('type')
  const [signedName, setSignedName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const padRef = useRef(null)

  async function handleSign(e) {
    e.preventDefault()
    setError('')
    if (!signedName.trim()) {
      setError('Type your full name to sign.')
      return
    }
    if (signMethod === 'draw' && padRef.current?.isEmpty()) {
      setError('Draw your signature, or switch to "Type name" instead.')
      return
    }
    setSubmitting(true)
    try {
      const blob = signMethod === 'draw' ? await padRef.current.getBlob() : null
      onSigned(await signPortalLease(lease.id, signedName, blob))
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  return (
    <div className="portal-card" style={{ marginTop: 16 }}>
      <h2>Lease agreement</h2>

      {lease.ai_generated && (
        <div className="portal-lease-disclaimer">
          {lease.generation_mode === 'generate'
            ? 'This lease was drafted with AI assistance. If anything looks incorrect or unclear, contact your property manager before signing.'
            : 'This lease was filled in from your manager\'s template with AI assistance.'}
        </div>
      )}

      {lease.content.sections.map((s, i) => (
        <div key={i} className="portal-lease-section">
          <strong>{s.heading}</strong>
          <p>{s.body}</p>
        </div>
      ))}

      {lease.signed_at ? (
        <div style={{ marginTop: 14 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--green)' }}>
            Signed by {lease.signed_name} on {formatDateTime(lease.signed_at)}
          </p>
          {lease.signature_image_url && (
            <img src={lease.signature_image_url} alt="Your signature" className="portal-signature-image" />
          )}
          {lease.document_id && (
            <a href={getPortalDocumentUrl(lease.document_id)} target="_blank" rel="noreferrer" className="portal-btn" style={{ marginTop: 10, display: 'inline-block' }}>
              View document
            </a>
          )}
        </div>
      ) : (
        <form onSubmit={handleSign} style={{ marginTop: 16 }}>
          <p style={{ marginBottom: 10 }}>Review the lease above, then sign to accept it.</p>
          {error && <p className="portal-error">{error}</p>}

          <div className="portal-field">
            <label htmlFor={`signed_name_${lease.id}`}>Full name</label>
            <input
              id={`signed_name_${lease.id}`}
              value={signedName}
              onChange={(e) => setSignedName(e.target.value)}
              required
            />
          </div>

          <div className="portal-sign-tabs">
            <button
              type="button"
              className={'portal-sign-tab' + (signMethod === 'type' ? ' active' : '')}
              onClick={() => setSignMethod('type')}
            >
              Type name only
            </button>
            <button
              type="button"
              className={'portal-sign-tab' + (signMethod === 'draw' ? ' active' : '')}
              onClick={() => setSignMethod('draw')}
            >
              Draw signature
            </button>
          </div>

          {signMethod === 'draw' && (
            <div className="portal-field">
              <SignaturePad ref={padRef} />
              <button type="button" className="portal-btn" style={{ marginTop: 6 }} onClick={() => padRef.current?.clear()}>
                Clear
              </button>
            </div>
          )}

          {lease.document_id && (
            <a href={getPortalDocumentUrl(lease.document_id)} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, display: 'inline-block', marginBottom: 10 }}>
              View the full document
            </a>
          )}

          <button type="submit" className="portal-btn portal-btn-primary" disabled={submitting}>
            {submitting ? 'Signing…' : 'Sign lease'}
          </button>
        </form>
      )}
    </div>
  )
}

function Lease() {
  const { tenant } = useOutletContext()
  const [documents, setDocuments] = useState([])
  const [inspection, setInspection] = useState(null)
  const [leases, setLeases] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([getPortalDocuments(), getPortalInspection(), getPortalLeases()])
      .then(([docs, insp, leaseRows]) => {
        setDocuments(docs)
        setInspection(insp)
        setLeases(leaseRows)
      })
      .finally(() => setLoading(false))
  }, [])

  function updateLease(updated) {
    setLeases((prev) => prev.map((l) => (l.id === updated.id ? updated : l)))
  }

  return (
    <div>
      <p className="portal-greeting" style={{ fontSize: 20 }}>
        Your lease
      </p>

      <div className="portal-grid-2">
        <div className="portal-card">
          <div className="portal-detail-row">
            <span className="portal-detail-label">Monthly rent</span>
            <span className="portal-detail-value">{formatMoney(tenant.rent_amount)}</span>
          </div>
          <div className="portal-detail-row">
            <span className="portal-detail-label">Security deposit</span>
            <span className="portal-detail-value">{formatMoney(tenant.deposit_amount)}</span>
          </div>
          <div className="portal-detail-row">
            <span className="portal-detail-label">Lease start</span>
            <span className="portal-detail-value">{formatDate(tenant.lease_start)}</span>
          </div>
          <div className="portal-detail-row">
            <span className="portal-detail-label">Lease end</span>
            <span className="portal-detail-value">{formatDate(tenant.lease_end)}</span>
          </div>
        </div>

        <div className="portal-card">
          <h2 style={{ marginBottom: 12 }}>Documents</h2>
          {!loading && documents.length === 0 && <p>No documents on file yet.</p>}
          {documents.map((d) => (
            <a
              key={d.id}
              href={getPortalDocumentUrl(d.id)}
              target="_blank"
              rel="noreferrer"
              className="portal-doc-row"
            >
              <div className="portal-doc-icon">📄</div>
              <div>
                <div className="portal-doc-name">{d.file_name}</div>
                <div className="portal-doc-sub">
                  {DOC_TYPE_LABELS[d.doc_type]} · {formatDate(d.uploaded_at)}
                </div>
              </div>
            </a>
          ))}
        </div>
      </div>

      {leases.map((l) => (
        <LeaseESign key={l.id} lease={l} onSigned={updateLease} />
      ))}

      <MoveInInspection inspection={inspection} onSigned={setInspection} />
    </div>
  )
}

export default Lease
