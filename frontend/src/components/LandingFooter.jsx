import { Link } from 'react-router-dom'

// Shared footer for every public-site page.
function LandingFooter() {
  return (
    <footer className="lnd-footer">
      <div className="lnd-wrap">
        <div className="lnd-foot-top">
          <div>
            <div className="lnd-logo">
              <img src="/logo-nav.png" alt="Xean" className="lnd-logo-mark" />
              <div className="lnd-logo-text">
                Xean
              </div>
            </div>
            <p className="lnd-foot-blurb">Property management, rebuilt for the AI era.</p>
          </div>
          <div className="lnd-foot-links">
            <div className="lnd-foot-col">
              <h4>Product</h4>
              <Link to="/#features">Features</Link>
              <Link to="/#pricing">Pricing</Link>
              <Link to="/login">Log in</Link>
              <Link to="/portal/login">Tenant Portal</Link>
            </div>
            <div className="lnd-foot-col">
              <h4>Company</h4>
              <a href="#">About</a>
              <Link to="/#contact">Contact</Link>
            </div>
            <div className="lnd-foot-col">
              <h4>Legal</h4>
              <Link to="/terms">Terms of Service</Link>
              <Link to="/privacy">Privacy Policy</Link>
            </div>
          </div>
        </div>
        <div className="lnd-foot-bottom">
          <div>© 2026 Xean Telecom Inc. All rights reserved.</div>
          <div>Edmonton, Alberta</div>
        </div>
      </div>
    </footer>
  )
}

export default LandingFooter
