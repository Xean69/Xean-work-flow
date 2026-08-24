// Single source of truth for which roles can reach which dashboard route —
// drives both the sidebar (which links to show) and Layout's route guard
// (redirect away from a route the current role can't use). This is UX
// only: the actual security boundary is the backend's requireRole checks
// (backend/src/utils/auth.js), which enforce the same rules independent
// of anything the frontend does or doesn't hide.
export const ROUTE_ROLES = {
  '/dashboard': ['owner', 'manager'],
  '/properties': ['owner', 'manager'],
  '/import': ['owner', 'manager'],
  '/tenants': ['owner', 'manager'],
  '/stays': ['owner', 'manager'],
  '/maintenance': ['owner', 'manager'],
  '/documents': ['owner', 'manager', 'accountant'],
  '/inbox': ['owner', 'manager'],
  '/expenses': ['owner', 'manager', 'accountant'],
  '/compliance': ['owner', 'manager'],
  '/voice': ['owner', 'manager'],
  '/intercom': ['owner', 'manager'],
  '/licensing': ['owner', 'manager'],
  '/statements': ['owner', 'manager', 'accountant'],
  '/insights': ['owner', 'manager'],
  '/team': ['owner'],
  '/upgrade': ['owner', 'manager', 'accountant'],
  '/language': ['owner', 'manager', 'accountant'],
}

// /properties/123 -> /properties, etc. — nested routes are governed by
// their top-level segment.
function routeBase(pathname) {
  const segment = pathname.split('/').filter(Boolean)[0]
  return segment ? `/${segment}` : '/'
}

export function canAccessPath(role, pathname) {
  const allowed = ROUTE_ROLES[routeBase(pathname)]
  return allowed ? allowed.includes(role) : true
}

export function defaultRouteForRole(role) {
  return ROUTE_ROLES['/dashboard'].includes(role) ? '/dashboard' : '/expenses'
}

// Accountants get read-only access to the 3 pages they can reach at all
// (Expenses, Documents, Owner Statements) — this is what those pages use
// to hide/disable create/edit/delete actions. Backend enforces the same
// thing on the actual write routes regardless of what the UI shows.
export function canWrite(role) {
  return role !== 'accountant'
}

export const ROLE_LABELS = {
  owner: 'Owner',
  manager: 'Manager',
  accountant: 'Accountant',
}
