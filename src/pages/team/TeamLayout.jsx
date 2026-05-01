import { NavLink, Outlet, useParams } from 'react-router-dom'
import { Home, Calendar, Video, BarChart2 } from 'lucide-react'

export default function TeamLayout() {
  const { club, age, gender, year } = useParams()
  const base = `/${club}/${age}/${gender}/${year}`

  const nav = [
    { to: base, label: 'Home', icon: Home, end: true },
    { to: `${base}/games`, label: 'Games', icon: Calendar },
    { to: `${base}/submit-video`, label: 'Submit Video', icon: Video },
    { to: `${base}/stats`, label: 'Stats', icon: BarChart2 },
  ]

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Team header */}
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-0.5">
              {club} · {age} · {gender} · {year}
            </div>
            <div className="font-bold text-lg capitalize">{club.replace(/-/g, ' ')}</div>
          </div>
          <nav className="flex gap-1">
            {nav.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to} to={to} end={end}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-colors ${
                    isActive ? 'bg-brand-500/20 text-brand-400' : 'text-gray-400 hover:text-white'
                  }`
                }
              >
                <Icon className="w-4 h-4" /> {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <Outlet />
      </main>
    </div>
  )
}
