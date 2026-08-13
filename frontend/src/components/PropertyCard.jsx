import { Link } from 'react-router-dom'
import { getPlateLabel, getPhotoGradient } from '../utils/propertyDisplay.js'
import './PropertyCard.css'

function PropertyCard({ property, index = 0 }) {
  const { id, name, address, city, province, unit_count, occupied_count, avg_rent } = property
  const occupancyPct = unit_count === 0 ? 0 : Math.round((occupied_count / unit_count) * 100)

  return (
    <Link to={`/properties/${id}`} className="prop-card">
      <div className="prop-photo" style={{ background: getPhotoGradient(index) }}>
        <div className="prop-plate mono">{getPlateLabel(address)}</div>
      </div>
      <div className="prop-body">
        <div className="prop-name">{name}</div>
        <div className="prop-addr">
          {address}, {city}, {province}
        </div>
        <div className="prop-stats">
          <div className="prop-stat">
            Units
            <b>{unit_count}</b>
          </div>
          <div className="prop-stat">
            Occupied
            <b>{occupied_count}</b>
          </div>
          <div className="prop-stat">
            Avg rent
            <b className="mono" style={{ fontSize: 15 }}>
              {avg_rent ? `$${Number(avg_rent).toLocaleString()}` : '—'}
            </b>
          </div>
        </div>
        <div className="occ-bar">
          <div className="occ-fill" style={{ width: `${occupancyPct}%` }} />
        </div>
      </div>
    </Link>
  )
}

export default PropertyCard
