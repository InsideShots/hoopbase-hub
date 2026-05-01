import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { Basketball } from './Basketball'

export default function Header() {
  const { user, isAdmin } = useAuth()
  const navigate = useNavigate()

  const signOut = async () => {
    await supabase.auth.signOut()
    navigate('/')
  }

  return (
    <header className="bg-gray-900 text-white px-6 py-4 flex items-center justify-between">
      <Link to="/" className="flex items-center gap-2 font-bold text-xl">
        <Basketball className="w-7 h-7 text-brand-500" />
        <span>HoopBase</span>
      </Link>
      <nav className="flex items-center gap-4 text-sm">
        <Link to="/join" className="hover:text-brand-400 transition-colors">Join</Link>
        {isAdmin && (
          <Link to="/admin" className="hover:text-brand-400 transition-colors">Admin</Link>
        )}
        {user ? (
          <button
            onClick={signOut}
            className="bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded-lg transition-colors"
          >
            Sign out
          </button>
        ) : (
          <Link
            to="/login"
            className="bg-brand-500 hover:bg-brand-600 px-3 py-1.5 rounded-lg transition-colors"
          >
            Sign in
          </Link>
        )}
      </nav>
    </header>
  )
}
