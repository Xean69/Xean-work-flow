import { useEffect } from 'react'

// Covers the real-visitor case: a client-side route change (e.g. clicking
// from the blog list to a post) never reloads the document, so the
// prerendered <title>/meta a crawler sees is irrelevant here — this is
// what keeps the browser tab and meta description correct as someone
// actually navigates the SPA. Never runs during the build-time SSR render
// (scripts/prerender.mjs), since effects don't execute during
// renderToString — that path gets its title/meta baked in directly by the
// prerender script instead (see entry-server.jsx's getMeta).
export function useDocumentMeta({ title, description }) {
  useEffect(() => {
    if (title) document.title = title
    if (description) {
      let tag = document.querySelector('meta[name="description"]')
      if (!tag) {
        tag = document.createElement('meta')
        tag.setAttribute('name', 'description')
        document.head.appendChild(tag)
      }
      tag.setAttribute('content', description)
    }
  }, [title, description])
}
