import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { getPortalDocuments, getPortalDocumentUrl, getPortalInspection, signPortalInspection } from '../portalApi.js'

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

function Lease() {
  const { tenant } = useOutletContext()
  const [documents, setDocuments] = useState([])
  const [inspection, setInspection] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([getPortalDocuments(), getPortalInspection()])
      .then(([docs, insp]) => {
        setDocuments(docs)
        setInspection(insp)
      })
      .finally(() => setLoading(false))
  }, [])

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

      <MoveInInspection inspection={inspection} onSigned={setInspection} />
    </div>
  )
}

export default Lease
