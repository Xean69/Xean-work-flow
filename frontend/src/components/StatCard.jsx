// One tile in a stat-row (see styles/ui.css .stat-card). `subVariant` colors
// the sub-line: 'up' for green good-news, 'warn' for amber attention-needed.
function StatCard({ label, value, sub, subVariant }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className={'stat-sub' + (subVariant ? ` ${subVariant}` : '')}>{sub}</div>}
    </div>
  )
}

export default StatCard
