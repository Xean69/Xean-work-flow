import { useState } from 'react'

// Single source of truth is selectedIds (which tenants are checked) — the
// property checkboxes are just derived, tri-state "select/deselect this
// group" controls, not a separate filter layered on top. That avoids the
// confusing case of a property filter and an individual-tenant selection
// disagreeing with each other.
function AnnouncementForm({ properties, tenants, onSubmit, onCancel }) {
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [sending, setSending] = useState(false)

  // Tenants with no email on file can never actually receive anything —
  // their checkbox is disabled rather than silently accepted and skipped
  // later, so the manager sees why up front instead of being surprised by
  // the post-send summary.
  const selectableTenants = tenants.filter((t) => t.email)

  function tenantsForProperty(propertyId) {
    return selectableTenants.filter((t) => t.property_id === propertyId)
  }

  function groupCheckState(group) {
    const selectedCount = group.filter((t) => selectedIds.has(t.tenant_id)).length
    if (selectedCount === 0) return 'none'
    if (selectedCount === group.length) return 'all'
    return 'some'
  }

  function toggleGroup(group) {
    const state = groupCheckState(group)
    setSelectedIds((prev) => {
      const next = new Set(prev)
      group.forEach((t) => (state === 'all' ? next.delete(t.tenant_id) : next.add(t.tenant_id)))
      return next
    })
  }

  function toggleTenant(tenantId) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(tenantId)) next.delete(tenantId)
      else next.add(tenantId)
      return next
    })
  }

  const allState = groupCheckState(selectableTenants)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!subject.trim() || !body.trim() || selectedIds.size === 0) return
    setSending(true)
    try {
      await onSubmit(subject.trim(), body.trim(), [...selectedIds])
    } finally {
      setSending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-field">
        <label htmlFor="announce-subject">Subject</label>
        <input
          id="announce-subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="e.g. Fire alarm inspection — Thursday"
          required
        />
      </div>

      <div className="form-field">
        <label htmlFor="announce-body">Message</label>
        <textarea
          id="announce-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          required
        />
      </div>

      <div className="form-field">
        <label>Recipients</label>
        <div className="announce-recipients">
          <label className="announce-group-header announce-all-header">
            <input
              type="checkbox"
              checked={allState === 'all'}
              ref={(el) => {
                if (el) el.indeterminate = allState === 'some'
              }}
              onChange={() => toggleGroup(selectableTenants)}
              disabled={selectableTenants.length === 0}
            />
            <strong>All properties</strong>
          </label>

          {properties.map((p) => {
            const group = tenantsForProperty(p.id)
            const allTenantsAtProperty = tenants.filter((t) => t.property_id === p.id)
            if (allTenantsAtProperty.length === 0) return null
            const state = groupCheckState(group)
            return (
              <div key={p.id} className="announce-property-group">
                <label className="announce-group-header">
                  <input
                    type="checkbox"
                    checked={group.length > 0 && state === 'all'}
                    ref={(el) => {
                      if (el) el.indeterminate = state === 'some'
                    }}
                    onChange={() => toggleGroup(group)}
                    disabled={group.length === 0}
                  />
                  <strong>{p.name}</strong>
                </label>
                {allTenantsAtProperty.map((t) => (
                  <label
                    key={t.tenant_id}
                    className={'announce-tenant-row' + (!t.email ? ' announce-tenant-disabled' : '')}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(t.tenant_id)}
                      onChange={() => toggleTenant(t.tenant_id)}
                      disabled={!t.email}
                    />
                    <span>
                      {t.full_name} — {t.unit_number}
                    </span>
                    {!t.email && <span className="announce-no-email">no email on file</span>}
                  </label>
                ))}
              </div>
            )
          })}
        </div>
        <span style={{ fontSize: 12, color: 'var(--slate)' }}>
          {selectedIds.size} tenant{selectedIds.size === 1 ? '' : 's'} selected
        </span>
      </div>

      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={sending}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={sending || !subject.trim() || !body.trim() || selectedIds.size === 0}>
          {sending ? 'Sending…' : 'Send'}
        </button>
      </div>
    </form>
  )
}

export default AnnouncementForm
