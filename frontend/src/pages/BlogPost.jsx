import { useParams, Link } from 'react-router-dom'
import LandingNav from '../components/LandingNav.jsx'
import LandingFooter from '../components/LandingFooter.jsx'
import { getPostBySlug } from '../utils/blogPosts.js'
import { useDocumentMeta } from '../utils/useDocumentMeta.js'
import '../pages/Landing.css'
import './Blog.css'

function formatDate(value) {
  return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

// Same shell as Blog.jsx/Landing.jsx. Accepts an optional `post` prop so
// scripts/prerender.mjs can render a specific post server-side without
// going through React Router's route matching (see entry-server.jsx) —
// the real client-side route below resolves it from the URL param instead.
function BlogPost({ post: postProp }) {
  const { slug } = useParams()
  const post = postProp || getPostBySlug(slug)

  useDocumentMeta(
    post
      ? { title: `${post.title} | Xean Blog`, description: post.excerpt }
      : { title: 'Post not found | Xean Blog', description: 'This blog post could not be found.' }
  )

  return (
    <div className="landing">
      <div className="lnd-glow lnd-glow-1" />
      <div className="lnd-glow lnd-glow-2" />
      <div className="lnd-glow lnd-glow-3" />
      <div className="lnd-grid-texture" />

      <LandingNav />

      <section className="lnd-section lnd-blog-hero">
        <div className="lnd-wrap lnd-blog-post-wrap">
          {post ? (
            <>
              <Link to="/blog" className="lnd-blog-back">
                ← Back to blog
              </Link>
              <div className="lnd-blog-card-date">{formatDate(post.date)}</div>
              <h1 className="lnd-blog-post-title">{post.title}</h1>
              <div className="lnd-blog-post-body" dangerouslySetInnerHTML={{ __html: post.html }} />
            </>
          ) : (
            <>
              <h2>Post not found</h2>
              <p>
                <Link to="/blog">← Back to blog</Link>
              </p>
            </>
          )}
        </div>
      </section>

      <LandingFooter />
    </div>
  )
}

export default BlogPost
