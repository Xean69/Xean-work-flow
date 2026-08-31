import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getProperties, createProperty } from '../api/client.js'
import PageHeader from '../components/PageHeader.jsx'
import PropertyCard from '../components/PropertyCard.jsx'
import Modal from '../components/Modal.jsx'
import PropertyForm from '../components/PropertyForm.jsx'
import './Properties.css'

function Properties() {
  const [properties, setProperties] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    loadProperties()
  }, [])

  async function loadProperties() {
    setLoading(true)
    setLoadError('')
    try {
      setProperties(await getProperties())
    } catch (err) {
      setLoadError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate(values) {
    await createProperty(values)
    setShowForm(false)
    await loadProperties()
  }

  const totalUnits = properties.reduce((sum, p) => sum + p.unit_count, 0)
  const occupiedUnits = properties.reduce((sum, p) => sum + p.occupied_count, 0)
  const occupancyPct = totalUnits === 0 ? 0 : Math.round((occupiedUnits / totalUnits) * 100)

  return (
    <div>
      <PageHeader
        title="Properties"
        subtitle={
          loading
            ? 'Loading…'
            : `${properties.length} ${properties.length === 1 ? 'property' : 'properties'} · ${totalUnits} units · ${occupancyPct}% occupied`
        }
      >
        <Link to="/import" className="btn btn-ghost">
          Migrate your data
        </Link>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          + Add property
        </button>
      </PageHeader>

      <div className="content">
        {loadError && <p className="form-error">{loadError}</p>}

        {!loading && !loadError && properties.length === 0 && (
          <div className="empty-state card">
            <h3>No properties yet</h3>
            <p>Add your first property to start tracking units and occupancy.</p>
          </div>
        )}

        {properties.length > 0 && (
          <div className="prop-grid">
            {properties.map((property, i) => (
              <PropertyCard key={property.id} property={property} index={i} />
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <Modal title="Add property" onClose={() => setShowForm(false)}>
          <PropertyForm onSubmit={handleCreate} onCancel={() => setShowForm(false)} />
        </Modal>
      )}
    </div>
  )
}

export default Properties
