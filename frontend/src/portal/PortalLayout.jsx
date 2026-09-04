import { useEffect, useState } from 'react'
import { Outlet, useNavigate, useLocation, NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getMe, logout } from './portalApi.js'
import PortalOfflineBanner from './PortalOfflineBanner.jsx'
import { applyLanguage, TENANT_LANG_KEY } from '../i18n/sync.js'
import { usePushSubscription } from './usePushSubscription.js'
import './portal.css'

const NAV_ITEMS = [
  { to: '/portal/home', labelKey: 'nav.home', icon: '🏠' },
  { to: '/portal/repairs', labelKey: 'nav.repairs', icon: '🔧' },
  { to: '/portal/messages', labelKey: 'nav.messages', icon: '💬' },
  { to: '/portal/addons', labelKey: 'nav.addons', icon: '💳' },
  { to: '/portal/lease', labelKey: 'nav.lease', icon: '📄' },
  { to: '/portal/language', labelKey: 'nav.language', icon: '🌐' },
]

// Guards every /portal/* route except login: fetches the logged-in tenant
// once here (not on the /login page) and hands it down to every page via
// the router's outlet context, so no page needs its own /me call.
function PortalLayout() {
  const [tenant, setTenant] = useState(null)
  const [loading, setLoading] = useState(true)
  const [pushDismissed, setPushDismissed] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useTranslation('portal-common')
  const { permission: pushPermission, subscribe: subscribeToPush } = usePushSubscription()

  useEffect(() => {
    getMe()
      .then(setTenant)
      .catch(() => navigate('/portal/login', { replace: true }))
      .finally(() => setLoading(false))
  }, [])

  // Same reconcile-then-track pattern as the manager side's Layout.jsx.
  useEffect(() => {
    if (tenant) applyLanguage(tenant.language, TENANT_LANG_KEY)
  }, [tenant?.language])

  // React Router doesn't reset scroll position on navigation the way a
  // full page load does. Without this, switching from a tall page (e.g.
  // Repairs with several cards) to a short one can leave the view scrolled
  // partway down, letting the fixed bottom tab bar visually sit on top of
  // page content instead of below it.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  async function handleLogout() {
    await logout()
    navigate('/portal/login', { replace: true })
  }

  if (loading) return <div className="portal-loading">Loading…</div>
  if (!tenant) return null

  return (
    <div className="portal-shell">
      <PortalOfflineBanner />
      {pushPermission === 'default' && !pushDismissed && (
        <div className="portal-push-banner">
          <span>{t('pushBanner.text')}</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button type="button" className="portal-btn portal-btn-primary" style={{ padding: '6px 12px', fontSize: 12.5 }} onClick={subscribeToPush}>
              {t('pushBanner.enable')}
            </button>
            <button type="button" className="portal-push-banner-dismiss" onClick={() => setPushDismissed(true)} aria-label="Dismiss">
              ×
            </button>
          </div>
        </div>
      )}
      <header className="portal-header">
        <span className="portal-brand-group">
          <img src="/logo-nav.png" alt="" className="portal-brand-mark" />
          <span className="portal-brand">Xean</span>
        </span>

        {/* Same links as the bottom tab bar — CSS decides which one shows
            based on viewport width, so there's only one nav to keep in sync. */}
        <nav className="portal-topnav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => 'portal-topnav-link' + (isActive ? ' active' : '')}
            >
              {t(item.labelKey)}
            </NavLink>
          ))}
        </nav>

        <button className="portal-logout" onClick={handleLogout}>
          {t('logout')}
        </button>
      </header>

      <main className="portal-main">
        <Outlet context={{ tenant, refreshTenant: () => getMe().then(setTenant) }} />
      </main>

      <nav className="portal-tabbar">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.to} to={item.to} className={({ isActive }) => 'portal-tab' + (isActive ? ' active' : '')}>
            <span className="portal-tab-icon">{item.icon}</span>
            {t(item.labelKey)}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

export default PortalLayout
