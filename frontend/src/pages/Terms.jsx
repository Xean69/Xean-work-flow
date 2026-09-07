import { Link } from 'react-router-dom'
import LandingNav from '../components/LandingNav.jsx'
import LandingFooter from '../components/LandingFooter.jsx'
import './Landing.css'

// Verified against the actual codebase before writing, not just carried
// over from the earlier draft: no payment processor is integrated
// anywhere in the backend (billing is a manual, "Talk to Us" process), the
// 14-day trial (utils/trial.js) is informational only — computeTrialStatus
// is never checked by any route to gate access — and hrsupport@xean.ca
// (not the earlier draft's guessed support@xean.ca) is the real inbox
// behind the contact form and every outbound notification (see
// services/email.js's HR_EMAIL). If any of that changes (a payment
// processor gets added, the trial becomes enforced, refunds get offered),
// Section 5 specifically needs a rewrite, not just a date bump.
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

          <p className="lnd-doc-updated">Last updated: September 7, 2026</p>

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
            <li>Xean reserves the right to suspend accounts that violate these Terms.</li>
          </ul>

          <h2>4. Tenant Sub-Users</h2>
          <ul>
            <li>Customers may invite their tenants to use a limited "Tenant Portal" to view lease information and submit maintenance requests.</li>
            <li>Customers are responsible for obtaining any necessary consent from their tenants before entering tenant information into the Service.</li>
            <li>Xean acts as a data processor on behalf of the Customer with respect to tenant data; the Customer remains the data controller.</li>
          </ul>

          <h2>5. Subscription, Trial &amp; Billing</h2>
          <ul>
            <li>
              Xean is offered on a subscription basis. Billing is currently arranged directly between Xean and each
              Customer — the Service does not have an automated, self-service payment system today; pricing, invoicing,
              and payment collection are handled manually, in Canadian dollars unless otherwise agreed.
            </li>
            <li>
              New accounts may display a 14-day trial period for reference. This trial is informational only: it does
              not automatically restrict or suspend access to the Service when it ends, and no payment is ever charged
              automatically. Moving onto a paid plan is arranged directly with Xean.
            </li>
            <li>Prices are subject to change with reasonable advance notice.</li>
            <li>
              <strong>All fees are final.</strong> Xean does not offer refunds on any sale or subscription payment,
              regardless of usage.
            </li>
            <li>
              If payment for a paid plan is not received, Xean may, at its discretion, suspend or terminate the account
              after providing reasonable notice. There is no automated billing-suspension system — any such action is
              taken manually.
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
            Customers own their data. Xean will not sell Customer or tenant data to third parties. Upon account
            termination, Customers may request an export of their data within 30 days before deletion.
          </p>

          <h2>9. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by law, Xean is not liable for indirect, incidental, or consequential
            damages arising from use of the Service, including disputes between Customers and their tenants. The Service is
            provided "as is" without warranty of any kind.
          </p>

          <h2>10. Termination</h2>
          <p>
            Either party may terminate the agreement at any time. Xean may suspend or terminate accounts that
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
            Questions about these Terms: <a href="mailto:hrsupport@xean.ca">hrsupport@xean.ca</a>
          </p>
        </div>
      </div>

      <LandingFooter />
    </div>
  )
}

export default Terms
