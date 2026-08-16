import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import PortalLayout from './portal/PortalLayout.jsx'
import PortalLogin from './portal/pages/Login.jsx'
import PortalHome from './portal/pages/Home.jsx'
import PortalLease from './portal/pages/Lease.jsx'
import PortalRepairs from './portal/pages/Repairs.jsx'
import PortalMessages from './portal/pages/Messages.jsx'
import PortalGuide from './portal/pages/Guide.jsx'
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
      {/* Tenant portal: entirely separate from the manager dashboard below
          — its own layout, its own auth, no shared navigation. */}
      <Route path="/portal/login" element={<PortalLogin />} />
      <Route element={<PortalLayout />}>
        <Route path="/portal/home" element={<PortalHome />} />
        <Route path="/portal/repairs" element={<PortalRepairs />} />
        <Route path="/portal/messages" element={<PortalMessages />} />
        <Route path="/portal/guide" element={<PortalGuide />} />
        <Route path="/portal/lease" element={<PortalLease />} />
      </Route>

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
