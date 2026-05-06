// /auth — sign-in for player profile surface.
// On success → redirects to /p (Home redirects to profile if one exists).

import React from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

export default function Auth() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('next') || '/p'
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [mode, setMode] = React.useState('signin') // signin | magic

  async function handlePassword(e) {
    e.preventDefault()
    setLoading(true); setError('')
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (err) { setError(err.message); return }
    navigate(next, { replace: true })
  }

  async function handleMagic(e) {
    e.preventDefault()
    setLoading(true); setError('')
    const { error: err } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${window.location.origin}${next}` } })
    setLoading(false)
    if (err) { setError(err.message); return }
    setMode('magic_sent')
  }

  async function handleGoogle() {
    setLoading(true); setError('')
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}${next}` },
    })
    if (err) { setError(err.message); setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="text-orange-500 font-bold text-2xl">HoopBase</span>
          <p className="text-neutral-400 text-sm mt-1">Player Profiles</p>
        </div>

        {mode === 'magic_sent' ? (
          <div className="text-center text-neutral-300">
            <p className="text-lg font-semibold mb-2">Check your email</p>
            <p className="text-sm text-neutral-400">We sent a sign-in link to <strong>{email}</strong>. Click the link to sign in.</p>
          </div>
        ) : (
          <>
            <form onSubmit={handlePassword} className="space-y-4">
              <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email" required
                className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500" />
              <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password" required
                className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500" />
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <button type="submit" disabled={loading}
                className="w-full bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors">
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>

            <div className="mt-4 space-y-2">
              <button onClick={handleGoogle} disabled={loading}
                className="w-full bg-neutral-800 border border-neutral-700 hover:bg-neutral-700 disabled:opacity-50 text-white py-3 rounded-xl text-sm transition-colors">
                Continue with Google
              </button>
              <button onClick={handleMagic} disabled={loading || !email}
                className="w-full bg-transparent border border-neutral-700 hover:bg-neutral-800 disabled:opacity-50 text-neutral-300 py-3 rounded-xl text-sm transition-colors">
                Send magic link to {email || 'your email'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
