import Badge from './Badge.jsx'

function StatusBadge({ status }) {
  return <Badge variant={status === 'occupied' ? 'green' : 'amber'}>{status}</Badge>
}

export default StatusBadge
