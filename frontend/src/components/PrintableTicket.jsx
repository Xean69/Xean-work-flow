import './PrintableTicket.css'

const STATUS_LABEL = { new: 'New', in_progress: 'In Progress', resolved: 'Resolved' }
const PRIORITY_LABEL = { low: 'Low', medium: 'Medium', high: 'High' }

function formatDate(value) {
  return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

// entry_date is a plain calendar date (no time component) — pg returns it
// as a UTC-midnight Date, so formatting in the viewer's local timezone
// could roll it back a day in a negative-UTC-offset timezone. Reading it
// in UTC guarantees the printed day always matches the date actually
// stored (same reasoning as Maintenance.jsx's own formatEntryDate).
function formatEntryDate(value) {
  return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
}

// Rendered on-screen but invisible (see PrintableTicket.css) — only
// window.print() ever shows it. Shared by the manager's Maintenance.jsx
// and the staff portal's Tickets.jsx: both already fetch this same shape
// from their respective (differently-scoped) single-ticket endpoints, so
// this component just formats whatever it's handed rather than fetching
// anything itself. assignedStaffName is omitted entirely on the staff
// side (a technician printing their own ticket doesn't need to be told
// it's assigned to them).
function PrintableTicket({ ticket, assignedStaffName }) {
  if (!ticket) return null

  const hasAiClassification = ticket.ai_classification_status === 'success'

  return (
    <div className="print-ticket">
      <div className="print-ticket-header">
        <div className="print-ticket-brand">Xean</div>
        <div className="print-ticket-id">Ticket #{ticket.id}</div>
      </div>

      <h1 className="print-ticket-title">{ticket.title}</h1>

      <div className="print-ticket-grid">
        <div className="print-ticket-field">
          <div className="print-ticket-label">Tenant</div>
          <div>{ticket.tenant_name || '—'}</div>
        </div>
        <div className="print-ticket-field">
          <div className="print-ticket-label">Tenant Phone</div>
          <div>{ticket.tenant_phone || '—'}</div>
        </div>
        <div className="print-ticket-field">
          <div className="print-ticket-label">Property / Unit</div>
          <div>
            {ticket.property_name} · Unit {ticket.unit_number}
          </div>
        </div>
        <div className="print-ticket-field">
          <div className="print-ticket-label">Date Submitted</div>
          <div>{formatDate(ticket.created_at)}</div>
        </div>
        <div className="print-ticket-field">
          <div className="print-ticket-label">Priority</div>
          <div>{PRIORITY_LABEL[ticket.priority] || ticket.priority}</div>
        </div>
        <div className="print-ticket-field">
          <div className="print-ticket-label">Status</div>
          <div>{STATUS_LABEL[ticket.status] || ticket.status}</div>
        </div>
        {hasAiClassification && (
          <div className="print-ticket-field">
            <div className="print-ticket-label">AI-Assessed Urgency / Trade</div>
            <div>
              {ticket.ai_urgency} / {ticket.ai_trade}
            </div>
          </div>
        )}
        <div className="print-ticket-field">
          <div className="print-ticket-label">Entry Permission</div>
          <div>
            {ticket.entry_permission == null
              ? 'Not applicable'
              : ticket.entry_permission
                ? `Granted — ${formatEntryDate(ticket.entry_date)}`
                : 'Not granted'}
          </div>
        </div>
        {assignedStaffName && (
          <div className="print-ticket-field">
            <div className="print-ticket-label">Assigned To</div>
            <div>{assignedStaffName}</div>
          </div>
        )}
      </div>

      <div className="print-ticket-field print-ticket-description">
        <div className="print-ticket-label">Issue Description</div>
        <p>{ticket.description || '—'}</p>
      </div>

      <div className="print-ticket-footer">Printed {formatDate(new Date())}</div>
    </div>
  )
}

export default PrintableTicket
