import type { CapacitorConfig } from '@capacitor/cli'

// This app is a thin native wrapper around the live site, not an
// offline-bundled build. server.url points the WebView straight at
// production so it's always same-origin with the API — this codebase
// already proxies /api/* through xean.ca specifically to avoid cross-origin
// cookie issues (see ebba1a6), and bundling the static dist/ locally would
// reintroduce exactly that problem (session cookies are not
// SameSite=None/Secure, so a capacitor://localhost origin couldn't call the
// API as an authenticated manager). The tradeoff: this app requires network
// connectivity, and there's nothing to code-split for offline use — that's
// the right tradeoff here since the dashboard itself requires a live
// connection to Postgres/Anthropic/Cloudinary anyway.
//
// This one app (bundle ID ca.xean.manager, still the original App Store
// Connect entry, just renamed) serves both managers and maintenance staff —
// /app-picker is a real route on the live site (see App.jsx) that asks
// which portal to open, then sends the WebView on to /dashboard or
// /staff/tickets. Those two, not /login or /staff/login directly: each
// portal's own layout (Layout.jsx, StaffLayout.jsx) already redirects to its
// login page on mount when there's no valid session, so an already-
// authenticated manager or staff member lands straight in their real portal
// without the picker needing any auth-state logic of its own.
const config: CapacitorConfig = {
  appId: 'ca.xean.manager',
  appName: 'Xean',
  webDir: 'dist',
  server: {
    url: 'https://xean.ca/app-picker',
    // The WebView's origin is xean.ca (via server.url above), so this just
    // allows the WebView to navigate to xean.ca links it already lives on —
    // not opening the app up to arbitrary external domains.
    allowNavigation: ['xean.ca', '*.xean.ca'],
  },
  ios: {
    // Matches this app's existing PWA behavior (see the dashboard's own
    // manifest) rather than Capacitor's opaque-status-bar default.
    contentInset: 'automatic',
  },
}

export default config
