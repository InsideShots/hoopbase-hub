import { NavLink, Outlet, Navigate } from 'react-router-dom'
import { useAuth } from '../../lib/AuthContext'
import { Users, Video, LayoutDashboard, Settings, Activity } from 'lucide-react'

const nav = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/teams', label: 'Teams', icon: Users },
  { to: '/admin/videos', label: 'Video Queue', icon: Video },
  { to: '/admin/pro-studio-bench', label: 'Pro Studio Bench', icon: Activity },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
]

export default function AdminLayout() {
  const { isAdmin, loading } = useAuth()
  if (loading) return null
  if (!isAdmin) return <Navigate to="/login" replace />

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      {/* Sidebar */}
      <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col p-4">
        <div className="text-lg font-bold text-brand-500 mb-6 px-2">HoopBase Admin</div>
        <nav className="space-y-1 flex-1">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to} to={to} end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-colors ${
                  isActive ? 'bg-brand-500/20 text-brand-400' : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`
              }
            >
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
