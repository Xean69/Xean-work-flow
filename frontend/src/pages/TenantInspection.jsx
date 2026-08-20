import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  getTenants,
  createInspection,
  getInspectionByTenant,
  addInspectionRoom,
  deleteInspectionRoom,
  addInspectionItem,
  updateInspectionItem,
  deleteInspectionItem,
  uploadInspectionPhoto,
  deleteInspectionPhoto,
  finalizeInspection,
} from '../api/client.js'
import PageHeader from '../components/PageHeader.jsx'
import Badge from '../components/Badge.jsx'
import './TenantInspection.css'

const NO_INSPECTION_MESSAGE = 'No inspection for this tenant yet'

const CONDITION_LABEL = { good: 'Good', fair: 'Fair', poor: 'Poor', damaged: 'Damaged' }
const CONDITION_VARIANT = { good: 'green', fair: 'slate', poor: 'amber', damaged: 'red' }

function formatDateTime(value) {
  if (!value) return null
  return new Date(value).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

// Owns its own notes text so typing doesn't refetch the whole inspection on
// every keystroke — commits to the server on blur. Condition is a discrete
// choice, so that one saves immediately on change.
function ItemRow({ inspectionId, item, editable, onChanged }) {
  const [notes, setNotes] = useState(item.notes || '')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  async function handleConditionChange(e) {
    const condition = e.target.value || null
    try {
      await updateInspectionItem(inspectionId, item.id, { condition, notes })
      await onChanged()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleNotesBlur() {
    if (notes === (item.notes || '')) return
    try {
      await updateInspectionItem(inspectionId, item.id, { condition: item.condition, notes })
      await onChanged()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handlePhotoSelect(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('photo', file)
      await uploadInspectionPhoto(inspectionId, item.id, formData)
      await onChanged()
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  async function handleDeletePhoto(photoId) {
    try {
      await deleteInspectionPhoto(inspectionId, photoId)
      await onChanged()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDeleteItem() {
    if (!window.confirm(`Remove "${item.label}"?`)) return
    try {
      await deleteInspectionItem(inspectionId, item.id)
      await onChanged()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="insp-item">
      <div className="insp-item-head">
        <span className="insp-item-label">{item.label}</span>
        {editable ? (
          <select value={item.condition || ''} onChange={handleConditionChange}>
            <option value="">Not rated</option>
            {Object.entries(CONDITION_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        ) : item.condition ? (
          <Badge variant={CONDITION_VARIANT[item.condition]}>{CONDITION_LABEL[item.condition]}</Badge>
        ) : (
          <span className="insp-not-rated">Not rated</span>
        )}
        {editable && (
          <button type="button" className="insp-remove" onClick={handleDeleteItem} title="Remove item">
            ×
          </button>
        )}
      </div>

      {editable ? (
        <textarea
          className="insp-notes-input"
          placeholder="Notes (optional)"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={handleNotesBlur}
        />
      ) : (
        item.notes && <p className="insp-notes-readonly">{item.notes}</p>
      )}

      {error && <p className="form-error">{error}</p>}

      <div className="insp-photos">
        {item.photos.map((p) => (
          <div key={p.id} className="insp-photo">
            <a href={p.photo_url} target="_blank" rel="noreferrer">
              <img src={p.photo_url} alt={item.label} />
            </a>
            {editable && (
              <button type="button" className="insp-photo-remove" onClick={() => handleDeletePhoto(p.id)}>
                ×
              </button>
            )}
          </div>
        ))}
        {editable && (
          <label className="insp-photo-add">
            {uploading ? '…' : '+'}
            <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handlePhotoSelect} disabled={uploading} />
          </label>
        )}
      </div>
    </div>
  )
}

function RoomSection({ inspectionId, room, editable, onChanged }) {
  const [newItemLabel, setNewItemLabel] = useState('')
  const [error, setError] = useState('')

  async function handleAddItem(e) {
    e.preventDefault()
    if (!newItemLabel.trim()) return
    try {
      await addInspectionItem(inspectionId, room.id, newItemLabel.trim())
      setNewItemLabel('')
      await onChanged()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDeleteRoom() {
    if (!window.confirm(`Remove the "${room.name}" room and all its items?`)) return
    try {
      await deleteInspectionRoom(inspectionId, room.id)
      await onChanged()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="card insp-room">
      <div className="insp-room-head">
        <h3>{room.name}</h3>
        {editable && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={handleDeleteRoom}>
            Remove room
          </button>
        )}
      </div>

      {room.items.map((item) => (
        <ItemRow
          key={item.id}
          inspectionId={inspectionId}
          item={item}
          editable={editable}
          onChanged={onChanged}
        />
      ))}

      {error && <p className="form-error">{error}</p>}

      {editable && (
        <form className="insp-add-item" onSubmit={handleAddItem}>
          <input
            placeholder="Add item (e.g. Carpet)"
            value={newItemLabel}
            onChange={(e) => setNewItemLabel(e.target.value)}
          />
          <button type="submit" className="btn btn-ghost btn-sm">
            + Add
          </button>
        </form>
      )}
    </div>
  )
}

function TenantInspection() {
  const { tenantId } = useParams()
  const navigate = useNavigate()
  const [tenantRow, setTenantRow] = useState(null)
  const [inspection, setInspection] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [busy, setBusy] = useState(false)
  const [newRoomName, setNewRoomName] = useState('')

  useEffect(() => {
    load()
  }, [tenantId])

  async function load() {
    setLoading(true)
    setLoadError('')
    try {
      const tenants = await getTenants()
      setTenantRow(tenants.find((r) => String(r.tenant_id) === String(tenantId)) || null)
      try {
        setInspection(await getInspectionByTenant(tenantId))
      } catch (err) {
        if (err.message === NO_INSPECTION_MESSAGE) setInspection(null)
        else throw err
      }
    } catch (err) {
      setLoadError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate() {
    setBusy(true)
    setLoadError('')
    try {
      setInspection(await createInspection(Number(tenantId)))
    } catch (err) {
      setLoadError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleAddRoom(e) {
    e.preventDefault()
    if (!newRoomName.trim()) return
    try {
      await addInspectionRoom(inspection.id, newRoomName.trim())
      setNewRoomName('')
      await load()
    } catch (err) {
      setLoadError(err.message)
    }
  }

  async function handleFinalize() {
    if (!window.confirm('Finalize this inspection? Once finalized, it becomes visible to the tenant and can no longer be edited.')) {
      return
    }
    setBusy(true)
    setLoadError('')
    try {
      await finalizeInspection(inspection.id)
      await load()
    } catch (err) {
      setLoadError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const editable = inspection && inspection.status === 'draft'
  const tenantLabel = tenantRow ? `${tenantRow.full_name} · ${tenantRow.property_name} — ${tenantRow.unit_number}` : ''

  return (
    <div>
      <PageHeader
        title="Move-In Inspection"
        subtitle={loading ? 'Loading…' : tenantLabel}
      >
        <button className="btn btn-ghost" onClick={() => navigate('/tenants')}>
          ← Back to tenants
        </button>
      </PageHeader>

      <div className="content">
        {loadError && <p className="form-error">{loadError}</p>}

        {!loading && !inspection && (
          <div className="empty-state card">
            <h3>No inspection yet</h3>
            <p>Create one to start a room-by-room move-in report for this tenant.</p>
            <button className="btn btn-primary" onClick={handleCreate} disabled={busy}>
              {busy ? 'Creating…' : 'Create move-in inspection'}
            </button>
          </div>
        )}

        {inspection && (
          <>
            <div className="card insp-status-bar">
              <div>
                <strong>Status: </strong>
                {inspection.status === 'draft' ? (
                  <Badge variant="slate">Draft</Badge>
                ) : inspection.signed_at ? (
                  <Badge variant="green">Signed by {inspection.signed_name} on {formatDateTime(inspection.signed_at)}</Badge>
                ) : (
                  <Badge variant="amber">Finalized · Awaiting tenant signature</Badge>
                )}
              </div>
              {editable && (
                <button className="btn btn-primary" onClick={handleFinalize} disabled={busy}>
                  {busy ? 'Finalizing…' : 'Finalize inspection'}
                </button>
              )}
            </div>

            {inspection.rooms.map((room) => (
              <RoomSection key={room.id} inspectionId={inspection.id} room={room} editable={editable} onChanged={load} />
            ))}

            {editable && (
              <form className="card insp-add-room" onSubmit={handleAddRoom}>
                <input
                  placeholder="Add room (e.g. Garage)"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                />
                <button type="submit" className="btn btn-ghost btn-sm">
                  + Add room
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default TenantInspection
