import { useState } from 'react'
import { subscribeTenantToPush } from './portalApi.js'

// Duplicated per-portal (see useOnlineStatus.js's own note on why) rather
// than shared — the dashboard, tenant portal, and staff portal are each
// intentionally self-contained, calling their own API client. The VAPID
// key fetch is inlined directly (not imported from api/client.js) for the
// same reason — no cross-portal module sharing, even for a one-line GET.
async function fetchVapidPublicKey() {
  const res = await fetch('/api/push/vapid-public-key')
  return res.json()
}
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
}

// Mandatory maintenance pushes fire the moment permission is granted and a
// subscription exists — this hook only handles getting to that point. The
// OTHER-category opt-in/opt-out toggle is a separate, later preference (see
// portal/pages/Language.jsx) that never touches this at all.
export function usePushSubscription() {
  const [permission, setPermission] = useState(
    'Notification' in window ? Notification.permission : 'unsupported'
  )

  async function subscribe() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setPermission('unsupported')
      return false
    }
    const result = await Notification.requestPermission()
    setPermission(result)
    if (result !== 'granted') return false

    try {
      const registration = await navigator.serviceWorker.ready
      let subscription = await registration.pushManager.getSubscription()
      if (!subscription) {
        const { publicKey } = await fetchVapidPublicKey()
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        })
      }
      await subscribeTenantToPush(subscription.toJSON())
      return true
    } catch (err) {
      console.error('Push subscription failed:', err)
      return false
    }
  }

  return { permission, subscribe }
}
