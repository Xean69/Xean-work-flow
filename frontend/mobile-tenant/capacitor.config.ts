import type { CapacitorConfig } from '@capacitor/cli'

// Separate, standalone Capacitor project from ../.. (the "Xean" manager +
// staff app) — see this package's package.json for why. Same server.url
// reasoning as that app's config: this is a thin wrapper around the live
// tenant portal, not an offline-bundled build, so it stays same-origin with
// the API and never needs the cross-origin cookie handling this codebase
// deliberately avoids elsewhere (see ebba1a6).
//
// /portal/home (not /portal/login) as the entry path: PortalLayout.jsx
// already redirects to /portal/login itself on mount when there's no valid
// session, so this one path handles both a returning authenticated tenant
// (straight into their home screen) and a logged-out one (bounced to
// /portal/login) with no auth-state logic needed here.
const config: CapacitorConfig = {
  appId: 'ca.xean.tenant',
  appName: 'Xean Resident',
  webDir: 'www',
  server: {
    url: 'https://xean.ca/portal/home',
    // The WebView's origin is xean.ca (via server.url above), so this just
    // allows the WebView to navigate to xean.ca links it already lives on —
    // not opening the app up to arbitrary external domains.
    allowNavigation: ['xean.ca', '*.xean.ca'],
  },
  ios: {
    // Matches the tenant portal's existing PWA behavior rather than
    // Capacitor's opaque-status-bar default.
    contentInset: 'automatic',
  },
}

export default config
