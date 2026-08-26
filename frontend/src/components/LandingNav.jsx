import { Link } from 'react-router-dom'

// Shared header for every public-site page (homepage, terms, privacy).
// The in-page section links (#features etc.) only make sense on the
// homepage itself, so pages that aren't the homepage omit them rather
// than showing dead links.
function LandingNav({ withSectionLinks = false }) {
  return (
    <div className="lnd-wrap">
      <nav className="lnd-nav">
        <Link to="/" className="lnd-logo">
          <img src="/logo-nav.png" alt="Xean" className="lnd-logo-mark" />
          <div className="lnd-logo-text">
            Xean
          </div>
        </Link>
        {withSectionLinks && (
          <div className="lnd-nav-links">
            <a href="#features">Features</a>
            <a href="#how">How it works</a>
            <a href="#pricing">Pricing</a>
            <a href="#contact">Contact</a>
          </div>
        )}
        <div className="lnd-nav-cta">
          <Link to="/login" className="lnd-btn lnd-btn-ghost">
            Log in
          </Link>
          <Link to="/signup" className="lnd-btn lnd-btn-primary">
            Request access
          </Link>
        </div>
      </nav>
    </div>
  )
}

export default LandingNav
