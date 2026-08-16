import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { getPortalDocuments, getPortalDocumentUrl } from '../portalApi.js'

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

function Lease() {
  const { tenant } = useOutletContext()
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getPortalDocuments()
      .then(setDocuments)
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
    </div>
  )
}

export default Lease
