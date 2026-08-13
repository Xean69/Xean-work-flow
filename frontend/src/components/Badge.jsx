// Small colored status pill used throughout the app (unit status, tenant
// status, ticket urgency, etc). variant is one of: green, amber, red, slate.
function Badge({ variant = 'slate', children }) {
  return (
    <span className={`badge badge-${variant}`}>
      <span className="badge-dot" />
      {children}
    </span>
  )
}

export default Badge
