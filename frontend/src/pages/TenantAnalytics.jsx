import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getTenantAnalytics } from '../api/client.js'
import PageHeader from '../components/PageHeader.jsx'
import StatCard from '../components/StatCard.jsx'
import { downloadAnalyticsPdf, downloadAnalyticsExcel } from '../utils/tenantAnalyticsExport.js'
import './TenantAnalytics.css'

function formatMoney(amount) {
  return `$${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
}

function TenantAnalytics() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [exporting, setExporting] = useState(null) // null | 'pdf' | 'excel'

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    setLoadError('')
    try {
      setData(await getTenantAnalytics())
    } catch (err) {
      setLoadError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleExport(kind) {
    setExporting(kind)
    try {
      if (kind === 'pdf') await downloadAnalyticsPdf(data)
      else await downloadAnalyticsExcel(data)
    } finally {
      setExporting(null)
    }
  }

  return (
    <div>
      <PageHeader title="Tenant Analytics" subtitle="Portfolio vacancy and outstanding balances, at a glance">
        <button className="btn btn-ghost" onClick={() => handleExport('excel')} disabled={!data || !!exporting}>
          {exporting === 'excel' ? 'Preparing…' : 'Download as Excel'}
        </button>
        <button className="btn btn-primary" onClick={() => handleExport('pdf')} disabled={!data || !!exporting}>
          {exporting === 'pdf' ? 'Preparing…' : 'Download as PDF'}
        </button>
      </PageHeader>

      <div className="content">
        <Link to="/tenants" className="back-link">
          ← Tenants &amp; Leases
        </Link>

        {loadError && <p className="form-error">{loadError}</p>}

        {!loading && data && (
          <>
            <div className="stat-row">
              <StatCard label="Vacant units" value={data.vacant_units} />
              <StatCard
                label="Pending balance"
                value={data.pending_count}
                sub={data.pending_count === 1 ? 'tenant owing' : 'tenants owing'}
                subVariant={data.pending_count > 0 ? 'warn' : undefined}
              />
              <StatCard
                label="Current"
                value={data.current_count}
                sub={data.current_count === 1 ? 'tenant paid up' : 'tenants paid up'}
                subVariant="up"
              />
              <StatCard label="Total outstanding" value={formatMoney(data.total_outstanding)} />
            </div>

            <div className="section-head">
              <h2>Tenants with a pending balance</h2>
            </div>

            {data.tenants.length === 0 ? (
              <div className="empty-state card">
                <h3>Nothing outstanding</h3>
                <p>Every tenant is paid up right now.</p>
              </div>
            ) : (
              <div className="card table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Tenant</th>
                      <th>Phone</th>
                      <th>Property / Unit</th>
                      <th>Balance owed</th>
                      <th>Days owing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.tenants.map((t) => (
                      <tr key={t.tenant_id}>
                        <td style={{ fontWeight: 600 }}>
                          <Link to={`/tenants/${t.tenant_id}`} style={{ color: 'inherit', textDecoration: 'underline' }}>
                            {t.full_name}
                          </Link>
                        </td>
                        <td>{t.phone || '—'}</td>
                        <td style={{ color: 'var(--slate)', fontSize: 12 }}>
                          {t.property_name} · {t.unit_number}
                        </td>
                        <td className="mono">{formatMoney(t.balance_due)}</td>
                        <td className="mono">
                          <span className={t.days_owing >= 30 ? 'analytics-days-critical' : t.days_owing > 0 ? 'analytics-days-warn' : ''}>
                            {t.days_owing}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default TenantAnalytics
