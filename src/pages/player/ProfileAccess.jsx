// HoopBase Player Profile — owner-only viewer manager.

import React from 'react'
import { Link, useParams } from 'react-router-dom'
import PlayerLayout, { getStoredTheme } from '@/layouts/PlayerLayout'
import {
  fetchHoopBaseProfile,
  listViewers,
  addViewer,
  removeViewer,
  fetchActiveConsent,
  revokeConsent,
} from '@/lib/playerProfiles'
import { useAuth } from '@/lib/AuthContext'

export default function PlayerProfileAccess() {
  const { uid } = useParams()
  const { supabaseUser } = useAuth()
  const [profile, setProfile] = React.useState(null)
  const [viewers, setViewers] = React.useState([])
  const [email, setEmail] = React.useState('')
  const [note, setNote] = React.useState('')
  const [error, setError] = React.useState(null)
  const [busy, setBusy] = React.useState(false)
  const [theme, setTheme] = React.useState(getStoredTheme())
  const [activeConsent, setActiveConsent] = React.useState(null)
  const [revokeConfirm, setRevokeConfirm] = React.useState(false)

  async function refresh() {
    const [p, v] = await Promise.all([fetchHoopBaseProfile(uid), listViewers(uid)])
    setProfile(p); setViewers(v)
    if (p?.theme && p.theme !== 'custom') setTheme(p.theme)
    if (p?.is_minor && p.id) {
      const c = await fetchActiveConsent(p.id)
      setActiveConsent(c)
    }
  }
  React.useEffect(() => { refresh() /* eslint-disable-next-line */ }, [uid])

  const me = String(supabaseUser?.email || '').toLowerCase()
  const isMinor = !!profile?.is_minor
  const isParent = !!(profile && me && String(profile.parent_email || '').toLowerCase() === me)
  const isOwnerEmail = !!(profile && me && String(profile.owner_email || '').toLowerCase() === me)
  const canManage = isMinor ? isParent : isOwnerEmail
  const consentNotApproved = isMinor && profile?.consent_status !== 'approved'
  const consentApproved = isMinor && profile?.consent_status === 'approved'

  async function onAdd(e) {
    e.preventDefault(); setError(null); setBusy(true)
    try {
      await addViewer(uid, email, { note: note || null, grantedBy: supabaseUser?.email || null })
      setEmail(''); setNote(''); await refresh()
    } catch (err) { setError(String(err?.message || err)) }
    finally { setBusy(false) }
  }

  async function onRemove(rowId) {
    setError(null); setBusy(true)
    try { await removeViewer(rowId); await refresh() }
    catch (err) { setError(String(err?.message || err)) }
    finally { setBusy(false) }
  }

  async function onRevokeConsent() {
    if (!activeConsent?.id || !profile?.id) return
    setError(null); setBusy(true)
    try { await revokeConsent(activeConsent.id, profile.id); setRevokeConfirm(false); await refresh() }
    catch (err) { setError(String(err?.message || err)) }
    finally { setBusy(false) }
  }

  const dark = theme === 'dark'
  const inputCls = `flex-1 rounded-md border px-3 py-2 text-sm ${dark ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-white border-neutral-300 text-neutral-900'}`
  const subtle = dark ? 'text-neutral-400' : 'text-neutral-500'
  const cardBg = dark ? 'border-neutral-800 bg-neutral-900' : 'border-neutral-200 bg-white'

  if (profile && !canManage) {
    return (
      <PlayerLayout theme={theme}>
        <div className="max-w-xl">
          <h1 className="text-2xl font-bold mb-2">Access manager</h1>
          <p className="text-sm">{isMinor
            ? 'Only the parent / guardian on file can grant viewer access for a player under 16.'
            : 'Only the profile owner can manage access.'}</p>
        </div>
      </PlayerLayout>
    )
  }

  return (
    <PlayerLayout theme={theme}>
      <div className="max-w-2xl space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Manage access</h1>
          <Link to={`/p/${uid}`} className="text-sm opacity-70 hover:opacity-100">← Back</Link>
        </div>
        <p className={`text-sm ${subtle}`}>
          Add anyone you want to share this profile with. They'll need to sign in to HoopBase with the same email to view it.
          {isMinor ? ' For a player under 16, only the parent / guardian on file can manage this list.' : ''}
        </p>
        {consentNotApproved ? (
          <div className={`p-3 rounded-md border text-sm ${dark ? 'border-orange-700 bg-orange-900/30 text-orange-200' : 'border-orange-300 bg-orange-50 text-orange-800'}`}>
            Viewer access is locked until parental consent is approved.
          </div>
        ) : null}
        <form onSubmit={onAdd} className="flex flex-col sm:flex-row gap-2">
          <input type="email" required placeholder="email@example.com" value={email} onChange={(e)=>setEmail(e.target.value)} className={inputCls} />
          <input type="text" placeholder="Note (optional)" value={note} onChange={(e)=>setNote(e.target.value)} className={inputCls} />
          <button type="submit" disabled={busy || !email} className="px-4 py-2 rounded-md bg-orange-600 text-white text-sm hover:bg-orange-700 disabled:opacity-50">
            {busy ? 'Saving…' : 'Grant access'}
          </button>
        </form>
        {error ? <p className="text-sm text-red-500">{error}</p> : null}
        <div className={`rounded-xl border ${cardBg}`}>
          {viewers.length === 0
            ? <p className={`text-sm ${subtle} p-4`}>No one else has access yet.</p>
            : (
              <ul>
                {viewers.map(v => (
                  <li key={v.id} className={`flex items-center justify-between px-4 py-2 border-b last:border-b-0 ${dark ? 'border-neutral-800' : 'border-neutral-100'}`}>
                    <div>
                      <div className="text-sm font-medium">{v.viewer_email}</div>
                      <div className={`text-xs ${subtle}`}>Added {v.granted_at ? new Date(v.granted_at).toLocaleDateString() : ''}{v.note ? ` · ${v.note}` : ''}</div>
                    </div>
                    <button onClick={() => onRemove(v.id)} disabled={busy} className="text-xs text-red-500 hover:underline">Remove</button>
                  </li>
                ))}
              </ul>
            )}
        </div>
        {isMinor && isParent && consentApproved && (
          <div className={`rounded-xl border p-4 ${cardBg}`}>
            <h2 className="text-sm font-semibold mb-1">Parental consent</h2>
            <p className={`text-sm ${subtle} mb-3`}>
              Consent is currently <span className="font-medium text-green-600">approved</span>.
              Withdrawing consent will immediately lock this profile.
            </p>
            {!revokeConfirm ? (
              <button onClick={() => setRevokeConfirm(true)}
                className={`text-sm px-3 py-1.5 rounded-md border ${dark ? 'border-red-800 text-red-400' : 'border-red-300 text-red-600'} hover:bg-red-50`}
              >Withdraw consent</button>
            ) : (
              <div className={`p-3 rounded-md border ${dark ? 'border-red-800 bg-red-900/20' : 'border-red-200 bg-red-50'}`}>
                <p className={`text-sm font-medium mb-3 ${dark ? 'text-red-300' : 'text-red-700'}`}>
                  Are you sure? This will immediately lock the profile and clear all viewer access.
                </p>
                <div className="flex gap-2">
                  <button onClick={onRevokeConsent} disabled={busy} className="px-3 py-1.5 rounded-md text-sm font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
                    {busy ? 'Revoking…' : 'Yes, withdraw consent'}
                  </button>
                  <button onClick={() => setRevokeConfirm(false)} className={`px-3 py-1.5 rounded-md text-sm border ${dark ? 'border-neutral-700 text-neutral-300' : 'border-neutral-300 text-neutral-600'}`}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </PlayerLayout>
  )
}
