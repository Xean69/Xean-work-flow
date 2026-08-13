// The top bar at the start of every page: title + subtitle on the left,
// action button(s) on the right. Styling lives in styles/ui.css (.page-header)
// since every page uses it.
function PageHeader({ title, subtitle, children }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children && <div className="page-header-actions">{children}</div>}
    </div>
  )
}

export default PageHeader
