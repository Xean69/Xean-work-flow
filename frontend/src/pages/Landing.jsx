import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import LandingNav from '../components/LandingNav.jsx'
import LandingFooter from '../components/LandingFooter.jsx'
import CountUp from '../components/CountUp.jsx'
import ContactSection from '../components/ContactSection.jsx'
import ChatWidget from '../components/ChatWidget.jsx'
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

function Chevron() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

// Answers are deliberately conservative — see the FAQ section's own note
// below on why (trial/cancellation/billing claims are scoped to what the
// app actually does today, not the pricing page's sales-forward tone).
const FAQ_ITEMS = [
  {
    q: 'Is my data secure?',
    a: "Yes. Passwords are hashed and never stored in plain text, and your data lives in a private, access-controlled database — we never sell customer or tenant data to third parties. No system is 100% secure, but it's treated as a first-class concern here, not an afterthought.",
  },
  {
    q: 'What languages does Xean support?',
    a: 'The dashboard, tenant portal, and AI maintenance assistant all work in six languages — English, Spanish, French, Portuguese, Mandarin, and Arabic — including full right-to-left layout for Arabic. Whatever language a tenant messages in, that’s the language they get answered in.',
  },
  {
    q: 'Can I cancel anytime? Is there a contract?',
    a: "There's no long-term contract. Since we're onboarding accounts by hand at this stage, cancelling or changing your plan means reaching out to our team rather than clicking a button in-app — we'll take care of it right away, no retention runaround.",
  },
  {
    q: 'Does the AI replace my property manager, or assist them?',
    a: 'Assist, not replace. The AI handles the repetitive first layer — reading leases, triaging maintenance, answering routine tenant questions at 2am — but it’s built to hand off to a human for anything requiring judgment, approval, or that’s safety-related. You stay the decision-maker.',
  },
  {
    q: 'What happens after the 14-day trial?',
    a: 'Nothing is locked or deleted when the trial period ends — your account and data stay exactly as they are. Our team will reach out to talk through the right plan for your portfolio before anything changes.',
  },
  {
    q: 'Can tenants use Xean without downloading anything?',
    a: 'Yes — the tenant portal works right in a mobile browser, no app-store download required. Tenants can optionally add it to their home screen for an app-like icon and experience, but it’s never required.',
  },
]

function FaqItem({ item, isOpen, onToggle }) {
  return (
    <div className={'lnd-faq-item' + (isOpen ? ' open' : '')}>
      <button type="button" className="lnd-faq-question" onClick={onToggle} aria-expanded={isOpen}>
        {item.q}
        <span className="lnd-faq-chevron">
          <Chevron />
        </span>
      </button>
      {isOpen && <p className="lnd-faq-answer">{item.a}</p>}
    </div>
  )
}

// Public marketing homepage — the page visitors see before they sign up.
// Deliberately self-contained: every class here is prefixed `lnd-` and the
// whole tree sits under a single .landing wrapper (see Landing.css) so its
// dark navy/champagne design can never bleed into the dashboard or tenant
// portal, and vice versa.
function Landing() {
  const location = useLocation()
  // Which FAQ answers are expanded — independent per item (not a classic
  // one-at-a-time accordion), keyed by index since FAQ_ITEMS is static.
  const [openFaq, setOpenFaq] = useState(() => new Set())

  function toggleFaq(index) {
    setOpenFaq((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

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
            Xean reads your leases, triages every maintenance request, and keeps every tenant
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
              <span className="lnd-console-title">xean / portfolio-overview</span>
            </div>
            <div className="lnd-console-body">
              <div>
                <div className="lnd-console-stats">
                  <div className="lnd-c-stat">
                    <div className="lnd-c-stat-label">Properties</div>
                    <div className="lnd-c-stat-val">
                      <CountUp value={7} />
                    </div>
                  </div>
                  <div className="lnd-c-stat">
                    <div className="lnd-c-stat-label">Occupancy</div>
                    <div className="lnd-c-stat-val lnd-grad">
                      <CountUp value={92} suffix="%" />
                    </div>
                  </div>
                  <div className="lnd-c-stat">
                    <div className="lnd-c-stat-label">Open tickets</div>
                    <div className="lnd-c-stat-val">
                      <CountUp value={5} />
                    </div>
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
                  <span className="lnd-ring-val">
                    <CountUp value={98} suffix="%" />
                  </span>
                </div>
                <div className="lnd-side-caption">
                  Lease_94Street_3B.pdf
                  <br />
                  read in <CountUp value={4.2} decimals={1} suffix="s" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="lnd-stripbar">
        <div className="lnd-wrap lnd-strip-inner">
          <div className="lnd-strip-item">
            <b>
              <CountUp value={4.2} decimals={1} suffix="s" />
            </b>
            <span>Avg. document read time</span>
          </div>
          <div className="lnd-strip-item">
            <b>
              <CountUp value={1} />
            </b>
            <span>Inbox for every channel</span>
          </div>
          <div className="lnd-strip-item">
            <b>
              <CountUp value={98} suffix="%" />
            </b>
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

      <section className="lnd-section lnd-ai-section" id="ai-messaging">
        <div className="lnd-wrap">
          <div className="lnd-ai-card">
            <span className="lnd-ai-badge">
              <span className="lnd-ai-badge-dot" />
              AI ONLINE · 24/7
            </span>
            <h2 className="lnd-ai-headline">
              Your tenants text at midnight. <span className="lnd-ai-name">Xean</span> answers.
            </h2>
            <p className="lnd-ai-sub">
              Every message triaged, every emergency ticketed, every routine question answered — before your alarm
              even goes off.
            </p>

            <div className="lnd-ai-convo">
              <div className="lnd-ai-bubble lnd-ai-bubble-tenant">heat isnt working, its freezing in here</div>
              <div className="lnd-ai-bubble lnd-ai-bubble-ai">
                Logged as urgent HVAC — a tech will reach out first thing.
              </div>
              <span className="lnd-ai-ticket">TICKET · HVAC · URGENT</span>
            </div>

            <div className="lnd-ai-stats">
              <div className="lnd-ai-stat">
                <div className="lnd-ai-stat-val">
                  <CountUp value={0} />
                </div>
                <div className="lnd-ai-stat-label">missed calls</div>
              </div>
              <div className="lnd-ai-stat lnd-ai-stat-blue">
                <div className="lnd-ai-stat-val">&lt;10s</div>
                <div className="lnd-ai-stat-label">reply time</div>
              </div>
              <div className="lnd-ai-stat lnd-ai-stat-gold">
                <div className="lnd-ai-stat-val">
                  <CountUp value={24} />
                  /7
                </div>
                <div className="lnd-ai-stat-label">coverage</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="lnd-section lnd-section-tight" id="how">
        <div className="lnd-wrap">
          <div className="lnd-section-tag">How it works</div>
          <div className="lnd-section-head">
            <h2>Live in an afternoon</h2>
          </div>
          <div className="lnd-steps">
            <div className="lnd-step">
              <div className="lnd-step-num">01</div>
              <h3>Sign up</h3>
              <p>Create your account in minutes. No credit card required, no sales call needed to get started.</p>
            </div>
            <div className="lnd-step">
              <div className="lnd-step-num">02</div>
              <h3>Add your properties and units</h3>
              <p>Bring in your portfolio manually, or let Xean read your existing lease documents and fill in the details for you.</p>
            </div>
            <div className="lnd-step">
              <div className="lnd-step-num">03</div>
              <h3>Invite your tenants</h3>
              <p>Each tenant gets their own secure portal instantly — lease, payments, and a direct line to you, installable right on their phone.</p>
            </div>
            <div className="lnd-step">
              <div className="lnd-step-num">04</div>
              <h3>Let the AI handle the busywork</h3>
              <p>Lease extraction, maintenance triage, and routine tenant messages are handled automatically, in whatever language your tenant speaks.</p>
            </div>
            <div className="lnd-step">
              <div className="lnd-step-num">05</div>
              <h3>Review, approve, and manage</h3>
              <p>Everything still runs through you — approve repairs, message tenants directly, and see your whole portfolio from one dashboard.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="lnd-section" id="pricing">
        <div className="lnd-wrap">
          <div className="lnd-section-tag">Pricing</div>
          <div className="lnd-section-head">
            <h2>Priced for operators who value their time</h2>
            <p className="lnd-pricing-note">
              <Link to="/#contact">Contact us</Link> for custom pricing — every portfolio is different, and we're
              happy to build a plan around what actually fits yours.
            </p>
          </div>

          <div className="lnd-price-grid">
            <div className="lnd-price-card">
              <div className="lnd-price-name">Starter</div>
              <div className="lnd-price-desc">For getting off spreadsheets</div>
              <div className="lnd-price-trial">14-day free trial</div>
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
              <Link to="/#contact" className="lnd-price-btn lnd-btn-ghost">
                Talk to Us
              </Link>
            </div>

            <div className="lnd-price-card lnd-featured">
              <div className="lnd-price-badge">MOST POPULAR</div>
              <div className="lnd-price-name">Growth</div>
              <div className="lnd-price-desc">For active independent operators</div>
              <div className="lnd-price-trial">14-day free trial</div>
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
              <Link to="/#contact" className="lnd-price-btn lnd-btn-primary">
                Talk to Us
              </Link>
            </div>

            <div className="lnd-price-card">
              <div className="lnd-price-name">Professional</div>
              <div className="lnd-price-desc">For growing management companies</div>
              <div className="lnd-price-trial">14-day free trial</div>
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
              <Link to="/#contact" className="lnd-price-btn lnd-btn-ghost">
                Talk to Us
              </Link>
            </div>

            <div className="lnd-price-card">
              <div className="lnd-price-name">Portfolio</div>
              <div className="lnd-price-desc">For larger management companies</div>
              <div className="lnd-price-trial">14-day free trial</div>
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
              <Link to="/#contact" className="lnd-price-btn lnd-btn-ghost">
                Talk to Us
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="lnd-section lnd-section-tight" id="faq">
        <div className="lnd-wrap">
          <div className="lnd-section-tag">FAQ</div>
          <div className="lnd-section-head">
            <h2>Questions worth asking before you sign up</h2>
          </div>
          <div className="lnd-faq-list">
            {FAQ_ITEMS.map((item, i) => (
              <FaqItem key={item.q} item={item} isOpen={openFaq.has(i)} onToggle={() => toggleFaq(i)} />
            ))}
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

      <ContactSection />

      <LandingFooter />

      <ChatWidget />
    </div>
  )
}

export default Landing
