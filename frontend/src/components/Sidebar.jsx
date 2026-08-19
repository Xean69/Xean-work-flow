import { NavLink } from 'react-router-dom'
import { ROUTE_ROLES, ROLE_LABELS } from '../utils/permissions.js'
import './Sidebar.css'

const mainNav = [
  {
    to: '/dashboard',
    label: 'Dashboard',
    end: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="7" height="9" rx="1.5" />
        <rect x="14" y="3" width="7" height="5" rx="1.5" />
        <rect x="14" y="12" width="7" height="9" rx="1.5" />
        <rect x="3" y="16" width="7" height="5" rx="1.5" />
      </svg>
    ),
  },
  {
    to: '/properties',
    label: 'Properties',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5 9.5V20a1 1 0 0 0 1 1h3v-6h6v6h3a1 1 0 0 0 1-1V9.5" />
      </svg>
    ),
  },
  {
    to: '/tenants',
    label: 'Tenants & Leases',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="9" cy="8" r="3.2" />
        <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
        <circle cx="17.5" cy="8.5" r="2.3" />
        <path d="M15.5 14.2c2.9.4 4.9 2.4 4.9 5.8" />
      </svg>
    ),
  },
  {
    to: '/stays',
    label: 'Guest Stays',
    badge: 3,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5 9.5V20a1 1 0 0 0 1 1h3v-6h6v6h3a1 1 0 0 0 1-1V9.5" />
        <circle cx="12" cy="14" r="1.3" />
      </svg>
    ),
  },
  {
    to: '/maintenance',
    label: 'Maintenance',
    badge: 5,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14.7 6.3a4 4 0 0 1-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 1 5.4-5.4l-3-3z" />
      </svg>
    ),
  },
  {
    to: '/documents',
    label: 'Documents',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
        <path d="M14 3v5h5" />
      </svg>
    ),
  },
]

const aiToolsNav = [
  {
    to: '/inbox',
    label: 'Inbox',
    badge: 4,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 6l9 7 9-7" />
        <rect x="3" y="4" width="18" height="16" rx="2" />
      </svg>
    ),
  },
  {
    to: '/expenses',
    label: 'Expenses',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="6" width="18" height="13" rx="2" />
        <path d="M3 10h18" />
        <circle cx="8" cy="14.5" r="1.2" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    to: '/compliance',
    label: 'Compliance',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9 12l2 2 4-4" />
        <path d="M12 3l8 3v6c0 4.5-3.4 7.6-8 9-4.6-1.4-8-4.5-8-9V6l8-3z" />
      </svg>
    ),
  },
  {
    to: '/voice',
    label: 'Voice Calls',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="9" y="2" width="6" height="12" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
      </svg>
    ),
  },
  {
    to: '/licensing',
    label: 'STR Licensing',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M8 2v4M16 2v4M3 10h18" />
      </svg>
    ),
  },
  {
    to: '/statements',
    label: 'Owner Statements',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M6 3h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
        <path d="M9 12h6M9 16h6M9 8h3" />
      </svg>
    ),
  },
  {
    to: '/insights',
    label: 'Insights',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        <circle cx="12" cy="12" r="4" />
      </svg>
    ),
  },
]

const teamNav = {
  to: '/team',
  label: 'Team',
  icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
      <path d="M16 4.5a3.2 3.2 0 0 1 0 6.3" />
      <path d="M18.5 14.3c2.4.6 3.9 2.5 3.9 5.7" />
    </svg>
  ),
}

// Every nav item's visibility is driven by the same ROUTE_ROLES map the
// backend's role checks mirror — so a role that can't reach a page never
// even sees a link to it, instead of clicking through to a redirect.
function NavItems({ items, role }) {
  return items
    .filter((item) => ROUTE_ROLES[item.to]?.includes(role))
    .map((item) => (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.end}
        className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}
      >
        {item.icon}
        {item.label}
        {item.badge != null && <span className="nav-badge">{item.badge}</span>}
      </NavLink>
    ))
}

function Sidebar({ admin, onLogout, open }) {
  const role = admin?.role

  return (
    <aside className={'sidebar' + (open ? ' sidebar-open' : '')}>
      <div className="brand">
        <div className="brand-mark">X</div>
        <div className="brand-name">
          Xean
        </div>
      </div>

      <nav>
        <NavItems items={mainNav} role={role} />

        <div className="nav-section-label">AI Tools</div>
        <NavItems items={aiToolsNav} role={role} />

        <div className="nav-section-label">Workspace</div>
        {role === 'owner' && <NavItems items={[teamNav]} role={role} />}
        <div className="nav-item nav-item-inert">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3.2" />
            <path d="M19.4 13.5a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.9 2.9l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V20a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.9-2.9l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H4a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1A2 2 0 1 1 8.2 4.3l.1.1a1.7 1.7 0 0 0 1.9.3H10.3a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.9 2.9l-.1.1a1.7 1.7 0 0 0-.3 1.9V9.5a1.7 1.7 0 0 0 1.6 1H20a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.6 1z" />
          </svg>
          Settings
        </div>
      </nav>

      <div className="sidebar-footer">
        <div className="avatar" style={{ width: 30, height: 30, fontSize: 12.5 }}>
          {admin?.business_name?.[0]?.toUpperCase() ?? 'A'}
        </div>
        <div className="sidebar-account">
          <strong>{admin?.business_name ?? 'Account'}</strong>
          <div className="sidebar-email">{admin?.email ?? ''}</div>
          {role && <span className="sidebar-role-badge">{ROLE_LABELS[role]}</span>}
        </div>
        <button type="button" className="sidebar-logout" onClick={onLogout} title="Log out">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <path d="M16 17l5-5-5-5" />
            <path d="M21 12H9" />
          </svg>
        </button>
      </div>
    </aside>
  )
}

export default Sidebar
