import PageHeader from '../components/PageHeader.jsx'
import './Insights.css'

const insights = [
  {
    icon: '📈',
    title: 'Unit 3B could earn more short-term this winter',
    desc: 'Based on booking history at 94 Street and comparable Edmonton listings, short-term nightly rates trend well above your current long-term rent through the winter season.',
    figures: [
      { label: 'Current LTR', value: '$1,650/mo' },
      { label: 'Est. STR', value: '$2,400/mo' },
      { label: 'Confidence', value: 'Moderate' },
    ],
  },
  {
    icon: '🕐',
    title: '177 Avenue renewals cluster in November',
    desc: 'Three leases renew within the same two-week window — worth staggering future lease start dates to avoid a repeat vacancy crunch next year.',
  },
]

function Insights() {
  return (
    <div>
      <PageHeader title="Insights" subtitle="Light nudges based on your own booking and rent history — not guesses" />

      <div className="content">
        {insights.map((i) => (
          <div className="insight-card" key={i.title}>
            <div className="insight-icon">{i.icon}</div>
            <div>
              <div className="insight-title">{i.title}</div>
              <div className="insight-desc">{i.desc}</div>
              {i.figures && (
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
          </div>
        ))}
      </div>
    </div>
  )
}

export default Insights
