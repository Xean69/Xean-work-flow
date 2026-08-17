import { useEffect, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  getDocuments,
  uploadDocument,
  deleteDocument,
  updateDocumentStatus,
  getDocumentUrl,
  getProperties,
  getTenants,
} from '../api/client.js'
import PageHeader from '../components/PageHeader.jsx'
import DocumentForm from '../components/DocumentForm.jsx'
import Badge from '../components/Badge.jsx'
import { canWrite } from '../utils/permissions.js'
import './Documents.css'

const DOC_TYPE_LABELS = {
  lease: 'Lease',
  invoice: 'Invoice',
  inspection: 'Inspection',
  application: 'Application',
  other: 'Other',
}

function formatDate(value) {
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function Documents() {
  const { admin } = useOutletContext()
  const readOnly = !canWrite(admin.role)

  const [documents, setDocuments] = useState([])
  const [properties, setProperties] = useState([])
  const [unitRows, setUnitRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [selectedFile, setSelectedFile] = useState(null)
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    setLoadError('')
    try {
      // Accountants can't reach /api/properties or /api/tenants at all
      // (403) — the property/tenant picker in the upload form is the only
      // thing that needs them, and uploading is hidden for read-only
      // users, so there's nothing to fetch.
      if (readOnly) {
        setDocuments(await getDocuments())
      } else {
        const [docs, props, units] = await Promise.all([getDocuments(), getProperties(), getTenants()])
        setDocuments(docs)
        setProperties(props)
        setUnitRows(units)
      }
    } catch (err) {
      setLoadError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const tenantOptions = unitRows
    .filter((r) => r.tenant_id)
    .map((r) => ({
      value: r.tenant_id,
      label: `${r.full_name} (${r.property_name} · ${r.unit_number})`,
    }))

  function handleDragOver(e) {
    e.preventDefault()
    setDragActive(true)
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragActive(false)
    const file = e.dataTransfer.files?.[0]
    if (file) setSelectedFile(file)
  }

  function handleFileInputChange(e) {
    const file = e.target.files?.[0]
    if (file) setSelectedFile(file)
    e.target.value = ''
  }

  async function handleUpload(formData) {
    await uploadDocument(formData)
    setSelectedFile(null)
    await load()
  }

  async function handleDelete(doc) {
    if (!window.confirm(`Delete "${doc.file_name}"?`)) return
    await deleteDocument(doc.id)
    await load()
  }

  // Marking a document reviewed is allowed for every role that can reach
  // this page at all — including accountants, who are otherwise read-only
  // here (can't upload or delete). Reviewing is closer to bookkeeping
  // triage than to managing the file itself, so it's not gated by
  // canWrite/readOnly the way upload and delete are.
  async function handleToggleReviewed(doc) {
    await updateDocumentStatus(doc.id, doc.status === 'reviewed' ? 'needs_review' : 'reviewed')
    await load()
  }

  return (
    <div>
      <PageHeader title="Documents" subtitle="Upload a lease, invoice, or inspection report to keep on file" />

      <div className="content">
        {!readOnly &&
          (selectedFile ? (
            <div className="card doc-upload-panel">
              <DocumentForm
                file={selectedFile}
                properties={properties}
                tenants={tenantOptions}
                onSubmit={handleUpload}
                onCancel={() => setSelectedFile(null)}
              />
            </div>
          ) : (
            <div
              className={'dropzone' + (dragActive ? ' dropzone-active' : '')}
              onDragOver={handleDragOver}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
            >
              <div className="dropzone-icon">↑</div>
              <h3>Drag a file here, or click to upload</h3>
              <p>PDF, JPG, or PNG — leases, invoices, applications, inspection reports</p>
              <button type="button" className="btn btn-ghost" onClick={() => fileInputRef.current?.click()}>
                Browse files
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={handleFileInputChange}
                style={{ display: 'none' }}
              />
            </div>
          ))}

        <div className="section-head">
          <h2>Uploaded documents</h2>
        </div>

        {loadError && <p className="form-error">{loadError}</p>}

        {!loading && !loadError && documents.length === 0 && (
          <div className="empty-state card">
            <h3>No documents yet</h3>
            <p>{readOnly ? 'Nothing has been uploaded yet.' : 'Upload your first file above to keep it on record.'}</p>
          </div>
        )}

        {documents.length > 0 && (
          <div className="card">
            {documents.map((d) => (
              <div className="doc-row" key={d.id}>
                <div className="doc-icon">📄</div>
                <div>
                  <div className="doc-name-row">
                    <a href={getDocumentUrl(d.id)} target="_blank" rel="noreferrer" className="doc-name">
                      {d.file_name}
                    </a>
                    {d.status === 'needs_review' && <Badge variant="amber">Needs review</Badge>}
                  </div>
                  <div className="doc-sub">
                    {DOC_TYPE_LABELS[d.doc_type]} · {formatDate(d.uploaded_at)}
                    {d.property_name ? ` · ${d.property_name}` : ''}
                    {d.tenant_name ? ` · ${d.tenant_name}` : ''}
                  </div>
                </div>
                <div className="doc-actions">
                  <label className="doc-reviewed-toggle">
                    <input
                      type="checkbox"
                      checked={d.status === 'reviewed'}
                      onChange={() => handleToggleReviewed(d)}
                    />
                    Reviewed
                  </label>
                  {!readOnly && (
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(d)}>
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default Documents
