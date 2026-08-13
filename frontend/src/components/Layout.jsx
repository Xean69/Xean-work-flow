import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar.jsx'

// Persistent app shell: sidebar stays mounted while the page content
// (rendered via <Outlet/>) swaps as the route changes.
function Layout() {
  return (
    <div className="shell">
      <Sidebar />
      <div className="main">
        <Outlet />
      </div>
    </div>
  )
}

export default Layout
