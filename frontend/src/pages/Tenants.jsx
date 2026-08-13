import PageHeader from '../components/PageHeader.jsx'
import Badge from '../components/Badge.jsx'

// Sample data — Tenants & Leases doesn't have a backend yet. This mirrors
// the shape real tenant/lease records will have once that's built.
const tenants = [
  { name: 'Sarah K.', unit: '177 Avenue · 1A', rent: '$1,450', ends: 'Nov 2, 2026', status: 'amber', label: 'Renewal due' },
  { name: 'Marcus O.', unit: 'Cy Becker Rd · 2', rent: '$1,950', ends: 'Oct 15, 2026', status: 'red', label: 'Urgent renewal' },
  { name: 'D. Osei', unit: '94 Street · 3B', rent: '$1,650', ends: 'Dec 1, 2026', status: 'green', label: 'Active' },
  { name: 'Ade F.', unit: '177 Avenue · 2C', rent: '$1,510', ends: 'Feb 18, 2027', status: 'green', label: 'Active' },
  { name: 'R. Nwosu', unit: '94 Street · 1A', rent: '—', ends: '—', status: 'slate', label: 'Vacant' },
]

function Tenants() {
  return (
    <div>
      <PageHeader title="Tenants & Leases" subtitle="22 active tenants across your portfolio">
        <button className="btn btn-primary">+ Add tenant</button>
      </PageHeader>

      <div className="content">
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Tenant</th>
                <th>Property / Unit</th>
                <th>Rent</th>
                <th>Lease ends</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.name}>
                  <td style={{ fontWeight: 600 }}>{t.name}</td>
                  <td style={{ color: 'var(--slate)', fontSize: 12 }}>{t.unit}</td>
                  <td className="mono">{t.rent}</td>
                  <td className="mono">{t.ends}</td>
                  <td>
                    <Badge variant={t.status}>{t.label}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default Tenants
