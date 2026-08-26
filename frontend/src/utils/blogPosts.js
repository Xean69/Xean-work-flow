import { marked } from 'marked'

// A hand-rolled frontmatter parser instead of gray-matter: gray-matter
// depends on Node's Buffer, which doesn't exist in the browser bundle this
// file also ships in (it's the "Buffer is not defined" error you'd get at
// runtime) — pulling in a polyfill just for that felt like the wrong
// tradeoff when our frontmatter is only ever three flat string fields
// (title, excerpt, date), never nested YAML. Posts are expected to look
// like:
//   ---
//   title: "..."
//   excerpt: "..."
//   date: "2026-01-01"
//   ---
//   body...
function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) return { data: {}, content: raw }
  const [, frontmatter, content] = match
  const data = {}
  for (const line of frontmatter.split(/\r?\n/)) {
    const lineMatch = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/)
    if (!lineMatch) continue
    const [, key, rawValue] = lineMatch
    const trimmed = rawValue.trim()
    data[key] = /^".*"$|^'.*'$/.test(trimmed) ? trimmed.slice(1, -1) : trimmed
  }
  return { data, content }
}

// The page template already renders the frontmatter `title` as the post's
// styled H1 (see BlogPost.jsx) — a leading `# ...` line at the very start
// of the markdown body would otherwise render a second, unstyled H1 with
// the same text directly beneath it. Only strips a heading on the body's
// first line, never a `#` appearing later in the post.
function stripLeadingHeading(content) {
  return content.replace(/^\s*#\s+.+\r?\n+/, '')
}

// One parsing path shared by the browser bundle (client-side nav between
// posts) and the SSR module loaded by scripts/prerender.mjs at build time
// — import.meta.glob is resolved at build time in both contexts, so
// there's no separate "build step" data file to keep in sync with this.
const rawFiles = import.meta.glob('../content/blog/*.md', { query: '?raw', import: 'default', eager: true })

const posts = Object.entries(rawFiles)
  .map(([path, raw]) => {
    const slug = path.split('/').pop().replace(/\.md$/, '')
    const { data, content } = parseFrontmatter(raw)
    return {
      slug,
      title: data.title,
      excerpt: data.excerpt,
      date: data.date,
      html: marked.parse(stripLeadingHeading(content)),
    }
  })
  .sort((a, b) => new Date(b.date) - new Date(a.date))

export function getAllPosts() {
  return posts
}

export function getPostBySlug(slug) {
  return posts.find((p) => p.slug === slug) || null
}
