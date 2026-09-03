import { useEffect, useState } from 'react'
import {
  getWebsite,
  updateWebsite,
  updateUnitListing,
  uploadUnitListingPhoto,
  deleteUnitListingPhoto,
  activateSubdomain,
  checkSubdomainStatus,
  deactivateSubdomain,
} from '../api/client.js'
import PageHeader from '../components/PageHeader.jsx'
import WebsiteUnitCard from '../components/WebsiteUnitCard.jsx'
import Badge from '../components/Badge.jsx'
import './Websites.css'

const THEMES = [
  { value: 'classic', label: 'Classic — traditional, editorial layout' },
  { value: 'modern', label: 'Modern — clean grid, bold headlines' },
  { value: 'bold', label: 'Bold — large photos, high-contrast accents' },
]

const emptySite = { slug: '', enabled: false, tagline: '', description: '', theme: 'classic', primary_color: '#3d6d9c' }

function Websites() {
  const [site, setSite] = useState(emptySite)
  const [units, setUnits] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const [subdomainInput, setSubdomainInput] = useState('')
  const [subdomainBusy, setSubdomainBusy] = useState(false)
  const [subdomainError, setSubdomainError] = useState('')

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    setLoadError('')
    try {
      const data = await getWebsite()
      setSite(data.site ? { ...emptySite, ...data.site } : emptySite)
      setUnits(data.units)
    } catch (err) {
      setLoadError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function handleChange(e) {
    const { name, value, type, checked } = e.target
    setSite((s) => ({ ...s, [name]: type === 'checkbox' ? checked : value }))
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaveError('')
    setSaving(true)
    try {
      const saved = await updateWebsite(site)
      setSite(saved)
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleUnitSave(unitId, overrideData) {
    const updated = await updateUnitListing(unitId, overrideData)
    setUnits((prev) =>
      prev.map((u) =>
        u.id === unitId
          ? {
              ...u,
              advertised_price: updated.advertised_price,
              incentive_text: updated.incentive_text,
              override_description: updated.description,
            }
          : u
      )
    )
  }

  async function handleUploadPhoto(unitId, file) {
    const formData = new FormData()
    formData.append('photo', file)
    const photo = await uploadUnitListingPhoto(unitId, formData)
    setUnits((prev) => prev.map((u) => (u.id === unitId ? { ...u, photos: [...u.photos, photo] } : u)))
  }

  async function handleDeletePhoto(unitId, photoId) {
    await deleteUnitListingPhoto(unitId, photoId)
    setUnits((prev) => prev.map((u) => (u.id === unitId ? { ...u, photos: u.photos.filter((p) => p.id !== photoId) } : u)))
  }

  async function handleActivateSubdomain(e) {
    e.preventDefault()
    setSubdomainError('')
    setSubdomainBusy(true)
    try {
      const updated = await activateSubdomain(subdomainInput.trim().toLowerCase())
      setSite((s) => ({ ...s, custom_domain: updated.custom_domain, custom_domain_verified: updated.custom_domain_verified }))
      setSubdomainInput('')
    } catch (err) {
      setSubdomainError(err.message)
    } finally {
      setSubdomainBusy(false)
    }
  }

  async function handleCheckSubdomainStatus() {
    setSubdomainError('')
    setSubdomainBusy(true)
    try {
      const result = await checkSubdomainStatus()
      setSite((s) => ({ ...s, custom_domain_verified: result.custom_domain_verified }))
    } catch (err) {
      setSubdomainError(err.message)
    } finally {
      setSubdomainBusy(false)
    }
  }

  async function handleDeactivateSubdomain() {
    setSubdomainError('')
    setSubdomainBusy(true)
    try {
      await deactivateSubdomain()
      setSite((s) => ({ ...s, custom_domain: null, custom_domain_verified: false }))
    } catch (err) {
      setSubdomainError(err.message)
    } finally {
      setSubdomainBusy(false)
    }
  }

  const previewUrl = site.slug ? `/listings/${site.slug}` : null

  return (
    <div>
      <PageHeader title="Websites" subtitle="Publish a public listing page advertising your vacant units">
        {previewUrl && (
          <a className="btn btn-ghost" href={previewUrl} target="_blank" rel="noreferrer">
            Preview page
          </a>
        )}
      </PageHeader>

      <div className="content">
        {loadError && <p className="form-error">{loadError}</p>}

        {!loading && !loadError && (
          <>
            <div className="section-head">
              <h2>Branding</h2>
            </div>
            <form className="card websites-branding-card" onSubmit={handleSave}>
              {saveError && <p className="form-error">{saveError}</p>}

              <label className="checkbox-label">
                <input type="checkbox" name="enabled" checked={site.enabled} onChange={handleChange} />
                Publish this page (visible to anyone with the link, no Xean login required)
              </label>

              <div className="form-row">
                <div className="form-field">
                  <label htmlFor="slug">Page URL</label>
                  <div className="websites-slug-input">
                    <span className="websites-slug-prefix">/listings/</span>
                    <input
                      id="slug"
                      name="slug"
                      value={site.slug}
                      onChange={handleChange}
                      placeholder="your-company-name"
                      required
                    />
                  </div>
                </div>
                <div className="form-field">
                  <label htmlFor="theme">Template style</label>
                  <select id="theme" name="theme" value={site.theme} onChange={handleChange}>
                    {THEMES.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-field">
                <label htmlFor="tagline">Tagline</label>
                <input
                  id="tagline"
                  name="tagline"
                  value={site.tagline || ''}
                  onChange={handleChange}
                  placeholder="e.g. Well-kept homes across the city"
                />
              </div>

              <div className="form-field">
                <label htmlFor="description">Description</label>
                <textarea
                  id="description"
                  name="description"
                  value={site.description || ''}
                  onChange={handleChange}
                  placeholder="A short paragraph about your company for prospective tenants"
                />
              </div>

              <div className="form-field">
                <label htmlFor="primary_color">Accent color</label>
                <div className="websites-color-input">
                  <input
                    type="color"
                    id="primary_color"
                    name="primary_color"
                    value={site.primary_color || '#3d6d9c'}
                    onChange={handleChange}
                  />
                  <span className="mono">{site.primary_color}</span>
                </div>
              </div>

              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : 'Save branding'}
                </button>
              </div>
            </form>

            <div className="section-head">
              <h2>Custom web address</h2>
            </div>
            <div className="card websites-subdomain-card">
              {subdomainError && <p className="form-error">{subdomainError}</p>}

              {!site.custom_domain ? (
                <>
                  <p className="websites-subdomain-hint">
                    Give your page its own address, like <strong>acmeproperties.xean.ca</strong>, instead of the{' '}
                    {previewUrl || '/listings/…'} link above.
                  </p>
                  <form className="form-row" onSubmit={handleActivateSubdomain}>
                    <div className="form-field">
                      <label htmlFor="subdomain">Subdomain</label>
                      <div className="websites-slug-input">
                        <input
                          id="subdomain"
                          value={subdomainInput}
                          onChange={(e) => setSubdomainInput(e.target.value)}
                          placeholder="your-company-name"
                          required
                        />
                        <span className="websites-slug-suffix">.xean.ca</span>
                      </div>
                    </div>
                    <div className="form-actions">
                      <button type="submit" className="btn btn-primary" disabled={subdomainBusy || !subdomainInput.trim()}>
                        {subdomainBusy ? 'Activating…' : 'Activate'}
                      </button>
                    </div>
                  </form>
                </>
              ) : (
                <div className="websites-subdomain-status">
                  <div>
                    <div className="websites-subdomain-domain">{site.custom_domain}</div>
                    {site.custom_domain_verified ? (
                      <Badge variant="green">Active</Badge>
                    ) : (
                      <Badge variant="amber">Pending — usually live within a few hours</Badge>
                    )}
                  </div>
                  <div className="form-actions">
                    {site.custom_domain_verified && (
                      <a className="btn btn-ghost" href={`https://${site.custom_domain}`} target="_blank" rel="noreferrer">
                        Visit
                      </a>
                    )}
                    {!site.custom_domain_verified && (
                      <button type="button" className="btn btn-ghost" onClick={handleCheckSubdomainStatus} disabled={subdomainBusy}>
                        {subdomainBusy ? 'Checking…' : 'Check status'}
                      </button>
                    )}
                    <button type="button" className="btn btn-danger" onClick={handleDeactivateSubdomain} disabled={subdomainBusy}>
                      Deactivate
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="section-head">
              <h2>Vacant units</h2>
            </div>

            {units.length === 0 ? (
              <div className="empty-state card">
                <h3>No vacant units right now</h3>
                <p>Any unit marked "Vacant" on its property automatically shows up here to advertise.</p>
              </div>
            ) : (
              units.map((unit) => (
                <WebsiteUnitCard
                  key={unit.id}
                  unit={unit}
                  onSave={(data) => handleUnitSave(unit.id, data)}
                  onUploadPhoto={(file) => handleUploadPhoto(unit.id, file)}
                  onDeletePhoto={(photoId) => handleDeletePhoto(unit.id, photoId)}
                />
              ))
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default Websites
