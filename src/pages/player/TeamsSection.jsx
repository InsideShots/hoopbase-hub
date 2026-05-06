// Teams section — shows linked teams + auto-suggested links.

import React from 'react'
import {
  listLinkedTeams,
  listLinkCandidates,
  linkPlayerToProfile,
  unlinkPlayerFromProfile,
} from '@/lib/playerProfiles'

export default function TeamsSection({ profile, isOwner, dark }) {
  const cardBg = dark ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-neutral-200'
  const subtle = dark ? 'text-neutral-400' : 'text-neutral-500'
  const [linked, setLinked] = React.useState([])
  const [candidates, setCandidates] = React.useState([])
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState(null)

  async function refresh() {
    if (!profile?.id) return
    const [l, c] = await Promise.all([
      listLinkedTeams(profile.id),
      isOwner ? listLinkCandidates(profile.id) : Promise.resolve([]),
    ])
    setLinked(l)
    setCandidates(c)
  }
  React.useEffect(() => { refresh() /* eslint-disable-next-line */ }, [profile?.id, isOwner])

  const linkedPlayerIds = new Set(linked.map(p => p.id))
  const newSuggestions = candidates.filter(c => !c.already_linked_to && !linkedPlayerIds.has(c.player_id))

  if (linked.length === 0 && newSuggestions.length === 0) return null

  async function onLink(playerId) {
    setError(null); setBusy(true)
    try { await linkPlayerToProfile(playerId, profile.id); await refresh() }
    catch (e) { setError(String(e?.message || e)) }
    finally { setBusy(false) }
  }
  async function onUnlink(playerId) {
    if (!confirm('Unlink this team from your HoopBase profile?')) return
    setError(null); setBusy(true)
    try { await unlinkPlayerFromProfile(playerId); await refresh() }
    catch (e) { setError(String(e?.message || e)) }
    finally { setBusy(false) }
  }

  return (
    <section className={`rounded-xl border ${cardBg} p-4`}>
      <h2 className="text-sm font-semibold mb-3">Teams</h2>
      {error ? <p className="text-xs text-red-500 mb-2">{error}</p> : null}

      {linked.length > 0 ? (
        <ul className="space-y-1 mb-3">
          {linked.map(p => (
            <li key={p.id} className={`flex items-center justify-between text-sm px-2 py-1.5 rounded border ${dark ? 'border-neutral-800' : 'border-neutral-100'}`}>
              <span>
                <strong>{p.teams?.name || 'Team'}</strong>
                <span className={`ml-2 ${subtle}`}>· {p.name}{p.jersey_number ? ` #${p.jersey_number}` : ''}</span>
              </span>
              {isOwner ? (
                <button onClick={() => onUnlink(p.id)} disabled={busy} className="text-xs text-red-500 hover:underline">Unlink</button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {isOwner && newSuggestions.length > 0 ? (
        <div className={`rounded-md border ${dark ? 'border-orange-700 bg-orange-900/20' : 'border-orange-300 bg-orange-50'} p-3`}>
          <div className="text-xs font-semibold mb-2">Suggested links — looks like you're already on these teams:</div>
          <ul className="space-y-1">
            {newSuggestions.map(c => (
              <li key={c.player_id} className="flex items-center justify-between text-sm">
                <span><strong>{c.team_name || 'Team'}</strong> <span className={subtle}>· {c.player_name}</span></span>
                <button onClick={() => onLink(c.player_id)} disabled={busy} className="text-xs px-2 py-1 rounded-md bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50">
                  Link
                </button>
              </li>
            ))}
          </ul>
          <p className={`text-[10px] mt-2 ${subtle}`}>Linking only attaches a pointer — it does not grant the team admin viewer access to your profile.</p>
        </div>
      ) : null}
    </section>
  )
}
