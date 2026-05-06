// /p — HoopBase Player Profiles landing.
// If signed in and already owns a profile, redirect there.

import React from 'react'
import { Link, Navigate } from 'react-router-dom'
import PlayerLayout, { getStoredTheme } from '@/layouts/PlayerLayout'
import { fetchHoopBaseProfileForOwner } from '@/lib/playerProfiles'
import { useAuth } from '@/lib/AuthContext'

export default function PlayerHome() {
  const { supabaseUser, isLoadingAuth } = useAuth()
  const [own, setOwn] = React.useState(undefined)
  const theme = getStoredTheme()
  const dark = theme === 'dark'

  React.useEffect(() => {
    let cancel = false
    ;(async () => {
      const email = supabaseUser?.email
      if (!email) { setOwn(null); return }
      const p = await fetchHoopBaseProfileForOwner(email)
      if (!cancel) setOwn(p)
    })()
    return () => { cancel = true }
  }, [supabaseUser?.email])

  if (!isLoadingAuth && own && own.id) {
    return <Navigate to={`/p/${own.id}`} replace />
  }

  return (
    <PlayerLayout theme={theme}>
      <div className="max-w-2xl mx-auto text-center py-10">
        <h1 className="text-4xl font-bold tracking-tight mb-3">HoopBase Player Profiles</h1>
        <p className={`text-base mb-6 ${dark ? 'text-neutral-400' : 'text-neutral-600'}`}>
          One profile, every team you've played for. Stats, video and photos from each season — private to you and the people you choose.
        </p>
        <div className="flex justify-center gap-3">
          <Link to="/p/onboard" className="px-5 py-2.5 rounded-md bg-orange-600 text-white text-sm hover:bg-orange-700">Claim your profile</Link>
          {!supabaseUser ? <Link to="/auth" className="px-5 py-2.5 rounded-md border text-sm">Sign in</Link> : null}
        </div>
      </div>
    </PlayerLayout>
  )
}
