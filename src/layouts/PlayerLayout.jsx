// PlayerLayout — minimal chrome for /p/* routes on hoopbase.com.au.
// Light theme default; dark when active profile is set to dark.

import React from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { signOut } from '@/lib/auth'

const THEME_KEY = 'hoopbase_player_theme'

export function getStoredTheme() {
  try {
    const v = localStorage.getItem(THEME_KEY)
    return v === 'dark' ? 'dark' : 'light'
  } catch (_) { return 'light' }
}

export function setStoredTheme(theme) {
  try { localStorage.setItem(THEME_KEY, theme === 'dark' ? 'dark' : 'light') } catch (_) {}
  window.dispatchEvent(new Event('hoopbase-theme-changed'))
}

export default function PlayerLayout({ children, theme: themeProp }) {
  const [theme, setTheme] = React.useState(themeProp || getStoredTheme())
  const location = useLocation()
  const navigate = useNavigate()

  async function handleSignOut() {
    try { await signOut() } catch (_) {}
    navigate('/auth', { replace: true })
  }

  React.useEffect(() => {
    if (themeProp) setTheme(themeProp)
  }, [themeProp])

  React.useEffect(() => {
    const onChange = () => { if (!themeProp) setTheme(getStoredTheme()) }
    window.addEventListener('hoopbase-theme-changed', onChange)
    return () => window.removeEventListener('hoopbase-theme-changed', onChange)
  }, [themeProp])

  const dark = theme === 'dark'
  const bg = dark ? 'bg-neutral-950 text-neutral-100' : 'bg-neutral-50 text-neutral-900'
  const headerBg = dark ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-neutral-200'
  const linkColor = dark ? 'text-neutral-300 hover:text-white' : 'text-neutral-600 hover:text-neutral-900'

  return (
    <div className={`min-h-screen ${bg}`}>
      <header className={`sticky top-0 z-30 border-b ${headerBg}`}>
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          <Link to="/p" className="flex items-center gap-2 font-bold text-lg tracking-tight">
            <span className={dark ? 'text-orange-400' : 'text-orange-600'}>HoopBase</span>
            <span className={dark ? 'text-neutral-500' : 'text-neutral-400'}>·</span>
            <span className="text-sm font-medium opacity-75">Players</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link className={linkColor} to="/p/onboard">Claim a profile</Link>
            <button type="button" onClick={handleSignOut} className={linkColor}>Sign out</button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6" key={location.pathname}>
        {children}
      </main>
      <footer className={`mt-12 border-t ${dark ? 'border-neutral-800 text-neutral-500' : 'border-neutral-200 text-neutral-500'}`}>
        <div className="mx-auto max-w-6xl px-4 py-6 text-xs flex items-center justify-between">
          <span>HoopBase Player Profiles · private to you</span>
          <span>© {new Date().getFullYear()} HoopBase Pty Ltd</span>
        </div>
      </footer>
    </div>
  )
}
