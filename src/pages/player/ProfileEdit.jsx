// HoopBase Player Profile — owner-only edit.

import React from 'react'
import { Link, useParams } from 'react-router-dom'
import PlayerLayout, { getStoredTheme, setStoredTheme } from '@/layouts/PlayerLayout'
import {
  fetchHoopBaseProfile,
  updateProfile,
  listSeasons,
  createSeason,
  updateSeason,
  deleteSeason,
  listCareerGames,
  createGame,
  deleteGame,
  parseTimecode,
} from '@/lib/playerProfiles'
import { useAuth } from '@/lib/AuthContext'

const FIELDS = [
  { key: 'full_name',     label: 'Full name',  type: 'text' },
  { key: 'jersey_number', label: 'Jersey #',   type: 'text' },
  { key: 'hometown',      label: 'Hometown',   type: 'text' },
  { key: 'photo_url',     label: 'Profile photo URL', type: 'text' },
  { key: 'height_cm',     label: 'Height (cm)', type: 'number' },
  { key: 'weight_kg',     label: 'Weight (kg)', type: 'number' },
  { key: 'dominant_hand', label: 'Dominant hand (L/R)', type: 'text' },
  { key: 'bio',           label: 'Bio',        type: 'textarea' },
]

export default function PlayerProfileEdit() {
  const { uid } = useParams()
  const { supabaseUser } = useAuth()
  const [profile, setProfile] = React.useState(null)
  const [form, setForm] = React.useState({})
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState(null)
  const [theme, setTheme] = React.useState(getStoredTheme())
  const [seasons, setSeasons] = React.useState([])
  const [games, setGames] = React.useState([])

  async function refreshAll() {
    const [p, s, g] = await Promise.all([fetchHoopBaseProfile(uid), listSeasons(uid), listCareerGames(uid)])
    setProfile(p); setSeasons(s); setGames(g)
    if (p) {
      setForm({
        full_name: p.full_name || '',
        jersey_number: p.jersey_number || '',
        hometown: p.hometown || '',
        photo_url: p.photo_url || '',
        height_cm: p.height_cm ?? '',
        weight_kg: p.weight_kg ?? '',
        dominant_hand: p.dominant_hand || '',
        bio: p.bio || '',
        theme: p.theme || 'light',
        theme_config: p.theme_config || { mode: 'dark', accent: '#ea580c' },
        is_public: !!p.is_public,
      })
      if (p.theme) setTheme(p.theme)
    }
  }
  React.useEffect(() => { refreshAll() /* eslint-disable-next-line */ }, [uid])

  const me = String(supabaseUser?.email || '').toLowerCase()
  const isOwnerEmail = !!(profile && me && String(profile.owner_email || '').toLowerCase() === me)
  const isParent = !!(profile && me && String(profile.parent_email || '').toLowerCase() === me)
  const isOwner = isOwnerEmail || isParent
  const isMinor = !!profile?.is_minor
  const consentBlocked = isMinor && profile?.consent_status !== 'approved'

  async function onSaveBio(e) {
    e?.preventDefault?.()
    setSaving(true); setError(null)
    try {
      const patch = {}
      for (const f of FIELDS) {
        let v = form[f.key]
        if (f.type === 'number') v = v === '' ? null : Number(v)
        if (typeof v === 'string') v = v.trim() || null
        patch[f.key] = v
      }
      patch.theme = form.theme || 'light'
      patch.theme_config = form.theme_config || null
      patch.is_public = isMinor ? false : !!form.is_public
      await updateProfile(uid, patch)
      setStoredTheme(patch.theme)
      await refreshAll()
    } catch (err) {
      setError(String(err?.message || err))
    } finally {
      setSaving(false)
    }
  }

  if (profile && !isOwner) {
    return <PlayerLayout theme={theme}><p className="text-sm">You don't own this profile.</p></PlayerLayout>
  }

  const dark = theme === 'dark'
  const inputCls = `w-full rounded-md border px-3 py-2 text-sm ${dark ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-white border-neutral-300 text-neutral-900'}`
  const cardCls = `rounded-xl border p-5 ${dark ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-neutral-200'}`

  return (
    <PlayerLayout theme={theme}>
      <div className="max-w-3xl mx-auto">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Edit profile</h1>
          <Link to={`/p/${uid}`} className="text-sm opacity-70 hover:opacity-100">← Back to profile</Link>
        </div>
        {error ? <p className="text-sm text-red-500 mb-3">{error}</p> : null}
        {!profile ? <p className="text-sm opacity-60">Loading…</p> : (
          <div className="space-y-6">
            <form onSubmit={onSaveBio} className={`${cardCls} space-y-4`}>
              <h2 className="text-sm font-semibold">Bio · photo · theme</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {FIELDS.map(f => (
                  <label key={f.key} className={`block ${f.type === 'textarea' ? 'sm:col-span-2' : ''}`}>
                    <span className="text-xs font-medium opacity-70 mb-1 block">{f.label}</span>
                    {f.type === 'textarea'
                      ? <textarea rows={3} value={form[f.key] ?? ''} onChange={(e)=>setForm({...form,[f.key]:e.target.value})} className={inputCls} />
                      : <input type={f.type} value={form[f.key] ?? ''} onChange={(e)=>setForm({...form,[f.key]:e.target.value})} className={inputCls} />}
                  </label>
                ))}
              </div>
              <div>
                <span className="text-xs font-medium opacity-70 mb-1 block">Theme</span>
                <div className="flex gap-2 flex-wrap">
                  {[['light','Light'],['dark','Dark'],['custom','Custom']].map(([t, label]) => (
                    <button key={t} type="button"
                      onClick={() => {
                        const cfg = t === 'custom'
                          ? (form.theme_config || { mode: 'dark', accent: '#ea580c' })
                          : form.theme_config
                        setForm({...form, theme: t, theme_config: cfg})
                        setTheme(t)
                        if (t !== 'custom') setStoredTheme(t)
                      }}
                      className={`px-3 py-1.5 rounded-md text-sm border ${form.theme === t ? 'bg-orange-600 text-white border-orange-700' : (dark ? 'border-neutral-700' : 'border-neutral-300')}`}
                    >{label}</button>
                  ))}
                </div>
                {form.theme === 'custom' && (
                  <div className="mt-3 flex flex-wrap gap-4 items-center">
                    <label className="flex items-center gap-2 text-xs">
                      <span className="opacity-70">Accent colour</span>
                      <input type="color" value={form.theme_config?.accent || '#ea580c'}
                        onChange={e => setForm({...form, theme_config: {...(form.theme_config || {}), accent: e.target.value}})}
                        className="w-8 h-8 rounded cursor-pointer border-0 p-0.5" />
                    </label>
                    <div className="flex gap-2">
                      {[['light','Light bg'],['dark','Dark bg']].map(([m, label]) => (
                        <button key={m} type="button"
                          onClick={() => setForm({...form, theme_config: {...(form.theme_config || {}), mode: m}})}
                          className={`px-2.5 py-1 rounded text-xs border ${(form.theme_config?.mode || 'dark') === m ? 'bg-orange-600 text-white border-orange-700' : (dark ? 'border-neutral-700' : 'border-neutral-300')}`}
                        >{label}</button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className={`p-3 rounded-md border ${dark ? 'border-neutral-700 bg-neutral-950' : 'border-neutral-200 bg-neutral-50'}`}>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="checkbox" checked={!!form.is_public} disabled={isMinor}
                    onChange={(e) => setForm({ ...form, is_public: e.target.checked })} className="mt-0.5" />
                  <span className="text-xs">
                    <span className="font-medium">Public profile</span>
                    <span className="opacity-60 block mt-0.5">
                      {isMinor
                        ? 'Profiles for under-16s cannot be made public.'
                        : 'When ON, anyone with the link can view this profile. Otherwise only you and people you invite can view.'}
                    </span>
                  </span>
                </label>
              </div>
              <button type="submit" disabled={saving} className="px-4 py-2 rounded-md bg-orange-600 text-white text-sm hover:bg-orange-700 disabled:opacity-50">
                {saving ? 'Saving…' : 'Save bio'}
              </button>
            </form>

            {consentBlocked ? (
              <div className={`p-4 rounded-md border text-sm ${dark ? 'border-orange-700 bg-orange-900/30 text-orange-200' : 'border-orange-300 bg-orange-50 text-orange-800'}`}>
                <strong>Seasons and games are locked.</strong> Parental consent must be confirmed before any data can be added to this profile.
              </div>
            ) : (
              <SeasonsSection profileId={uid} seasons={seasons} games={games} dark={dark} cardCls={cardCls} inputCls={inputCls} onChanged={refreshAll} />
            )}
          </div>
        )}
      </div>
    </PlayerLayout>
  )
}

function SeasonsSection({ profileId, seasons, games, dark, cardCls, inputCls, onChanged }) {
  const [adding, setAdding] = React.useState(false)
  const [draft, setDraft] = React.useState({ year: new Date().getFullYear(), team_name: '', league: '', age_group: '', jersey_number: '', photo_url: '' })
  const [err, setErr] = React.useState(null)

  async function onAdd(e) {
    e.preventDefault(); setErr(null)
    try { await createSeason(profileId, draft); setDraft({ year: new Date().getFullYear(), team_name: '', league: '', age_group: '', jersey_number: '', photo_url: '' }); setAdding(false); onChanged() }
    catch (e2) { setErr(String(e2?.message || e2)) }
  }
  async function onDelete(id) {
    if (!confirm('Delete this season and all its games?')) return
    try { await deleteSeason(id); onChanged() } catch (e) { setErr(String(e?.message || e)) }
  }

  return (
    <section className={cardCls}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold">Seasons</h2>
        <button onClick={() => setAdding(v => !v)} className="text-xs px-3 py-1.5 rounded-md border">{adding ? 'Cancel' : '+ Add season'}</button>
      </div>
      {adding ? (
        <form onSubmit={onAdd} className={`mb-4 p-3 rounded-md border ${dark ? 'border-neutral-700 bg-neutral-950' : 'border-neutral-200 bg-neutral-50'} space-y-2`}>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <FNum  label="Year"      value={draft.year}          onChange={v=>setDraft({...draft,year:v})}           inputCls={inputCls} required />
            <FText label="Team"      value={draft.team_name}     onChange={v=>setDraft({...draft,team_name:v})}     inputCls={inputCls} required />
            <FText label="League"    value={draft.league}        onChange={v=>setDraft({...draft,league:v})}        inputCls={inputCls} />
            <FText label="Age group" value={draft.age_group}     onChange={v=>setDraft({...draft,age_group:v})}     inputCls={inputCls} />
            <FText label="Jersey #"  value={draft.jersey_number} onChange={v=>setDraft({...draft,jersey_number:v})} inputCls={inputCls} />
            <FText label="Photo URL" value={draft.photo_url}     onChange={v=>setDraft({...draft,photo_url:v})}     inputCls={inputCls} />
          </div>
          {err ? <p className="text-xs text-red-500">{err}</p> : null}
          <button type="submit" className="px-3 py-1.5 rounded-md bg-orange-600 text-white text-xs">Save season</button>
        </form>
      ) : null}
      {seasons.length === 0 && !adding ? <p className="text-sm opacity-60">No seasons yet. Add one to start logging games.</p> : null}
      <div className="space-y-3">
        {seasons.map(s => (
          <SeasonCard key={s.id} season={s} games={games.filter(g => g.season_id === s.id)} profileId={profileId} dark={dark} inputCls={inputCls} onDelete={() => onDelete(s.id)} onChanged={onChanged} />
        ))}
      </div>
    </section>
  )
}

function SeasonCard({ season, games, profileId, dark, inputCls, onDelete, onChanged }) {
  const [open, setOpen] = React.useState(false)
  const [editing, setEditing] = React.useState(false)
  const [edraft, setEdraft] = React.useState({ ...season })
  const [err, setErr] = React.useState(null)

  React.useEffect(() => { setEdraft({ ...season }) }, [season])

  async function onSaveSeason(e) {
    e.preventDefault(); setErr(null)
    try {
      await updateSeason(season.id, {
        year: Number(edraft.year),
        team_name: String(edraft.team_name || '').trim(),
        league: edraft.league || null,
        age_group: edraft.age_group || null,
        jersey_number: edraft.jersey_number || null,
        photo_url: edraft.photo_url || null,
      })
      setEditing(false); onChanged()
    } catch (e2) { setErr(String(e2?.message || e2)) }
  }

  return (
    <div className={`rounded-lg border ${dark ? 'border-neutral-800 bg-neutral-950' : 'border-neutral-200 bg-neutral-50'}`}>
      <div className="flex items-center justify-between px-3 py-2">
        <button onClick={() => setOpen(v => !v)} className="text-left flex-1">
          <div className="font-medium text-sm">{season.year} · {season.team_name}</div>
          <div className="text-xs opacity-60">{[season.league, season.age_group, season.jersey_number ? `#${season.jersey_number}` : null].filter(Boolean).join(' · ')} · {games.length} game{games.length === 1 ? '' : 's'}</div>
        </button>
        <div className="flex gap-1">
          <button onClick={() => setEditing(v => !v)} className="text-xs px-2 py-1 rounded border">{editing ? 'Cancel' : 'Edit'}</button>
          <button onClick={onDelete} className="text-xs px-2 py-1 rounded border text-red-500">Delete</button>
        </div>
      </div>
      {editing ? (
        <form onSubmit={onSaveSeason} className={`px-3 pb-3 space-y-2 border-t ${dark ? 'border-neutral-800' : 'border-neutral-200'}`}>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2">
            <FNum  label="Year"      value={edraft.year}               onChange={v=>setEdraft({...edraft,year:v})}           inputCls={inputCls} required />
            <FText label="Team"      value={edraft.team_name}          onChange={v=>setEdraft({...edraft,team_name:v})}     inputCls={inputCls} required />
            <FText label="League"    value={edraft.league || ''}       onChange={v=>setEdraft({...edraft,league:v})}        inputCls={inputCls} />
            <FText label="Age group" value={edraft.age_group || ''}    onChange={v=>setEdraft({...edraft,age_group:v})}     inputCls={inputCls} />
            <FText label="Jersey #"  value={edraft.jersey_number || ''} onChange={v=>setEdraft({...edraft,jersey_number:v})} inputCls={inputCls} />
            <FText label="Photo URL" value={edraft.photo_url || ''}    onChange={v=>setEdraft({...edraft,photo_url:v})}     inputCls={inputCls} />
          </div>
          {err ? <p className="text-xs text-red-500">{err}</p> : null}
          <button type="submit" className="px-3 py-1.5 rounded-md bg-orange-600 text-white text-xs">Save</button>
        </form>
      ) : null}
      {open ? <GamesSubsection profileId={profileId} season={season} games={games} dark={dark} inputCls={inputCls} onChanged={onChanged} /> : null}
    </div>
  )
}

function GamesSubsection({ profileId, season, games, dark, inputCls, onChanged }) {
  const [adding, setAdding] = React.useState(false)
  const [draft, setDraft] = React.useState(emptyGame())
  const [err, setErr] = React.useState(null)
  const subtle = dark ? 'text-neutral-400' : 'text-neutral-500'

  async function onAdd(e) {
    e.preventDefault(); setErr(null)
    try {
      await createGame(profileId, {
        season_id: season.id,
        played_on: draft.played_on || null,
        opponent: draft.opponent || null,
        home_or_away: draft.home_or_away || null,
        result: draft.result || null,
        team_score: numOrNull(draft.team_score),
        opponent_score: numOrNull(draft.opponent_score),
        stats: {
          points: numOrNull(draft.points), rebounds: numOrNull(draft.rebounds),
          assists: numOrNull(draft.assists), steals: numOrNull(draft.steals),
          blocks: numOrNull(draft.blocks), minutes: numOrNull(draft.minutes),
        },
        video_url: draft.video_url || null,
        video_timecode_seconds: draft.video_timecode ? parseTimecode(draft.video_timecode) : null,
      })
      setDraft(emptyGame()); setAdding(false); onChanged()
    } catch (e2) { setErr(String(e2?.message || e2)) }
  }

  async function onDel(id) {
    if (!confirm('Delete this game?')) return
    try { await deleteGame(id); onChanged() } catch (e) { setErr(String(e?.message || e)) }
  }

  return (
    <div className={`px-3 pb-3 border-t ${dark ? 'border-neutral-800' : 'border-neutral-200'}`}>
      <div className="flex items-center justify-between py-2">
        <span className="text-xs font-semibold">Games</span>
        <button onClick={() => setAdding(v => !v)} className="text-xs px-2 py-1 rounded border">{adding ? 'Cancel' : '+ Add game'}</button>
      </div>
      {adding ? (
        <form onSubmit={onAdd} className={`p-3 rounded-md border ${dark ? 'border-neutral-700 bg-neutral-900' : 'border-neutral-200 bg-white'} space-y-2 mb-3`}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <FDate   label="Date"       value={draft.played_on}    onChange={v=>setDraft({...draft, played_on:v})}    inputCls={inputCls} />
            <FText   label="Opponent"   value={draft.opponent}     onChange={v=>setDraft({...draft, opponent:v})}     inputCls={inputCls} />
            <FSelect label="H/A/N"      value={draft.home_or_away} onChange={v=>setDraft({...draft, home_or_away:v})} inputCls={inputCls} options={[['','—'],['home','Home'],['away','Away'],['neutral','Neutral']]} />
            <FSelect label="W/L/D"      value={draft.result}       onChange={v=>setDraft({...draft, result:v})}       inputCls={inputCls} options={[['','—'],['W','W'],['L','L'],['D','D']]} />
            <FNum    label="Team score"  value={draft.team_score}     onChange={v=>setDraft({...draft, team_score:v})}     inputCls={inputCls} />
            <FNum    label="Opp score"   value={draft.opponent_score} onChange={v=>setDraft({...draft, opponent_score:v})} inputCls={inputCls} />
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {[['PTS','points'],['REB','rebounds'],['AST','assists'],['STL','steals'],['BLK','blocks'],['MIN','minutes']].map(([lbl, key]) => (
              <FNum key={key} label={lbl} value={draft[key]} onChange={v=>setDraft({...draft,[key]:v})} inputCls={inputCls} />
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <FText label="Video URL" value={draft.video_url} onChange={v=>setDraft({...draft, video_url:v})} inputCls={inputCls} />
            <FText label="Timecode (mm:ss or seconds)" value={draft.video_timecode} onChange={v=>setDraft({...draft, video_timecode:v})} inputCls={inputCls} />
          </div>
          {err ? <p className="text-xs text-red-500">{err}</p> : null}
          <button type="submit" className="px-3 py-1.5 rounded-md bg-orange-600 text-white text-xs">Save game</button>
        </form>
      ) : null}
      {games.length === 0 && !adding ? <p className={`text-xs ${subtle}`}>No games for this season.</p> : null}
      {games.length > 0 ? (
        <ul className="text-xs space-y-1">
          {games.map(g => (
            <li key={g.id} className={`flex items-center justify-between px-2 py-1.5 rounded border ${dark ? 'border-neutral-800' : 'border-neutral-200'}`}>
              <span className="truncate">
                <span className="font-medium">{g.played_on || '—'}</span> · {g.opponent || '—'} · {g.result || ''}
                {g.team_score != null && g.opponent_score != null ? ` ${g.team_score}-${g.opponent_score}` : ''}
                {' '}· {g.stats?.points ?? 0}pts {g.stats?.rebounds ?? 0}reb {g.stats?.assists ?? 0}ast
              </span>
              <button onClick={() => onDel(g.id)} className="text-red-500 ml-2">Delete</button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function FText({ label, value, onChange, inputCls, required }) {
  return <label className="block"><span className="text-[10px] uppercase opacity-70 mb-0.5 block">{label}</span><input type="text" value={value ?? ''} onChange={e=>onChange(e.target.value)} className={inputCls} required={required} /></label>
}
function FNum({ label, value, onChange, inputCls, required }) {
  return <label className="block"><span className="text-[10px] uppercase opacity-70 mb-0.5 block">{label}</span><input type="number" value={value ?? ''} onChange={e=>onChange(e.target.value)} className={inputCls} required={required} /></label>
}
function FDate({ label, value, onChange, inputCls }) {
  return <label className="block"><span className="text-[10px] uppercase opacity-70 mb-0.5 block">{label}</span><input type="date" value={value ?? ''} onChange={e=>onChange(e.target.value)} className={inputCls} /></label>
}
function FSelect({ label, value, onChange, options, inputCls }) {
  return <label className="block"><span className="text-[10px] uppercase opacity-70 mb-0.5 block">{label}</span><select value={value ?? ''} onChange={e=>onChange(e.target.value)} className={inputCls}>{options.map(([v, lbl]) => <option key={v} value={v}>{lbl}</option>)}</select></label>
}

function emptyGame() {
  return { played_on: '', opponent: '', home_or_away: '', result: '', team_score: '', opponent_score: '', points: '', rebounds: '', assists: '', steals: '', blocks: '', minutes: '', video_url: '', video_timecode: '' }
}
function numOrNull(v) {
  if (v === '' || v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
