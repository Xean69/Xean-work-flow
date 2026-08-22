import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import PortalLayout from './portal/PortalLayout.jsx'
import PortalLogin from './portal/pages/Login.jsx'
import PortalForgotPassword from './portal/pages/ForgotPassword.jsx'
import PortalResetPassword from './portal/pages/ResetPassword.jsx'
import PortalHome from './portal/pages/Home.jsx'
import PortalLease from './portal/pages/Lease.jsx'
import PortalRepairs from './portal/pages/Repairs.jsx'
import PortalMessages from './portal/pages/Messages.jsx'
import PortalAddons from './portal/pages/Addons.jsx'
import Landing from './pages/Landing.jsx'
import Terms from './pages/Terms.jsx'
import Privacy from './pages/Privacy.jsx'
import Login from './pages/Login.jsx'
import ForgotPassword from './pages/ForgotPassword.jsx'
import ResetPassword from './pages/ResetPassword.jsx'
import Signup from './pages/Signup.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Properties from './pages/Properties.jsx'
import PropertyDetail from './pages/PropertyDetail.jsx'
import BulkImport from './pages/BulkImport.jsx'
import Tenants from './pages/Tenants.jsx'
import TenantProfile from './pages/TenantProfile.jsx'
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
import Team from './pages/Team.jsx'
import Upgrade from './pages/Upgrade.jsx'
import TenantInspection from './pages/TenantInspection.jsx'

function App() {
  return (
    <Routes>
      {/* Tenant portal: entirely separate from the manager dashboard below
          — its own layout, its own auth, no shared navigation. */}
      <Route path="/portal/login" element={<PortalLogin />} />
      <Route path="/portal/forgot-password" element={<PortalForgotPassword />} />
      <Route path="/portal/reset-password" element={<PortalResetPassword />} />
      <Route element={<PortalLayout />}>
        <Route path="/portal/home" element={<PortalHome />} />
        <Route path="/portal/repairs" element={<PortalRepairs />} />
        <Route path="/portal/messages" element={<PortalMessages />} />
        <Route path="/portal/addons" element={<PortalAddons />} />
        <Route path="/portal/lease" element={<PortalLease />} />
      </Route>

      {/* Public marketing site — its own design system entirely (dark
          navy/champagne), unrelated to the dashboard's or portal's. */}
      <Route path="/" element={<Landing />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/privacy" element={<Privacy />} />

      {/* Manager dashboard: its own login, separate from the tenant
          portal's — Layout itself guards every route nested under it. */}
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/signup" element={<Signup />} />
      <Route element={<Layout />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/properties" element={<Properties />} />
        <Route path="/properties/:id" element={<PropertyDetail />} />
        <Route path="/import" element={<BulkImport />} />
        <Route path="/tenants" element={<Tenants />} />
        <Route path="/tenants/:id" element={<TenantProfile />} />
        <Route path="/tenants/:tenantId/inspection" element={<TenantInspection />} />
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
        <Route path="/team" element={<Team />} />
        <Route path="/upgrade" element={<Upgrade />} />
      </Route>
    </Routes>
  )
}

export default App
