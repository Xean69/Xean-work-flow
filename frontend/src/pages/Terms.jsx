import { Link } from 'react-router-dom'
import LandingNav from '../components/LandingNav.jsx'
import LandingFooter from '../components/LandingFooter.jsx'
import './Landing.css'

// Sourced from xean-intake-legal-draft.md. [support email] is filled in as
// support@xean.ca per instruction; [DATE] and the refund policy are left
// as visible TODOs (see .lnd-doc-notice/.lnd-doc-todo below) rather than
// guessed at, since neither has actually been decided yet.
function Terms() {
  return (
    <div className="landing">
      <div className="lnd-glow lnd-glow-1" />
      <div className="lnd-glow lnd-glow-2" />
      <div className="lnd-glow lnd-glow-3" />
      <div className="lnd-grid-texture" />

      <LandingNav />

      <div className="lnd-wrap lnd-doc-page">
        <Link to="/" className="lnd-doc-back">
          ← Back to Xean
        </Link>

        <div className="lnd-doc-card">
          <h1>
            Xean — Terms of <span>Service</span>
          </h1>

          <div className="lnd-doc-notice">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 9v4M12 17h.01" />
              <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
            </svg>
            <div>
              <strong>Draft — pending legal review.</strong> Last updated: <span className="lnd-doc-todo">TODO: set date</span>. This
              is a draft template and should be reviewed by a lawyer before it's relied on as binding terms.
            </div>
          </div>

          <h2>1. Acceptance of Terms</h2>
          <p>
            By creating an account or using Xean ("the Service"), operated by Xean Telecom Inc. ("Xean," "we," "us"), you
            agree to these Terms of Service. If you do not agree, do not use the Service.
          </p>

          <h2>2. Description of Service</h2>
          <p>
            Xean is a property management platform that allows businesses ("Customers") to manage properties, tenants,
            leases, maintenance requests, documents, and related operations, including AI-assisted document processing and
            maintenance triage.
          </p>

          <h2>3. Accounts</h2>
          <ul>
            <li>You must provide accurate information when creating an account.</li>
            <li>You are responsible for maintaining the confidentiality of your login credentials.</li>
            <li>Each Customer account is isolated — Customers cannot access another Customer's data.</li>
            <li>Xean Telecom Inc. reserves the right to suspend accounts that violate these Terms.</li>
          </ul>

          <h2>4. Tenant Sub-Users</h2>
          <ul>
            <li>Customers may invite their tenants to use a limited "Tenant Portal" to view lease information and submit maintenance requests.</li>
            <li>Customers are responsible for obtaining any necessary consent from their tenants before entering tenant information into the Service.</li>
            <li>Xean Telecom Inc. acts as a data processor on behalf of the Customer with respect to tenant data; the Customer remains the data controller.</li>
          </ul>

          <h2>5. Subscription &amp; Billing</h2>
          <ul>
            <li>Paid plans are billed monthly in advance, in Canadian dollars unless stated otherwise.</li>
            <li>Prices are subject to change with 30 days' notice.</li>
            <li>Failure to pay may result in suspension or downgrade of the account.</li>
            <li>
              <span className="lnd-doc-todo">TODO: refund policy to be defined</span>
            </li>
          </ul>

          <h2>6. Acceptable Use</h2>
          <p>You agree not to:</p>
          <ul>
            <li>Use the Service for any unlawful purpose, including violations of tenancy law.</li>
            <li>Upload content you do not have rights to.</li>
            <li>Attempt to access another Customer's data or reverse-engineer the Service.</li>
            <li>Use the Service to harass, discriminate against, or unlawfully evict tenants.</li>
          </ul>

          <h2>7. AI-Assisted Features</h2>
          <p>
            The Service uses artificial intelligence (including third-party AI providers) to extract data from documents and
            classify maintenance requests. AI outputs may contain errors. Customers are responsible for reviewing and verifying
            AI-generated information before relying on it, particularly for legal documents such as leases.
          </p>

          <h2>8. Data Ownership</h2>
          <p>
            Customers own their data. Xean Telecom Inc. will not sell Customer or tenant data to third parties. Upon account
            termination, Customers may request an export of their data within 30 days before deletion.
          </p>

          <h2>9. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by law, Xean Telecom Inc. is not liable for indirect, incidental, or consequential
            damages arising from use of the Service, including disputes between Customers and their tenants. The Service is
            provided "as is" without warranty of any kind.
          </p>

          <h2>10. Termination</h2>
          <p>
            Either party may terminate the agreement at any time. Xean Telecom Inc. may suspend or terminate accounts that
            violate these Terms or applicable law.
          </p>

          <h2>11. Governing Law</h2>
          <p>
            These Terms are governed by the laws of the Province of Alberta and the federal laws of Canada applicable therein.
            Personal information handled under these Terms is subject to Alberta's Personal Information Protection Act (PIPA)
            and, where activity crosses provincial or international borders, the federal Personal Information Protection and
            Electronic Documents Act (PIPEDA).
          </p>

          <h2>12. Changes to These Terms</h2>
          <p>We may update these Terms from time to time. Continued use of the Service after changes constitutes acceptance.</p>

          <h2>13. Contact</h2>
          <p>
            Questions about these Terms: <a href="mailto:support@xean.ca">support@xean.ca</a>
          </p>
        </div>
      </div>

      <LandingFooter />
    </div>
  )
}

export default Terms
