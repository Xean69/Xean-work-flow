import { useOnlineStatus } from '../utils/useOnlineStatus.js'
import './OfflineBanner.css'

// Not dismissible like TrialBanner — this reflects live connectivity, so it
// should disappear the moment the browser reports 'online' again, not stay
// hidden after a manual close.
function OfflineBanner() {
  const online = useOnlineStatus()
  if (online) return null

  return (
    <div className="offline-banner">
      <span>You're offline — showing the last loaded view. Some data may be out of date.</span>
    </div>
  )
}

export default OfflineBanner
