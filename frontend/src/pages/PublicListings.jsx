import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getPublicListing, getPublicListingByHost } from '../api/client.js'
import './PublicListings.css'
import './themes/classic.css'
import './themes/modern.css'
import './themes/bold.css'

function formatCurrency(value) {
  return `$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 0 })}`
}

function UnitCard({ unit }) {
  const isDiscounted = Number(unit.advertised_price) < Number(unit.rent_amount)
  const photo = unit.photos[0]

  return (
    <div className="pl-unit-card">
      <div className="pl-unit-photo">
        {photo ? <img src={photo} alt="" /> : <div className="pl-unit-photo-placeholder" />}
        {unit.incentive_text && <div className="pl-unit-incentive">{unit.incentive_text}</div>}
      </div>
      <div className="pl-unit-body">
        <div className="pl-unit-title">
          {unit.property_name} · {unit.address}
        </div>
        <div className="pl-unit-meta">
          {unit.city}, {unit.province} · {unit.bedrooms} bed · {unit.bathrooms} bath
        </div>
        <div className="pl-unit-price">
          {isDiscounted && <span className="pl-unit-price-original">{formatCurrency(unit.rent_amount)}</span>}
          <span className="pl-unit-price-current">{formatCurrency(unit.advertised_price)}/mo</span>
        </div>
        {unit.description && <p className="pl-unit-description">{unit.description}</p>}
      </div>
    </div>
  )
}

// byHost is set by App.jsx's SubdomainGate for a visitor on a business's
// <subdomain>.xean.ca — same component, same rendering, just fetched by
// the browser's own Host header instead of the /listings/:slug param.
function PublicListings({ byHost = false }) {
  const { slug } = useParams()
  const [listing, setListing] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setNotFound(false)
    const fetchListing = byHost ? getPublicListingByHost() : getPublicListing(slug)
    fetchListing
      .then((data) => {
        if (!cancelled) setListing(data)
      })
      .catch(() => {
        if (!cancelled) setNotFound(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [byHost, slug])

  if (loading) return null

  if (notFound || !listing) {
    return (
      <div className="pl-not-found">
        <p>This page isn't available.</p>
      </div>
    )
  }

  return (
    <div className={`pl-page pl-theme-${listing.theme}`} style={{ '--listing-primary': listing.primary_color || '#3d6d9c' }}>
      <header className="pl-header">
        {listing.logo_url && <img className="pl-logo" src={listing.logo_url} alt={listing.business_name} />}
        <h1 className="pl-business-name">{listing.business_name}</h1>
        {listing.tagline && <p className="pl-tagline">{listing.tagline}</p>}
      </header>

      {listing.description && (
        <section className="pl-description">
          <p>{listing.description}</p>
        </section>
      )}

      <main className="pl-units">
        {listing.units.length === 0 ? (
          <p className="pl-empty">No vacant units to show right now — check back soon.</p>
        ) : (
          listing.units.map((unit) => <UnitCard key={unit.id} unit={unit} />)
        )}
      </main>

      {listing.contact_email && (
        <footer className="pl-footer">
          <p>
            Interested in a unit?{' '}
            <a href={`mailto:${listing.contact_email}`} className="pl-contact-link">
              Contact us
            </a>
          </p>
        </footer>
      )}
    </div>
  )
}

export default PublicListings
