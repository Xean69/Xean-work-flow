import { useOnlineStatus } from './useOnlineStatus.js'

// Reflects live connectivity, not a dismissible nag — disappears the moment
// the browser reports 'online' again.
function PortalOfflineBanner() {
  const online = useOnlineStatus()
  if (online) return null

  return (
    <div className="portal-offline-banner">
      You're offline — showing the last loaded view. Some data may be out of date.
    </div>
  )
}

export default PortalOfflineBanner
