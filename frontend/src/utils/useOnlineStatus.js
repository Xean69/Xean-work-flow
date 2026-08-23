import { useEffect, useState } from 'react'

// Purely a connectivity signal for the banner below — never gates data
// fetching or feature availability. Real offline support here is just the
// cached app shell (see vite.config.js's navigateFallback); every page's
// own request still needs a live connection to load real data. Duplicated
// (not imported) into src/portal/useOnlineStatus.js — the portal is
// intentionally self-contained, no shared modules with the dashboard.
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
