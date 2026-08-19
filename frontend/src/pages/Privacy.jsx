import { Link } from 'react-router-dom'
import LandingNav from '../components/LandingNav.jsx'
import LandingFooter from '../components/LandingFooter.jsx'
import './Landing.css'

// Sourced from xean-intake-legal-draft.md. The draft's two "for your
// reference, not to publish as-is" preamble notes (which law applies, and
// the breach-notification summary) are deliberately left out of this page
// — they were research notes for whoever finalizes this, not text meant
// for a visitor, and the actual commitments they explain already appear
// properly in sections 6 and 11 (Terms). [support email] is filled in as
// support@xean.ca; [DATE] stays a visible TODO, same as Terms.jsx.
function Privacy() {
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
            Xean — Privacy <span>Policy</span>
          </h1>

          <div className="lnd-doc-notice">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 9v4M12 17h.01" />
              <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
            </svg>
            <div>
              <strong>Draft — pending legal review.</strong> Last updated: <span className="lnd-doc-todo">TODO: set date</span>. This
              is a draft template and should be reviewed by a lawyer before it's relied on as binding.
            </div>
          </div>

          <h2>1. Who We Are</h2>
          <p>Xean is operated by Xean Telecom Inc., based in Edmonton, Alberta, Canada.</p>

          <h2>2. What Information We Collect</h2>
          <p>
            <strong>From Customers (property managers/businesses):</strong>
          </p>
          <ul>
            <li>Name, email, business name, contact information</li>
            <li>Payment/billing information (processed by a third-party payment processor; we do not store full card numbers)</li>
            <li>Property, tenant, lease, maintenance, expense, and document data entered into the Service</li>
          </ul>
          <p>
            <strong>From Tenants (via the Tenant Portal):</strong>
          </p>
          <ul>
            <li>Name, email, phone number</li>
            <li>Lease details, maintenance request content, messages, and documents shared with their property manager</li>
          </ul>
          <p>
            <strong>Automatically:</strong>
          </p>
          <ul>
            <li>Basic usage data and log information for security and troubleshooting</li>
          </ul>

          <h2>3. How We Use Information</h2>
          <ul>
            <li>To provide and operate the Service</li>
            <li>To process documents using AI (see Section 5)</li>
            <li>To communicate with Customers about their account</li>
            <li>To improve the Service</li>
            <li>To comply with legal obligations</li>
          </ul>

          <h2>4. Data Sharing</h2>
          <p>We do not sell personal information. We may share data with:</p>
          <ul>
            <li>Third-party service providers necessary to operate the Service (e.g., cloud hosting, email delivery, AI processing, payment processing)</li>
            <li>Law enforcement or regulators, where legally required</li>
          </ul>

          <h2>5. AI Processing Disclosure</h2>
          <p>
            Documents uploaded to the Service (such as leases and invoices) may be processed by third-party AI providers (e.g.,
            Anthropic, via its commercial API) to extract structured data.
          </p>
          <div className="lnd-doc-todo-block">
            <strong>TODO before publishing:</strong> Anthropic's standard commercial API terms state that API inputs/outputs are
            not used to train their models by default and are retained only briefly for abuse monitoring — confirm the current
            terms at the time of publishing, as policies can change, and link to Anthropic's own privacy/data usage terms here
            once confirmed.
          </div>

          <h2>6. Data Security &amp; Breach Notification</h2>
          <p>
            We use reasonable technical and organizational measures to protect data, including encrypted connections and access
            controls. No system is 100% secure, and we cannot guarantee absolute security.
          </p>
          <p>
            In the event of a breach involving your personal information where a real risk of significant harm exists, we will
            report the breach to the Office of the Information and Privacy Commissioner of Alberta without unreasonable delay,
            and notify affected individuals as required by Alberta's Personal Information Protection Act (PIPA) and, where
            applicable, the federal Personal Information Protection and Electronic Documents Act (PIPEDA).
          </p>

          <h2>7. Data Retention</h2>
          <p>
            We retain data for as long as an account is active, plus a reasonable period afterward for legal and operational
            purposes, unless a Customer requests earlier deletion (subject to legal retention requirements, e.g., tenancy
            record-keeping laws).
          </p>

          <h2>8. Your Rights</h2>
          <p>
            Depending on your jurisdiction, you may have the right to access, correct, or request deletion of your personal
            information. Contact <a href="mailto:support@xean.ca">support@xean.ca</a> to make a request.
          </p>

          <h2>9. Tenant Data Notice</h2>
          <p>
            If you are a tenant using the Tenant Portal, your property manager (our Customer) is responsible for the accuracy of
            your information and for obtaining any consent required to enter your data into the Service. Contact your property
            manager directly for questions about your specific data.
          </p>

          <h2>10. Children's Privacy</h2>
          <p>The Service is not directed at individuals under 18. We do not knowingly collect information from minors.</p>

          <h2>11. Changes to This Policy</h2>
          <p>We may update this policy periodically. Material changes will be communicated to Customers.</p>

          <h2>12. Contact</h2>
          <p>
            Privacy questions: <a href="mailto:support@xean.ca">support@xean.ca</a>
          </p>
        </div>
      </div>

      <LandingFooter />
    </div>
  )
}

export default Privacy
