import Badge from './Badge.jsx'
import { UNIT_STATUS_LABELS } from './UnitForm.jsx'

const VARIANT = {
  vacant: 'amber',
  occupied: 'green',
  short_term: 'slate',
  turnover: 'slate',
  rent_ready: 'green',
  notices: 'amber',
}

function StatusBadge({ status }) {
  return <Badge variant={VARIANT[status] || 'slate'}>{UNIT_STATUS_LABELS[status] || status}</Badge>
}

export default StatusBadge
