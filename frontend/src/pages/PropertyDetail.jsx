import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  getProperty,
  updateProperty,
  deleteProperty,
  createUnit,
  updateUnit,
  deleteUnit,
  createAddon,
  updateAddon,
  deleteAddon,
} from '../api/client.js'
import PageHeader from '../components/PageHeader.jsx'
import Modal from '../components/Modal.jsx'
import PropertyForm from '../components/PropertyForm.jsx'
import UnitForm from '../components/UnitForm.jsx'
import AddonForm from '../components/AddonForm.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import './PropertyDetail.css'

function PropertyDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [property, setProperty] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [editingProperty, setEditingProperty] = useState(false)
  const [unitModal, setUnitModal] = useState(null) // null | 'new' | the unit being edited
  const [addonModal, setAddonModal] = useState(null) // null | 'new' | the addon being edited

  useEffect(() => {
    load()
  }, [id])

  async function load() {
    setLoading(true)
    setLoadError('')
    try {
      const data = await getProperty(id)
      setProperty(data)
    } catch (err) {
      setLoadError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleUpdateProperty(values) {
    await updateProperty(id, values)
    setEditingProperty(false)
    await load()
  }

  async function handleDeleteProperty() {
    if (!window.confirm(`Delete "${property.name}" and all its units? This can't be undone.`)) {
      return
    }
    await deleteProperty(id)
    navigate('/properties')
  }

  async function handleSaveUnit(values) {
    if (unitModal && unitModal !== 'new') {
      await updateUnit(unitModal.id, values)
    } else {
      await createUnit(id, values)
    }
    setUnitModal(null)
    await load()
  }

  async function handleDeleteUnit(unit) {
    if (!window.confirm(`Delete unit ${unit.unit_number}?`)) return
    await deleteUnit(unit.id)
    await load()
  }

  async function handleSaveAddon(values) {
    if (addonModal && addonModal !== 'new') {
      await updateAddon(addonModal.id, values)
    } else {
      await createAddon(id, values)
    }
    setAddonModal(null)
    await load()
  }

  async function handleDeleteAddon(addon) {
    if (!window.confirm(`Delete the "${addon.name}" addon?`)) return
    await deleteAddon(addon.id)
    await load()
  }

  if (loading) return <p className="content">Loading property…</p>
  if (loadError) return <p className="content form-error">{loadError}</p>
  if (!property) return null

  return (
    <div>
      <PageHeader
        title={property.name}
        subtitle={`${property.address}, ${property.city}, ${property.province} ${property.postal_code}`}
      >
        <button className="btn btn-ghost" onClick={() => setEditingProperty(true)}>
          Edit
        </button>
        <button className="btn btn-danger" onClick={handleDeleteProperty}>
          Delete
        </button>
      </PageHeader>

      <div className="content">
        <Link to="/properties" className="back-link">
          ← All properties
        </Link>

        <div className="section-head">
          <h2>Units</h2>
          <button className="btn btn-primary btn-sm" onClick={() => setUnitModal('new')}>
            + Add unit
          </button>
        </div>

        {property.units.length === 0 ? (
          <div className="empty-state card">
            <h3>No units yet</h3>
            <p>Add this property's first unit to start tracking occupancy.</p>
          </div>
        ) : (
          <div className="card table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Unit</th>
                  <th>Bedrooms</th>
                  <th>Bathrooms</th>
                  <th>Rent</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {property.units.map((unit) => (
                  <tr key={unit.id}>
                    <td>{unit.unit_number}</td>
                    <td>{unit.bedrooms}</td>
                    <td>{unit.bathrooms}</td>
                    <td className="mono">
                      ${Number(unit.rent_amount).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                      })}
                    </td>
                    <td>
                      <StatusBadge status={unit.status} />
                    </td>
                    <td>
                      <div className="table-actions">
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => setUnitModal(unit)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDeleteUnit(unit)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="section-head">
          <h2>Property Addons</h2>
          <button className="btn btn-primary btn-sm" onClick={() => setAddonModal('new')}>
            + Add addon
          </button>
        </div>

        {property.addons.length === 0 ? (
          <div className="empty-state card">
            <h3>No addons yet</h3>
            <p>Add priced monthly extras like parking, pets, or storage — managers can apply these to a tenant's lease.</p>
          </div>
        ) : (
          <div className="card table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Monthly price</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {property.addons.map((addon) => (
                  <tr key={addon.id}>
                    <td>{addon.name}</td>
                    <td className="mono">
                      ${Number(addon.monthly_price).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td>
                      <div className="table-actions">
                        <button className="btn btn-ghost btn-sm" onClick={() => setAddonModal(addon)}>
                          Edit
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDeleteAddon(addon)}>
                          Delete
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

      {editingProperty && (
        <Modal title="Edit property" onClose={() => setEditingProperty(false)}>
          <PropertyForm
            initialValues={property}
            onSubmit={handleUpdateProperty}
            onCancel={() => setEditingProperty(false)}
          />
        </Modal>
      )}

      {unitModal && (
        <Modal title={unitModal === 'new' ? 'Add unit' : 'Edit unit'} onClose={() => setUnitModal(null)}>
          <UnitForm
            initialValues={unitModal === 'new' ? undefined : unitModal}
            onSubmit={handleSaveUnit}
            onCancel={() => setUnitModal(null)}
          />
        </Modal>
      )}

      {addonModal && (
        <Modal title={addonModal === 'new' ? 'Add addon' : 'Edit addon'} onClose={() => setAddonModal(null)}>
          <AddonForm
            initialValues={addonModal === 'new' ? undefined : addonModal}
            onSubmit={handleSaveAddon}
            onCancel={() => setAddonModal(null)}
          />
        </Modal>
      )}
    </div>
  )
}

export default PropertyDetail
