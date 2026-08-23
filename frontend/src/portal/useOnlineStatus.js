import { useEffect, useState } from 'react'

// Duplicated from ../utils/useOnlineStatus.js rather than imported — the
// portal is intentionally self-contained, no shared modules with the
// manager dashboard (see PortalLayout.jsx). Purely a connectivity signal
// for the banner below — never gates data fetching or feature availability.
export function useOnlineStatus() {
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    function goOnline() {
      setOnline(true)
    }
    function goOffline() {
      setOnline(false)
    }
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  return online
}
