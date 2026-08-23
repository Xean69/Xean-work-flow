import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Service worker only — manifest is disabled here because the manager
    // dashboard and tenant portal are separate install targets with their
    // own start_url/scope (see public/manifest-app.webmanifest and
    // public/manifest-portal.webmanifest, swapped in index.html by route).
    // One service worker still covers both: same origin, same JS/CSS build.
    VitePWA({
      manifest: false,
      strategies: 'generateSW',
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      workbox: {
        // Any navigation not otherwise cached falls back to the app shell
        // instead of a browser offline error — this is the app-shell-only
        // offline behavior, not offline data (see useOnlineStatus.js).
        navigateFallback: '/index.html',
      },
    }),
  ],
  server: {
    host: true,
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
  // Lets `vite preview` (the actual production build — needed to test the
  // service worker at all, since it's a no-op under the dev server) reach
  // the local backend the same way the dev server's proxy above does.
  // Production itself uses vercel.json's rewrites instead.
  preview: {
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
})
