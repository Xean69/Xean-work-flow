import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Properties from './pages/Properties.jsx'
import PropertyDetail from './pages/PropertyDetail.jsx'
import Tenants from './pages/Tenants.jsx'
import GuestStays from './pages/GuestStays.jsx'
import Maintenance from './pages/Maintenance.jsx'
import Documents from './pages/Documents.jsx'
import Inbox from './pages/Inbox.jsx'
import Expenses from './pages/Expenses.jsx'
import Compliance from './pages/Compliance.jsx'
import VoiceCalls from './pages/VoiceCalls.jsx'
import STRLicensing from './pages/STRLicensing.jsx'
import OwnerStatements from './pages/OwnerStatements.jsx'
import Insights from './pages/Insights.jsx'

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/properties" element={<Properties />} />
        <Route path="/properties/:id" element={<PropertyDetail />} />
        <Route path="/tenants" element={<Tenants />} />
        <Route path="/stays" element={<GuestStays />} />
        <Route path="/maintenance" element={<Maintenance />} />
        <Route path="/documents" element={<Documents />} />
        <Route path="/inbox" element={<Inbox />} />
        <Route path="/expenses" element={<Expenses />} />
        <Route path="/compliance" element={<Compliance />} />
        <Route path="/voice" element={<VoiceCalls />} />
        <Route path="/licensing" element={<STRLicensing />} />
        <Route path="/statements" element={<OwnerStatements />} />
        <Route path="/insights" element={<Insights />} />
      </Route>
    </Routes>
  )
}

export default App
