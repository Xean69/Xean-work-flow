import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { updateStaffPushPreference, updateStaffTimezone } from '../staffApi.js'

// The full real IANA list, from the runtime itself.
const TIMEZONES = Intl.supportedValuesOf('timeZone')

// The first settings surface staff has — until now there was no
// dedicated page at all, just the away-status toggle inline in
// StaffLayout's status bar.
function Settings() {
  const { staff, refreshStaff } = useOutletContext()
  const [pushNotifyOther, setPushNotifyOther] = useState(staff.push_notify_other)
  const [saving, setSaving] = useState(false)
  const [savingTimezone, setSavingTimezone] = useState(false)

  async function handleToggle() {
    setSaving(true)
    try {
      const updated = await updateStaffPushPreference(!pushNotifyOther)
      setPushNotifyOther(updated.push_notify_other)
    } finally {
      setSaving(false)
    }
  }

  async function handleTimezoneChange(e) {
    setSavingTimezone(true)
    try {
      await updateStaffTimezone(e.target.value)
      await refreshStaff()
    } finally {
      setSavingTimezone(false)
    }
  }

  return (
    <div>
      <p className="portal-greeting" style={{ fontSize: 20 }}>
        Settings
      </p>

      <p className="portal-greeting" style={{ fontSize: 16, marginTop: 20 }}>
        Notifications
      </p>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
        <input type="checkbox" checked={pushNotifyOther} onChange={handleToggle} disabled={saving} />
        Messages from your property manager
      </label>
      <p style={{ fontSize: 12.5, color: 'var(--slate)', marginTop: 6 }}>
        Ticket updates (new assignments, messages, status changes) are always sent once notifications are enabled —
        this only controls everything else.
      </p>

      <p className="portal-greeting" style={{ fontSize: 16, marginTop: 32 }}>
        Your timezone
      </p>
      <p style={{ fontSize: 12.5, color: 'var(--slate)', marginTop: -4, marginBottom: 10 }}>
        Controls how message and ticket-comment timestamps are displayed for you — detected automatically the
        first time you logged in, editable anytime.
      </p>
      <select value={staff.timezone || ''} onChange={handleTimezoneChange} disabled={savingTimezone}>
        {!staff.timezone && <option value="">Not yet detected — using your browser's current timezone</option>}
        {TIMEZONES.map((tz) => (
          <option key={tz} value={tz}>
            {tz}
          </option>
        ))}
      </select>
    </div>
  )
}

export default Settings
