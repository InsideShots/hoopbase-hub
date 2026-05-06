import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'

const AuthContext = createContext(null)

// Email-fallback super-admin set, mirrors W6.SUPERADMIN-LOCK (migration 034)
// in the my-court-stats23 repo. The DB-side `is_super_admin()` RPC is the
// real gate — this just toggles isAdmin for nav/UI rendering. Closed-set
// so a leaked secret can't elevate an arbitrary email client-side.
const ADMIN_EMAILS = new Set([
  'mark@insideshots.au',
  'medmonds19@outlook.com',
])

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
    })
    return () => subscription.unsubscribe()
  }, [])

  const user = session?.user ?? null
  const isAdmin = !!user?.email && ADMIN_EMAILS.has(user.email.toLowerCase())

  return (
    <AuthContext.Provider value={{ session, user, supabaseUser: user, isAdmin, loading, isLoadingAuth: loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
