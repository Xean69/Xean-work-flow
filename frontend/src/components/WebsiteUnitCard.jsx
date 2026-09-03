import { useState } from 'react'

function formatCurrency(value) {
  return `$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
}

// unit: { id, unit_number, bedrooms, bathrooms, rent_amount, property_name,
// address, city, province, advertised_price, incentive_text,
// override_description, photos: [{id, url}] }
function WebsiteUnitCard({ unit, onSave, onUploadPhoto, onDeletePhoto }) {
  const [advertisedPrice, setAdvertisedPrice] = useState(unit.advertised_price ?? '')
  const [incentiveText, setIncentiveText] = useState(unit.incentive_text || '')
  const [description, setDescription] = useState(unit.override_description || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)

  async function handleSave(e) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      await onSave({
        advertised_price: advertisedPrice === '' ? null : advertisedPrice,
        incentive_text: incentiveText,
        description,
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setUploading(true)
    try {
      await onUploadPhoto(file)
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  return (
    <div className="card websites-unit-card">
      <div className="websites-unit-header">
        <div>
          <strong>
            {unit.property_name} · {unit.unit_number}
          </strong>
          <div className="websites-unit-address">
            {unit.address}, {unit.city}, {unit.province}
          </div>
        </div>
        <div className="websites-unit-real-rent">
          Real rent: <span className="mono">{formatCurrency(unit.rent_amount)}</span>/mo
        </div>
      </div>

      <form onSubmit={handleSave}>
        {error && <p className="form-error">{error}</p>}

        <div className="form-row">
          <div className="form-field">
            <label htmlFor={`price-${unit.id}`}>Advertised price</label>
            <input
              id={`price-${unit.id}`}
              type="number"
              min="0"
              step="0.01"
              value={advertisedPrice}
              onChange={(e) => setAdvertisedPrice(e.target.value)}
              placeholder={`Defaults to ${formatCurrency(unit.rent_amount)}`}
            />
          </div>
          <div className="form-field">
            <label htmlFor={`incentive-${unit.id}`}>Incentive (optional)</label>
            <input
              id={`incentive-${unit.id}`}
              value={incentiveText}
              onChange={(e) => setIncentiveText(e.target.value)}
              placeholder="e.g. $100 off first month"
            />
          </div>
        </div>

        <div className="form-field">
          <label htmlFor={`desc-${unit.id}`}>Listing description (optional)</label>
          <textarea
            id={`desc-${unit.id}`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What makes this unit worth a look — leave blank to just show the basics"
          />
        </div>

        <div className="websites-photos">
          {unit.photos.map((photo) => (
            <div className="websites-photo-thumb" key={photo.id}>
              <img src={photo.url} alt="" />
              <button
                type="button"
                className="websites-photo-remove"
                onClick={() => onDeletePhoto(photo.id)}
                aria-label="Remove photo"
              >
                ×
              </button>
            </div>
          ))}
          <label className="websites-photo-add">
            {uploading ? 'Uploading…' : '+ Add photo'}
            <input type="file" accept="image/*" onChange={handleFileChange} disabled={uploading} hidden />
          </label>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
            {saving ? 'Saving…' : 'Save listing'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default WebsiteUnitCard
