import { useOutletContext } from 'react-router-dom'

function formatMoney(amount) {
  return `$${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
}

// Read straight from the tenant object PortalLayout already fetched via
// /me — addons come back on that same response, so there's no separate
// call to make here.
function Addons() {
  const { tenant } = useOutletContext()
  const addons = tenant.addons || []
  const addonTotal = Number(tenant.addon_total || 0)

  return (
    <div>
      <p className="portal-greeting" style={{ fontSize: 20 }}>
        Your add-ons
      </p>

      {addons.length === 0 ? (
        <div className="portal-card">
          <p>You don't have any add-ons on your lease right now.</p>
        </div>
      ) : (
        <div className="portal-card">
          {addons.map((addon) => (
            <div className="portal-detail-row" key={addon.id}>
              <span className="portal-detail-label">
                {addon.name} × {addon.quantity}
                <span style={{ color: 'var(--slate)', fontWeight: 400 }}> ({formatMoney(addon.unit_price)} each)</span>
              </span>
              <span className="portal-detail-value">{formatMoney(addon.subtotal)}</span>
            </div>
          ))}
          <div className="portal-detail-row" style={{ borderTop: '1px solid var(--line)', marginTop: 4, paddingTop: 12 }}>
            <span className="portal-detail-label" style={{ fontWeight: 600 }}>
              Add-ons total
            </span>
            <span className="portal-detail-value" style={{ fontWeight: 600 }}>
              {formatMoney(addonTotal)}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

export default Addons
