import PageHeader from '../components/PageHeader.jsx'
import './Documents.css'

const docs = [
  {
    name: 'Lease_94Street_3B.pdf',
    sub: 'Uploaded today, 9:10 AM',
    fields: [
      { label: 'Rent', value: '$1,650' },
      { label: 'Ends', value: '04/2027' },
      { label: 'Deposit', value: '$1,650' },
    ],
    confidence: { level: 'high', label: '98%' },
  },
  {
    name: 'Inspection_94St_1A_moveout.pdf',
    sub: 'Uploaded yesterday, 2:15 PM',
    fields: [
      { label: 'Deductions', value: '3' },
      { label: 'Total', value: '$210' },
      { label: 'Signed', value: 'Yes' },
    ],
    confidence: { level: 'mid', label: '84%' },
  },
  {
    name: 'VendorInvoice_ABC_Plumbing.pdf',
    sub: 'Uploaded Aug 9, 11:02 AM',
    fields: [
      { label: 'Amount', value: '$340' },
      { label: 'Unit', value: '94 St 1A' },
      { label: 'Due', value: 'Aug 24' },
    ],
    confidence: { level: 'high', label: '96%' },
  },
]

function Documents() {
  return (
    <div>
      <PageHeader title="Documents" subtitle="Upload a lease, invoice, or inspection report — Xean reads it for you">
        <button className="btn btn-primary">Upload document</button>
      </PageHeader>

      <div className="content">
        <div className="dropzone">
          <div className="dropzone-icon">↑</div>
          <h3>Drag a file here, or click to upload</h3>
          <p>PDF, JPG, or PNG — leases, invoices, applications, inspection reports</p>
          <button className="btn btn-ghost">Browse files</button>
        </div>

        <div className="section-head">
          <h2>Recently processed</h2>
          <span className="section-head-link">View all</span>
        </div>
        <div className="card">
          {docs.map((d) => (
            <div className="doc-row" key={d.name}>
              <div className="doc-icon">📄</div>
              <div>
                <div className="doc-name">{d.name}</div>
                <div className="doc-sub">{d.sub}</div>
              </div>
              <div className="extract-fields">
                {d.fields.map((f) => (
                  <div className="extract-field" key={f.label}>
                    {f.label}
                    <b>{f.value}</b>
                  </div>
                ))}
              </div>
              <div className={`confidence ${d.confidence.level}`}>{d.confidence.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default Documents
