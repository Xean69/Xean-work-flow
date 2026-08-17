import { useEffect, useState } from 'react'
import { getTeam, inviteTeamMember, updateTeamMemberRole, removeTeamMember } from '../api/client.js'
import PageHeader from '../components/PageHeader.jsx'
import Modal from '../components/Modal.jsx'
import Badge from '../components/Badge.jsx'
import { ROLE_LABELS } from '../utils/permissions.js'
import './Team.css'

const ROLE_BADGE_VARIANT = { owner: 'amber', manager: 'slate', accountant: 'green' }
const INVITABLE_ROLES = ['manager', 'accountant']

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

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    setLoadError('')
    try {
      setTeam(await getTeam())
    } catch (err) {
      setLoadError(err.message)
    } finally {
      setLoading(false)
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
          <div className="card">
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
    </div>
  )
}

export default Team
