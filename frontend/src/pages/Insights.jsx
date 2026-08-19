import { useEffect, useState } from 'react'
import PageHeader from '../components/PageHeader.jsx'
import { getInsights, generateInsights, dismissInsight } from '../api/client.js'
import './Insights.css'

function formatGeneratedAt(value) {
  if (!value) return ''
  const date = new Date(value)
  const now = new Date()
  const diffMs = now - date
  const diffMins = Math.round(diffMs / 60000)
  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins} min ago`
  const diffHours = Math.round(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function Insights() {
  const [insights, setInsights] = useState([])
  const [lastGeneration, setLastGeneration] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState('')

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    setLoadError('')
    try {
      const data = await getInsights()
      setInsights(data.insights)
      setLastGeneration(data.last_generation)
    } catch (err) {
      setLoadError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleGenerate() {
    setGenerating(true)
    setGenerateError('')
    try {
      const data = await generateInsights()
      setInsights(data.insights)
      setLastGeneration(data.last_generation)
    } catch (err) {
      setGenerateError(err.message)
    } finally {
      setGenerating(false)
    }
  }

  async function handleDismiss(id) {
    setInsights((prev) => prev.filter((i) => i.id !== id))
    try {
      await dismissInsight(id)
    } catch (err) {
      setGenerateError(err.message)
      await load()
    }
  }

  return (
    <div>
      <PageHeader title="Insights" subtitle="Light nudges based on your own booking and rent history — not guesses">
        <button type="button" className="btn btn-primary" onClick={handleGenerate} disabled={generating}>
          {generating ? 'Generating…' : insights.length > 0 ? 'Regenerate insights' : 'Generate insights'}
        </button>
      </PageHeader>

      <div className="content">
        {loadError && <p className="form-error">{loadError}</p>}
        {generateError && <p className="form-error">{generateError}</p>}

        {lastGeneration && (
          <p className="insights-meta">
            Last generated {formatGeneratedAt(lastGeneration.generated_at)}
          </p>
        )}

        {!loading && lastGeneration?.insufficient_data && insights.length === 0 && (
          <div className="empty-state card">
            <h3>Not enough data yet</h3>
            <p>{lastGeneration.note}</p>
          </div>
        )}

        {!loading && !lastGeneration && insights.length === 0 && (
          <div className="empty-state card">
            <h3>No insights yet</h3>
            <p>Click "Generate insights" to have AI look for real patterns in your portfolio.</p>
          </div>
        )}

        {insights.map((i) => (
          <div className="insight-card" key={i.id}>
            <div className="insight-icon">{i.icon}</div>
            <div className="insight-body">
              <div className="insight-title">{i.title}</div>
              <div className="insight-desc">{i.description}</div>
              <div className="insight-reasoning">Based on: {i.reasoning}</div>
              {i.figures?.length > 0 && (
                <div className="insight-figures">
                  {i.figures.map((f) => (
                    <div key={f.label}>
                      {f.label}
                      <b>{f.value}</b>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button type="button" className="btn btn-ghost btn-sm insight-dismiss" onClick={() => handleDismiss(i.id)}>
              Dismiss
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

export default Insights
