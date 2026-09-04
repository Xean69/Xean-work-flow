import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { updateStaffPushPreference } from '../staffApi.js'

// The first settings surface staff has — until now there was no
// dedicated page at all, just the away-status toggle inline in
// StaffLayout's status bar.
function Settings() {
  const { staff } = useOutletContext()
  const [pushNotifyOther, setPushNotifyOther] = useState(staff.push_notify_other)
  const [saving, setSaving] = useState(false)

  async function handleToggle() {
    setSaving(true)
    try {
      const updated = await updateStaffPushPreference(!pushNotifyOther)
      setPushNotifyOther(updated.push_notify_other)
    } finally {
      setSaving(false)
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
    </div>
  )
}

export default Settings
