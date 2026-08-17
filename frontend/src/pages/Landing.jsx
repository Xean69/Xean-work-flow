import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import LandingNav from '../components/LandingNav.jsx'
import LandingFooter from '../components/LandingFooter.jsx'
import './Landing.css'

// One checkmark icon, reused by every pricing tier's feature list instead
// of repeating the same inline SVG for each line item.
function Check() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

// Public marketing homepage — the page visitors see before they sign up.
// Deliberately self-contained: every class here is prefixed `lnd-` and the
// whole tree sits under a single .landing wrapper (see Landing.css) so its
// dark navy/champagne design can never bleed into the dashboard or tenant
// portal, and vice versa.
function Landing() {
  const location = useLocation()

  // Footer/nav links to other pages sometimes point here with a #section
  // hash (e.g. from the Terms/Privacy pages' "Pricing" link) — the browser
  // only auto-scrolls to a hash on a real page load, not a client-side
  // route change, so this does it manually once the sections exist in the DOM.
  useEffect(() => {
    if (!location.hash) return
    const el = document.querySelector(location.hash)
    if (el) el.scrollIntoView()
  }, [location.hash])

  return (
    <div className="landing">
      <div className="lnd-glow lnd-glow-1" />
      <div className="lnd-glow lnd-glow-2" />
      <div className="lnd-glow lnd-glow-3" />
      <div className="lnd-grid-texture" />

      <LandingNav withSectionLinks />

      <section className="lnd-hero">
        <div className="lnd-wrap">
          <div className="lnd-eyebrow">
            <span className="lnd-dot" />
            Now onboarding independent operators
          </div>
          <h1 className="lnd-hero-h1">
            Property management,
            <br />
            <span className="lnd-grad">rebuilt for the AI era.</span>
          </h1>
          <p className="lnd-hero-p">
            Xean Intake reads your leases, triages every maintenance request, and keeps every tenant
            conversation in one place — engineered for operators who expect more than spreadsheets.
          </p>
          <div className="lnd-hero-actions">
            <Link to="/signup" className="lnd-btn lnd-btn-primary lnd-btn-lg">
              Request access →
            </Link>
            <a href="#how" className="lnd-btn lnd-btn-ghost lnd-btn-lg">
              Watch a 90s demo
            </a>
          </div>
          <div className="lnd-hero-note">Currently onboarding a limited number of portfolios this quarter</div>

          <div className="lnd-console">
            <div className="lnd-console-bar">
              <span className="lnd-console-dot" />
              <span className="lnd-console-dot" />
              <span className="lnd-console-dot" />
              <span className="lnd-console-title">xean-intake / portfolio-overview</span>
            </div>
            <div className="lnd-console-body">
              <div>
                <div className="lnd-console-stats">
                  <div className="lnd-c-stat">
                    <div className="lnd-c-stat-label">Properties</div>
                    <div className="lnd-c-stat-val">7</div>
                  </div>
                  <div className="lnd-c-stat">
                    <div className="lnd-c-stat-label">Occupancy</div>
                    <div className="lnd-c-stat-val lnd-grad">92%</div>
                  </div>
                  <div className="lnd-c-stat">
                    <div className="lnd-c-stat-label">Open tickets</div>
                    <div className="lnd-c-stat-val">5</div>
                  </div>
                </div>
                <div className="lnd-c-row">
                  <div className="lnd-c-avatar" />
                  <div className="lnd-c-line" style={{ maxWidth: '70%' }} />
                  <span className="lnd-c-badge">LEASE PARSED</span>
                </div>
                <div className="lnd-c-row">
                  <div className="lnd-c-avatar" />
                  <div className="lnd-c-line" style={{ maxWidth: '55%' }} />
                  <span className="lnd-c-badge">URGENT · PLUMBING</span>
                </div>
                <div className="lnd-c-row">
                  <div className="lnd-c-avatar" />
                  <div className="lnd-c-line" style={{ maxWidth: '62%' }} />
                  <span className="lnd-c-badge">RENT COLLECTED</span>
                </div>
                <div className="lnd-c-row">
                  <div className="lnd-c-avatar" />
                  <div className="lnd-c-line" style={{ maxWidth: '48%' }} />
                  <span className="lnd-c-badge">RENEWAL · 18D</span>
                </div>
              </div>
              <div className="lnd-console-side">
                <div className="lnd-side-label">Extraction confidence</div>
                <div className="lnd-ring">
                  <span className="lnd-ring-val">98%</span>
                </div>
                <div className="lnd-side-caption">
                  Lease_94Street_3B.pdf
                  <br />
                  read in 4.2s
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="lnd-stripbar">
        <div className="lnd-wrap lnd-strip-inner">
          <div className="lnd-strip-item">
            <b>4.2s</b>
            <span>Avg. document read time</span>
          </div>
          <div className="lnd-strip-item">
            <b>1</b>
            <span>Inbox for every channel</span>
          </div>
          <div className="lnd-strip-item">
            <b>98%</b>
            <span>Extraction accuracy</span>
          </div>
        </div>
      </div>

      <section className="lnd-section" id="features">
        <div className="lnd-wrap">
          <div className="lnd-section-tag">Capabilities</div>
          <div className="lnd-section-head">
            <h2>Every layer of the stack, engineered — not stitched together</h2>
            <p>No bolted-on integrations. One system, built end to end for how independent operators actually work.</p>
          </div>

          <div className="lnd-feat-grid">
            <div className="lnd-feat-card">
              <div className="lnd-feat-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
                  <path d="M14 3v5h5" />
                </svg>
              </div>
              <h3>Document intelligence</h3>
              <p>Leases, invoices, inspection reports — parsed into structured data the moment they're uploaded.</p>
            </div>
            <div className="lnd-feat-card">
              <div className="lnd-feat-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14.7 6.3a4 4 0 0 1-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 1 5.4-5.4l-3-3z" />
                </svg>
              </div>
              <h3>Autonomous triage</h3>
              <p>Maintenance requests are classified by urgency and trade in real time, before you even open the app.</p>
            </div>
            <div className="lnd-feat-card">
              <div className="lnd-feat-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6l9 7 9-7" />
                  <rect x="3" y="4" width="18" height="16" rx="2" />
                </svg>
              </div>
              <h3>Unified communication</h3>
              <p>SMS, email, and guest-platform messages converge into a single thread per unit.</p>
            </div>
            <div className="lnd-feat-card">
              <div className="lnd-feat-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 10.5 12 3l9 7.5" />
                  <path d="M5 9.5V20a1 1 0 0 0 1 1h3v-6h6v6h3a1 1 0 0 0 1-1V9.5" />
                </svg>
              </div>
              <h3>Short-term operations</h3>
              <p>Turnover pipelines and scheduled guest messaging, running natively alongside long-term leases.</p>
            </div>
            <div className="lnd-feat-card">
              <div className="lnd-feat-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="6" width="18" height="13" rx="2" />
                  <path d="M3 10h18" />
                </svg>
              </div>
              <h3>Automated bookkeeping</h3>
              <p>Receipts are captured and categorized on upload — your books stay current without the data entry.</p>
            </div>
            <div className="lnd-feat-card">
              <div className="lnd-feat-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="9" cy="8" r="3.2" />
                  <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
                </svg>
              </div>
              <h3>A tenant-native portal</h3>
              <p>Your tenants get their own precision-built interface — lease, repairs, and messaging, from their phone.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="lnd-section lnd-section-tight" id="how">
        <div className="lnd-wrap">
          <div className="lnd-section-tag">Deployment</div>
          <div className="lnd-section-head">
            <h2>Live in an afternoon</h2>
          </div>
          <div className="lnd-steps">
            <div className="lnd-step">
              <div className="lnd-step-num">01</div>
              <h3>Import your portfolio</h3>
              <p>Bring in units and existing leases — enter manually, or let the system read your documents directly.</p>
            </div>
            <div className="lnd-step">
              <div className="lnd-step-num">02</div>
              <h3>Provision tenant access</h3>
              <p>Every tenant receives their own secured login to their unit — nothing shared, nothing exposed.</p>
            </div>
            <div className="lnd-step">
              <div className="lnd-step-num">03</div>
              <h3>Let the system run</h3>
              <p>Triage, extraction, and messaging operate continuously in the background from day one.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="lnd-section" id="pricing">
        <div className="lnd-wrap">
          <div className="lnd-section-tag">Pricing</div>
          <div className="lnd-section-head">
            <h2>Priced for operators who value their time</h2>
          </div>

          <div className="lnd-price-grid">
            <div className="lnd-price-card">
              <div className="lnd-price-name">Starter</div>
              <div className="lnd-price-desc">For getting off spreadsheets</div>
              <div className="lnd-price-amount">
                $0<span> /mo</span>
              </div>
              <div className="lnd-price-list">
                <div>
                  <Check />
                  Up to 3 units
                </div>
                <div>
                  <Check />
                  Tenant portal
                </div>
                <div>
                  <Check />
                  Manual document storage
                </div>
              </div>
              <Link to="/signup" className="lnd-price-btn lnd-btn-ghost">
                Start free
              </Link>
            </div>

            <div className="lnd-price-card lnd-featured">
              <div className="lnd-price-badge">MOST POPULAR</div>
              <div className="lnd-price-name">Growth</div>
              <div className="lnd-price-desc">For active independent operators</div>
              <div className="lnd-price-amount">
                $110<span> /mo</span>
              </div>
              <div className="lnd-price-list">
                <div>
                  <Check />
                  Up to 25 units
                </div>
                <div>
                  <Check />
                  AI document extraction
                </div>
                <div>
                  <Check />
                  Maintenance triage
                </div>
                <div>
                  <Check />
                  Unified inbox
                </div>
              </div>
              <Link to="/signup" className="lnd-price-btn lnd-btn-primary">
                Start free trial
              </Link>
            </div>

            <div className="lnd-price-card">
              <div className="lnd-price-name">Professional</div>
              <div className="lnd-price-desc">For growing management companies</div>
              <div className="lnd-price-amount">
                $280<span> /mo</span>
              </div>
              <div className="lnd-price-list">
                <div>
                  <Check />
                  Up to 75 units
                </div>
                <div>
                  <Check />
                  Owner statements
                </div>
                <div>
                  <Check />
                  Priority support
                </div>
                <div>
                  <Check />
                  Automated bookkeeping
                </div>
              </div>
              <Link to="/signup" className="lnd-price-btn lnd-btn-ghost">
                Start free trial
              </Link>
            </div>

            <div className="lnd-price-card">
              <div className="lnd-price-name">Portfolio</div>
              <div className="lnd-price-desc">For larger management companies</div>
              <div className="lnd-price-amount">
                $440<span> /mo</span>
              </div>
              <div className="lnd-price-list">
                <div>
                  <Check />
                  Unlimited units
                </div>
                <div>
                  <Check />
                  White-glove onboarding
                </div>
                <div>
                  <Check />
                  Dedicated account manager
                </div>
                <div>
                  <Check />
                  Everything included
                </div>
              </div>
              <Link to="/signup" className="lnd-price-btn lnd-btn-ghost">
                Talk to us
              </Link>
            </div>
          </div>
        </div>
      </section>

      <div className="lnd-wrap">
        <div className="lnd-cta-band">
          <h2>The paperwork ends here.</h2>
          <p>Request access — onboarding is limited this quarter.</p>
          <Link to="/signup" className="lnd-btn lnd-btn-primary lnd-btn-lg">
            Request access →
          </Link>
        </div>
      </div>

      <LandingFooter />
    </div>
  )
}

export default Landing
