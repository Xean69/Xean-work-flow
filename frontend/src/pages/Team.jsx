import { useEffect, useState } from 'react'
import {
  getTeam,
  inviteTeamMember,
  updateTeamMemberRole,
  removeTeamMember,
  getMaintenanceStaff,
  addMaintenanceStaff,
  setMaintenanceStaffPassword,
  removeMaintenanceStaff,
} from '../api/client.js'
import PageHeader from '../components/PageHeader.jsx'
import Modal from '../components/Modal.jsx'
import Badge from '../components/Badge.jsx'
import TenantPasswordForm from '../components/TenantPasswordForm.jsx'
import { ROLE_LABELS } from '../utils/permissions.js'
import './Team.css'

const ROLE_BADGE_VARIANT = { owner: 'amber', manager: 'slate', accountant: 'green' }
const INVITABLE_ROLES = ['manager', 'accountant']
const PRESENCE_LABEL = { online: 'Online', away: 'Away', offline: 'Offline' }

function formatDate(value) {
  return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function Team() {
  const [team, setTeam] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('manager')
  const [inviteError, setInviteError] = useState('')
  const [inviteSubmitting, setInviteSubmitting] = useState(false)

  // Set once, right after a successful invite — the only time this
  // password is ever visible anywhere. Closing this panel loses it for
  // good, same as it would with a real email invite.
  const [newAccount, setNewAccount] = useState(null)
  const [copied, setCopied] = useState(false)

  const [actionError, setActionError] = useState('')

  // Maintenance team — a separate, deliberately lightweight account type
  // (see schema.sql's note on maintenance_staff), so it gets its own state
  // and its own small set of actions rather than folding into the admin
  // team's role/invite flow above.
  const [staff, setStaff] = useState([])
  const [showAddStaff, setShowAddStaff] = useState(false)
  const [staffFirstName, setStaffFirstName] = useState('')
  const [staffLastName, setStaffLastName] = useState('')
  const [staffEmail, setStaffEmail] = useState('')
  const [staffPhone, setStaffPhone] = useState('')
  const [staffError, setStaffError] = useState('')
  const [staffSubmitting, setStaffSubmitting] = useState(false)
  const [passwordModalFor, setPasswordModalFor] = useState(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    setLoadError('')
    try {
      const [teamRows, staffRows] = await Promise.all([getTeam(), getMaintenanceStaff()])
      setTeam(teamRows)
      setStaff(staffRows)
    } catch (err) {
      setLoadError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function openAddStaff() {
    setStaffFirstName('')
    setStaffLastName('')
    setStaffEmail('')
    setStaffPhone('')
    setStaffError('')
    setShowAddStaff(true)
  }

  async function handleAddStaff(e) {
    e.preventDefault()
    setStaffError('')
    setStaffSubmitting(true)
    try {
      await addMaintenanceStaff({
        first_name: staffFirstName.trim(),
        last_name: staffLastName.trim(),
        email: staffEmail.trim(),
        phone: staffPhone.trim() || undefined,
      })
      setShowAddStaff(false)
      await load()
    } catch (err) {
      setStaffError(err.message)
    } finally {
      setStaffSubmitting(false)
    }
  }

  async function handleSetStaffPassword(password) {
    await setMaintenanceStaffPassword(passwordModalFor.id, password)
    setPasswordModalFor(null)
    await load()
  }

  async function handleRemoveStaff(member) {
    if (!window.confirm(`Remove ${member.first_name} ${member.last_name} from the maintenance team? They'll immediately lose access.`)) return
    setActionError('')
    try {
      await removeMaintenanceStaff(member.id)
      await load()
    } catch (err) {
      setActionError(err.message)
    }
  }

  function openInvite() {
    setInviteEmail('')
    setInviteRole('manager')
    setInviteError('')
    setShowInvite(true)
  }

  async function handleInvite(e) {
    e.preventDefault()
    setInviteError('')
    setInviteSubmitting(true)
    try {
      const created = await inviteTeamMember(inviteEmail.trim(), inviteRole)
      setShowInvite(false)
      setNewAccount(created)
      await load()
    } catch (err) {
      setInviteError(err.message)
    } finally {
      setInviteSubmitting(false)
    }
  }

  async function handleRoleChange(member, role) {
    setActionError('')
    try {
      await updateTeamMemberRole(member.id, role)
      await load()
    } catch (err) {
      setActionError(err.message)
    }
  }

  async function handleRemove(member) {
    if (!window.confirm(`Remove ${member.email} from your team? They'll immediately lose access.`)) return
    setActionError('')
    try {
      await removeTeamMember(member.id)
      await load()
    } catch (err) {
      setActionError(err.message)
    }
  }

  function copyPassword() {
    navigator.clipboard?.writeText(newAccount.temporaryPassword).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div>
      <PageHeader title="Team" subtitle="Invite teammates and control what they can see and do.">
        <button className="btn btn-primary" onClick={openInvite}>
          + Invite team member
        </button>
      </PageHeader>

      <div className="content">
        {loadError && <p className="form-error">{loadError}</p>}
        {actionError && <p className="form-error">{actionError}</p>}

        {!loading && team.length > 0 && (
          <div className="card table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Added</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {team.map((member) => (
                  <tr key={member.id}>
                    <td style={{ fontWeight: 600 }}>{member.email}</td>
                    <td>
                      {member.role === 'owner' ? (
                        <Badge variant={ROLE_BADGE_VARIANT.owner}>Owner</Badge>
                      ) : (
                        <select
                          className="team-role-select"
                          value={member.role}
                          onChange={(e) => handleRoleChange(member, e.target.value)}
                        >
                          {INVITABLE_ROLES.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABELS[r]}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="mono">{formatDate(member.created_at)}</td>
                    <td>
                      {member.role !== 'owner' && (
                        <div className="table-actions">
                          <button className="btn btn-danger btn-sm" onClick={() => handleRemove(member)}>
                            Remove
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="card team-role-guide">
          <h3>What each role can do</h3>
          <ul>
            <li>
              <strong>Owner</strong> — everything, including this Team page.
            </li>
            <li>
              <strong>Manager</strong> — everything except Team management.
            </li>
            <li>
              <strong>Accountant</strong> — read-only access to Expenses, Owner Statements, and Documents. No access to
              Properties, Tenants, Maintenance, Guest Stays, or Inbox.
            </li>
          </ul>
        </div>

        <div className="section-head" style={{ marginTop: 28 }}>
          <h2>Maintenance Team</h2>
          <button className="btn btn-primary btn-sm" onClick={openAddStaff}>
            + Add maintenance team member
          </button>
        </div>
        <p style={{ fontSize: 13, color: 'var(--slate)', marginTop: -8, marginBottom: 14 }}>
          A separate, scoped portal login — they can only see and update tickets a manager assigns to them.
        </p>

        {!loading && staff.length === 0 && (
          <div className="empty-state card">
            <h3>No maintenance team members yet</h3>
            <p>Add one, then assign tickets to them from the Maintenance board.</p>
          </div>
        )}

        {!loading && staff.length > 0 && (
          <div className="card table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Portal Login</th>
                  <th>Added</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {staff.map((member) => (
                  <tr key={member.id}>
                    <td style={{ fontWeight: 600 }}>
                      {member.first_name} {member.last_name}
                    </td>
                    <td>
                      <span className={`presence-dot presence-${member.presence}`} />
                      {PRESENCE_LABEL[member.presence]}
                      {member.presence === 'away' && member.away_note && (
                        <span style={{ color: 'var(--slate)', fontSize: 12 }}> — {member.away_note}</span>
                      )}
                    </td>
                    <td>{member.email}</td>
                    <td>{member.phone || '—'}</td>
                    <td>
                      <Badge variant={member.has_login ? 'green' : 'slate'}>
                        {member.has_login ? 'Active' : 'Not set'}
                      </Badge>
                    </td>
                    <td className="mono">{formatDate(member.created_at)}</td>
                    <td>
                      <div className="table-actions">
                        <button className="btn btn-ghost btn-sm" onClick={() => setPasswordModalFor(member)}>
                          {member.has_login ? 'Reset password' : 'Set password'}
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleRemoveStaff(member)}>
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showInvite && (
        <Modal title="Invite team member" onClose={() => setShowInvite(false)}>
          <form onSubmit={handleInvite}>
            {inviteError && <p className="form-error">{inviteError}</p>}

            <div className="form-field">
              <label htmlFor="inviteEmail">Email</label>
              <input
                id="inviteEmail"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="form-field">
              <label htmlFor="inviteRole">Role</label>
              <select id="inviteRole" value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
                {INVITABLE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>

            <p className="team-invite-note">
              No email sending is set up yet, so this creates the account immediately with a temporary password you'll
              share with them yourself.
            </p>

            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowInvite(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={inviteSubmitting}>
                {inviteSubmitting ? 'Creating…' : 'Create account'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {newAccount && (
        <Modal title="Account created" onClose={() => setNewAccount(null)}>
          <p className="team-new-account-note">
            Share these credentials with <strong>{newAccount.email}</strong> yourself — this password is shown only
            once and can't be retrieved again after you close this window.
          </p>

          <div className="form-field">
            <label>Email</label>
            <input value={newAccount.email} readOnly />
          </div>

          <div className="form-field">
            <label>Temporary password</label>
            <div className="team-password-row">
              <input className="mono" value={newAccount.temporaryPassword} readOnly />
              <button type="button" className="btn btn-ghost btn-sm" onClick={copyPassword}>
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <div className="form-actions">
            <button type="button" className="btn btn-primary" onClick={() => setNewAccount(null)}>
              Done
            </button>
          </div>
        </Modal>
      )}

      {showAddStaff && (
        <Modal title="Add maintenance team member" onClose={() => setShowAddStaff(false)}>
          <form onSubmit={handleAddStaff}>
            {staffError && <p className="form-error">{staffError}</p>}

            <div className="form-field">
              <label htmlFor="staffFirstName">First name</label>
              <input
                id="staffFirstName"
                value={staffFirstName}
                onChange={(e) => setStaffFirstName(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="form-field">
              <label htmlFor="staffLastName">Last name</label>
              <input
                id="staffLastName"
                value={staffLastName}
                onChange={(e) => setStaffLastName(e.target.value)}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="staffEmail">Email</label>
              <input
                id="staffEmail"
                type="email"
                value={staffEmail}
                onChange={(e) => setStaffEmail(e.target.value)}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="staffPhone">Phone (optional)</label>
              <input id="staffPhone" value={staffPhone} onChange={(e) => setStaffPhone(e.target.value)} />
            </div>

            <p className="team-invite-note">
              This just creates the record — set a portal password for them afterward from the team list.
            </p>

            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowAddStaff(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={staffSubmitting}>
                {staffSubmitting ? 'Adding…' : 'Add'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {passwordModalFor && (
        <Modal
          title={passwordModalFor.has_login ? 'Reset portal password' : 'Set portal password'}
          onClose={() => setPasswordModalFor(null)}
        >
          <TenantPasswordForm
            tenantName={`${passwordModalFor.first_name} ${passwordModalFor.last_name}`}
            onSubmit={handleSetStaffPassword}
            onCancel={() => setPasswordModalFor(null)}
          />
        </Modal>
      )}
    </div>
  )
}

export default Team
