import PageHeader from '../components/PageHeader.jsx'
import StatCard from '../components/StatCard.jsx'
import './Expenses.css'

const receipts = [
  { amount: '$340', cat: 'Plumbing repair', sub: '94 St · ABC Plumbing · Aug 9' },
  { amount: '$86', cat: 'Cleaning supplies', sub: 'Cy Becker · Home Depot · Aug 8' },
  { amount: '$210', cat: 'Landscaping', sub: '177 Ave · GreenCut · Aug 6' },
  { amount: '$1,504', cat: 'Property tax', sub: '94 St · City of Edmonton · Aug 1' },
]

function Expenses() {
  return (
    <div>
      <PageHeader title="Expenses" subtitle="Snap a receipt — Xean logs the amount, category, and property">
        <button className="btn btn-primary">Upload receipt</button>
      </PageHeader>

      <div className="content">
        <div className="stat-row">
          <StatCard label="This month" value="$2,140" sub="across 11 receipts" />
          <StatCard label="Repairs" value="$980" sub="largest category" />
          <StatCard label="Unreviewed" value="3" sub="needs a category check" subVariant="warn" />
          <StatCard label="Tax-ready export" value={<span className="mono">2026</span>} sub="year to date" />
        </div>

        <div className="section-head">
          <h2>Recent receipts</h2>
          <span className="section-head-link">View all</span>
        </div>
        <div className="exp-grid">
          {receipts.map((r) => (
            <div className="exp-card" key={r.sub}>
              <div className="exp-thumb">🧾</div>
              <div className="exp-body">
                <div className="exp-amount">{r.amount}</div>
                <div className="exp-cat">{r.cat}</div>
                <div className="exp-sub">{r.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default Expenses
