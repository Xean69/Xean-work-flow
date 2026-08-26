import { Link } from 'react-router-dom'
import LandingNav from '../components/LandingNav.jsx'
import LandingFooter from '../components/LandingFooter.jsx'
import { getAllPosts } from '../utils/blogPosts.js'
import { useDocumentMeta } from '../utils/useDocumentMeta.js'
import '../pages/Landing.css'
import './Blog.css'

function formatDate(value) {
  return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

// Same shell as Landing.jsx (glows, grid texture, nav, footer) so the
// blog reads as part of the same site rather than a bolted-on page — see
// Landing.css's own note on why every class here stays under one `.landing`
// wrapper and `lnd-` prefix.
function Blog() {
  const posts = getAllPosts()

  useDocumentMeta({
    title: 'Blog | Xean',
    description: 'Product updates, industry notes, and how independent operators run their portfolios with Xean.',
  })

  return (
    <div className="landing">
      <div className="lnd-glow lnd-glow-1" />
      <div className="lnd-glow lnd-glow-2" />
      <div className="lnd-glow lnd-glow-3" />
      <div className="lnd-grid-texture" />

      <LandingNav />

      <section className="lnd-section lnd-blog-hero">
        <div className="lnd-wrap">
          <div className="lnd-section-tag">Blog</div>
          <div className="lnd-section-head">
            <h2>From the team at Xean</h2>
            <p>Product updates, industry notes, and how independent operators run their portfolios.</p>
          </div>

          {posts.length === 0 ? (
            <p className="lnd-blog-empty">No posts yet — check back soon.</p>
          ) : (
            <div className="lnd-blog-list">
              {posts.map((post) => (
                <Link key={post.slug} to={`/blog/${post.slug}`} className="lnd-blog-card">
                  <div className="lnd-blog-card-date">{formatDate(post.date)}</div>
                  <h3>{post.title}</h3>
                  <p>{post.excerpt}</p>
                  <span className="lnd-blog-card-cta">Read more →</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <LandingFooter />
    </div>
  )
}

export default Blog
