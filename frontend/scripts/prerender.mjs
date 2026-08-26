// Runs after `vite build` (see package.json). Uses Vite's own
// ssrLoadModule — its documented recipe for build-time prerendering —
// to server-render the real Blog/BlogPost components (not a hand-copied
// HTML template) to a string, then bakes that plus the correct per-page
// <title>/meta description into a copy of the client build's index.html
// shell. This is prerendering (SSG) for two route shapes, not full SSR:
// it runs once here at build time, produces plain static files, and
// there's no Node server involved when the site is actually served —
// Vercel serves these exact files ahead of the SPA-fallback rewrite in
// vercel.json because an existing static file always wins over a
// rewrite there. A fresh, minimal Vite server (just the React plugin) is
// used here rather than the project's full vite.config.js, specifically
// so vite-plugin-pwa (a client-build-only concern) never has to reason
// about running inside this SSR module graph at all.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const distDir = path.join(root, "dist");

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function main() {
  const template = fs.readFileSync(path.join(distDir, "index.html"), "utf-8");

  const vite = await createServer({
    root,
    appType: "custom",
    server: { middlewareMode: true },
    plugins: [react()],
  });

  const { render, getMeta, getAllSlugs } = await vite.ssrLoadModule("/src/entry-server.jsx");

  const routes = ["/blog", ...getAllSlugs().map((slug) => `/blog/${slug}`)];

  for (const url of routes) {
    const appHtml = render(url);
    const meta = getMeta(url);

    const page = template
      .replace(
        "<title>Xean</title>",
        `<title>${escapeHtml(meta.title)}</title>\n    <meta name="description" content="${escapeHtml(meta.description)}" />`
      )
      .replace('<div id="root"></div>', `<div id="root">${appHtml}</div>`);

    const outDir = path.join(distDir, url.replace(/^\//, ""));
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "index.html"), page);
    console.log(`Prerendered ${url} -> dist${url}/index.html`);
  }

  await vite.close();
}

main().catch((err) => {
  console.error("Prerender failed:", err);
  process.exit(1);
});
