import { useEffect, useState } from 'react'
import { getPortalGuide } from '../portalApi.js'

function Guide() {
  const [sections, setSections] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getPortalGuide()
      .then(setSections)
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <p className="portal-greeting" style={{ fontSize: 20 }}>
        Property guide
      </p>

      {!loading && sections.length === 0 && (
        <div className="portal-card">
          <p>Your property manager hasn't added any guide content yet.</p>
        </div>
      )}

      {sections.map((s) => (
        <div className="portal-card" key={s.id}>
          <h2>{s.section_title}</h2>
          <p style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{s.content}</p>
        </div>
      ))}
    </div>
  )
}

export default Guide
