import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import Blog from './pages/Blog.jsx'
import BlogPost from './pages/BlogPost.jsx'
import { getAllPosts, getPostBySlug } from './utils/blogPosts.js'

// Loaded by scripts/prerender.mjs via Vite's own ssrLoadModule at build
// time — this never ships to the browser. StaticRouter only needs to
// supply router context for the <Link>s inside LandingNav/LandingFooter/
// Blog/BlogPost; none of these pages do their own <Route> matching, so
// there's no need for a <Routes> tree here, just the location.
export function getAllSlugs() {
  return getAllPosts().map((p) => p.slug)
}

export function getMeta(url) {
  const match = url.match(/^\/blog\/(.+)$/)
  if (match) {
    const post = getPostBySlug(match[1])
    return post
      ? { title: `${post.title} | Xean Blog`, description: post.excerpt }
      : { title: 'Post not found | Xean Blog', description: 'This blog post could not be found.' }
  }
  return {
    title: 'Blog | Xean',
    description: 'Product updates, industry notes, and how independent operators run their portfolios with Xean.',
  }
}

export function render(url) {
  const match = url.match(/^\/blog\/(.+)$/)
  const page = match ? <BlogPost post={getPostBySlug(match[1])} /> : <Blog />
  return renderToString(<StaticRouter location={url}>{page}</StaticRouter>)
}
