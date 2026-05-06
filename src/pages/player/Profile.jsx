// HoopBase Player Profile — NBA.com-style page.

import React from 'react'
import { Link, useParams } from 'react-router-dom'
import PlayerLayout, { getStoredTheme } from '@/layouts/PlayerLayout'
import {
  fetchHoopBaseProfile,
  listSeasons,
  listCareerGames,
  computeCareerAverages,
  backfillProfileStats,
} from '@/lib/playerProfiles'
import { useAuth } from '@/lib/AuthContext'
import TeamsSection from '@/pages/player/TeamsSection'

const TABS = [
  { id: 'stats',   label: 'Stats' },
  { id: 'gamelog', label: 'Game Log' },
  { id: 'splits',  label: 'Splits' },
  { id: 'bio',     label: 'Bio' },
  { id: 'teams',   label: 'Teams' },
]

function computeProfileOgTags(profile, averages = {}) {
  const name = profile.full_name || 'HoopBase Player'
  const positions = Array.isArray(profile.positions) ? profile.positions.filter(Boolean).join('/') : ''
  const jersey = profile.jersey_number ? `#${profile.jersey_number}` : ''
  const ppg = averages.ppg != null ? `${averages.ppg.toFixed(1)} PPG` : null
  const rpg = averages.rpg != null ? `${averages.rpg.toFixed(1)} RPG` : null
  const apg = averages.apg != null ? `${averages.apg.toFixed(1)} APG` : null
  const stats = [ppg, rpg, apg].filter(Boolean).join(' · ')
  const titleParts = [name, jersey, positions].filter(Boolean).join(' ')
  const title = `${titleParts} | HoopBase`
  const desc = stats || profile.bio || `${name}'s HoopBase player profile — career stats, game log and highlights.`
  const image = profile.photo_url || profile.player_photo_url || ''
  const url = typeof window !== 'undefined' ? window.location.href : ''
  return { title, desc, image, url }
}

function applyOgMetaTags({ title, desc, image, url }) {
  if (typeof document === 'undefined') return () => {}
  const prevTitle = document.title
  if (title) document.title = title
  const tags = [
    { sel: 'meta[property="og:title"]',        attr: 'property', name: 'og:title',          value: title },
    { sel: 'meta[property="og:description"]',  attr: 'property', name: 'og:description',    value: desc },
    { sel: 'meta[property="og:type"]',         attr: 'property', name: 'og:type',           value: 'profile' },
    { sel: 'meta[property="og:url"]',          attr: 'property', name: 'og:url',            value: url },
    { sel: 'meta[property="og:image"]',        attr: 'property', name: 'og:image',          value: image },
    { sel: 'meta[name="twitter:card"]',        attr: 'name',     name: 'twitter:card',      value: image ? 'summary_large_image' : 'summary' },
    { sel: 'meta[name="twitter:title"]',       attr: 'name',     name: 'twitter:title',     value: title },
    { sel: 'meta[name="twitter:description"]', attr: 'name',     name: 'twitter:description', value: desc },
    { sel: 'meta[name="twitter:image"]',       attr: 'name',     name: 'twitter:image',     value: image },
  ]
  const undo = []
  for (const t of tags) {
    if (!t.value) continue
    let el = document.head.querySelector(t.sel)
    if (el) {
      const prev = el.getAttribute('content')
      el.setAttribute('content', t.value)
      undo.push(() => el.setAttribute('content', prev || ''))
    } else {
      el = document.createElement('meta')
      el.setAttribute(t.attr, t.name)
      el.setAttribute('content', t.value)
      el.setAttribute('data-hb-og', '1')
      document.head.appendChild(el)
      undo.push(() => el.remove())
    }
  }
  return () => {
    document.title = prevTitle
    undo.forEach((fn) => { try { fn() } catch {} })
  }
}

function formatDate(iso) {
  if (!iso) return ''
  try {
    const d = new Date(iso + 'T00:00:00')
    return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
  } catch { return iso }
}

function formatTimecode(seconds) {
  const s = Number(seconds)
  if (!Number.isFinite(s) || s < 0) return ''
  const m = Math.floor(s / 60)
  const r = Math.floor(s % 60).toString().padStart(2, '0')
  return `${m}:${r}`
}

function videoUrlWithTimecode(url, seconds) {
  if (!url) return null
  const s = Number(seconds)
  if (!Number.isFinite(s) || s <= 0) return url
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    const sep = url.includes('?') ? '&' : '?'
    return `${url}${sep}t=${Math.floor(s)}`
  }
  return `${url}#t=${Math.floor(s)}`
}

function SyncStatsButton({ profileId, dark }) {
  const [busy, setBusy] = React.useState(false)
  const [msg, setMsg] = React.useState(null)
  const [err, setErr] = React.useState(null)
  async function run() {
    setBusy(true); setMsg(null); setErr(null)
    try {
      const res = await backfillProfileStats(profileId)
      const r = Array.isArray(res) ? res[0] : res
      setMsg(`Synced: ${r?.linked_players ?? 0} player link${r?.linked_players === 1 ? '' : 's'} → ${r?.inserted_games ?? 0} new, ${r?.updated_games ?? 0} updated.`)
      setTimeout(() => window.location.reload(), 1200)
    } catch (e) {
      setErr(String(e?.message || e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <button
        type="button" onClick={run} disabled={busy}
        className={`text-xs px-3 py-1.5 rounded-md border ${dark ? 'border-neutral-700 hover:bg-neutral-800' : 'border-neutral-300 hover:bg-neutral-100'} disabled:opacity-50`}
      >
        {busy ? 'Syncing…' : 'Sync stats from team'}
      </button>
      {msg ? <span className="text-[10px] text-emerald-600">{msg}</span> : null}
      {err ? <span className="text-[10px] text-red-600">{err}</span> : null}
    </>
  )
}

function HeroCard({ profile, averages, dark, isOwner, accentColor = '#ea580c' }) {
  const avatarBg = dark ? 'bg-neutral-800' : 'bg-neutral-200'
  const subtle   = dark ? 'text-neutral-400' : 'text-neutral-500'
  const heroBg   = dark ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-neutral-200'
  const statBg   = dark ? 'bg-neutral-800/60' : 'bg-neutral-100'
  const photo = profile.photo_url || profile.player_photo_url
  const positions = Array.isArray(profile.positions) ? profile.positions.filter(Boolean) : []

  return (
    <div className={`rounded-2xl border ${heroBg} overflow-hidden mb-5`}>
      <div className="h-1 w-full" style={{ background: `linear-gradient(90deg,${accentColor},#f97316)` }} />
      <div className="p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row gap-5 items-start">
          <div className={`w-28 h-28 sm:w-36 sm:h-36 rounded-2xl overflow-hidden flex-shrink-0 ${avatarBg}`} style={{ border: `2px solid ${accentColor}22` }}>
            {photo
              ? <img src={photo} alt={profile.full_name} className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center font-black opacity-30" style={{ fontSize: '3rem' }}>{(profile.full_name || '?').slice(0,1)}</div>}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight">{profile.full_name}</h1>
              {profile.jersey_number ? (
                <span className="text-xl font-bold" style={{ color: 'var(--hb-accent)' }}>#{profile.jersey_number}</span>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              {positions.map(p => (
                <span key={p} className="px-2 py-0.5 rounded text-xs font-semibold" style={{ background: 'var(--hb-accent)', color: '#fff' }}>{p}</span>
              ))}
              {profile.height_cm ? <span className={`text-xs ${subtle}`}>{profile.height_cm} cm</span> : null}
              {profile.dominant_hand ? <span className={`text-xs ${subtle}`}>{profile.dominant_hand[0].toUpperCase()}-hand</span> : null}
              {profile.hometown ? <span className={`text-xs ${subtle}`}>{profile.hometown}</span> : null}
              {profile.public_uid ? (
                <span className={`text-xs font-mono px-1.5 py-0.5 rounded border ${dark ? 'border-neutral-700 text-neutral-500' : 'border-neutral-300 text-neutral-400'}`}>
                  HB-{profile.public_uid}
                </span>
              ) : null}
            </div>
            {averages.gp > 0 && (
              <div className="mt-4 grid grid-cols-3 sm:grid-cols-6 gap-2">
                {[['GP', averages.gp], ['PPG', averages.ppg], ['RPG', averages.rpg], ['APG', averages.apg], ['SPG', averages.spg], ['MPG', averages.mpg]].map(([lbl, val]) => (
                  <div key={lbl} className={`rounded-lg px-2.5 py-2 text-center ${statBg}`}>
                    <div className={`text-[10px] uppercase tracking-wide ${subtle}`}>{lbl}</div>
                    <div className="text-base font-bold leading-tight mt-0.5">{val ?? '—'}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {isOwner ? (
            <div className="flex sm:flex-col flex-row gap-2 shrink-0">
              <Link to={`/p/${profile.id}/edit`} className="text-xs px-3 py-1.5 rounded-md font-semibold" style={{ background: 'var(--hb-accent)', color: '#fff' }}>Edit</Link>
              <Link to={`/p/${profile.id}/access`} className={`text-xs px-3 py-1.5 rounded-md font-semibold border ${dark ? 'border-neutral-700 text-neutral-300' : 'border-neutral-300 text-neutral-600'}`}>Access</Link>
              <SyncStatsButton profileId={profile.id} dark={dark} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function TabBar({ active, onChange, dark }) {
  const inactive = dark ? 'text-neutral-400 hover:text-white' : 'text-neutral-500 hover:text-neutral-900'
  const activeCls = dark ? 'text-white border-orange-400' : 'text-neutral-900 border-orange-600'
  return (
    <div className={`flex gap-1 overflow-x-auto border-b ${dark ? 'border-neutral-800' : 'border-neutral-200'} mb-4`}>
      {TABS.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)}
          className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${active === t.id ? activeCls : `${inactive} border-transparent`}`}
        >{t.label}</button>
      ))}
    </div>
  )
}

function PhotoStrip({ seasons, dark }) {
  const withPhoto = seasons.filter(s => s.photo_url)
  if (!withPhoto.length) return null
  const subtle = dark ? 'text-neutral-400' : 'text-neutral-500'
  return (
    <div className="flex gap-3 overflow-x-auto pb-2 mb-2">
      {withPhoto.map(s => (
        <div key={s.id} className="flex-shrink-0 w-24 text-center">
          <div className={`w-24 h-24 rounded-lg overflow-hidden ${dark ? 'bg-neutral-800' : 'bg-neutral-200'}`}>
            <img src={s.photo_url} alt={`${s.year} ${s.team_name}`} className="w-full h-full object-cover" />
          </div>
          <div className="text-xs font-medium mt-1">{s.year}</div>
          <div className={`text-[10px] ${subtle} truncate`}>{s.team_name}</div>
        </div>
      ))}
    </div>
  )
}

function computeSeasonAverages(games, season) {
  const sg = games.filter(g => g.season_id === season.id)
  if (!sg.length) return null
  return { ...computeCareerAverages(sg), season }
}

function StatsTab({ seasons, games, dark }) {
  const cardBg = dark ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-neutral-200'
  const subtle = dark ? 'text-neutral-400' : 'text-neutral-500'
  const rowBorder = dark ? 'border-t border-neutral-800' : 'border-t border-neutral-100'
  const career = computeCareerAverages(games)
  const seasonRows = seasons
    .map(s => computeSeasonAverages(games, s))
    .filter(Boolean)
    .sort((a, b) => (b.season.year || 0) - (a.season.year || 0))

  return (
    <div className="space-y-5">
      {games.length > 0 && (
        <section className={`rounded-xl border ${cardBg} p-4`}>
          <h2 className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--hb-accent)' }}>Career Averages</h2>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            {[['GP', career.gp], ['PPG', career.ppg], ['RPG', career.rpg], ['APG', career.apg], ['SPG', career.spg], ['MPG', career.mpg]].map(([lbl, val]) => (
              <div key={lbl} className={`rounded-lg px-3 py-2 ${dark ? 'bg-neutral-800/60' : 'bg-neutral-100'}`}>
                <div className={`text-xs ${subtle}`}>{lbl}</div>
                <div className="text-lg font-bold leading-tight">{val ?? '—'}</div>
              </div>
            ))}
          </div>
        </section>
      )}
      <section className={`rounded-xl border ${cardBg} p-4`}>
        <h2 className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--hb-accent)' }}>By Season</h2>
        {seasonRows.length === 0
          ? <p className={`text-sm ${subtle}`}>No season data yet.</p>
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={`text-left text-xs ${subtle}`}>
                    {['Year','Team','#','GP','PPG','RPG','APG','SPG','MPG'].map(h => (
                      <th key={h} className="py-1 pr-3 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {seasonRows.map(({ season, gp, ppg, rpg, apg, spg, mpg }) => (
                    <tr key={season.id} className={rowBorder}>
                      <td className="py-1.5 pr-3 font-medium">{season.year}</td>
                      <td className="py-1.5 pr-3">{season.team_name}</td>
                      <td className="py-1.5 pr-3 text-xs">{season.jersey_number || '—'}</td>
                      <td className="py-1.5 pr-2 text-right">{gp}</td>
                      <td className="py-1.5 pr-2 text-right">{ppg}</td>
                      <td className="py-1.5 pr-2 text-right">{rpg}</td>
                      <td className="py-1.5 pr-2 text-right">{apg}</td>
                      <td className="py-1.5 pr-2 text-right">{spg}</td>
                      <td className="py-1.5 pr-2 text-right">{mpg}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        {seasons.some(s => s.photo_url) && (
          <div className="mt-4 pt-3 border-t" style={{ borderColor: dark ? '#262626' : '#f5f5f5' }}>
            <div className={`text-xs font-medium mb-2 ${subtle}`}>Year by year</div>
            <PhotoStrip seasons={seasons} dark={dark} />
          </div>
        )}
      </section>
    </div>
  )
}

function BioTab({ profile, dark }) {
  const cardBg = dark ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-neutral-200'
  const subtle = dark ? 'text-neutral-400' : 'text-neutral-500'
  const positions = Array.isArray(profile.positions) ? profile.positions.filter(Boolean).join(' / ') : ''
  const rows = [
    ['Position', positions],
    ['Jersey', profile.jersey_number ? `#${profile.jersey_number}` : null],
    ['Height', profile.height_cm ? `${profile.height_cm} cm` : null],
    ['Weight', profile.weight_kg ? `${profile.weight_kg} kg` : null],
    ['Dominant hand', profile.dominant_hand],
    ['Hometown', profile.hometown],
  ].filter(([, v]) => v)

  return (
    <div className="space-y-5">
      {profile.bio && (
        <section className={`rounded-xl border ${cardBg} p-4`}>
          <h2 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--hb-accent)' }}>About</h2>
          <p className="text-sm leading-relaxed">{profile.bio}</p>
        </section>
      )}
      {rows.length > 0 && (
        <section className={`rounded-xl border ${cardBg} p-4`}>
          <h2 className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--hb-accent)' }}>Profile</h2>
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
            {rows.map(([label, value]) => (
              <div key={label}>
                <dt className={`text-xs ${subtle}`}>{label}</dt>
                <dd className="text-sm font-medium mt-0.5">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      {rows.length === 0 && !profile.bio && <p className={`text-sm ${subtle}`}>No bio information yet.</p>}
    </div>
  )
}

function GameLogTable({ games, dark }) {
  const subtle = dark ? 'text-neutral-400' : 'text-neutral-500'
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className={subtle}>
          <tr className="text-left">
            {['Date','Opponent','Result','PTS','REB','AST','STL','BLK','MIN','Video'].map(h => (
              <th key={h} className={`py-1 pr-2${['PTS','REB','AST','STL','BLK','MIN'].includes(h) ? ' text-right' : ''}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {games.map(g => {
            const s = g.stats || {}
            const num = (k1, k2) => s[k1] ?? s[k2] ?? ''
            const vurl = videoUrlWithTimecode(g.video_url, g.video_timecode_seconds)
            return (
              <tr key={g.id} className={dark ? 'border-t border-neutral-800' : 'border-t border-neutral-100'}>
                <td className="py-1 pr-2 whitespace-nowrap">{formatDate(g.played_on)}</td>
                <td className="py-1 pr-2">{g.opponent || '—'}</td>
                <td className="py-1 pr-2 font-medium">
                  {g.result || '—'}{g.team_score != null && g.opponent_score != null ? ` ${g.team_score}-${g.opponent_score}` : ''}
                </td>
                <td className="py-1 pr-2 text-right">{num('points','pts')}</td>
                <td className="py-1 pr-2 text-right">{num('rebounds','reb')}</td>
                <td className="py-1 pr-2 text-right">{num('assists','ast')}</td>
                <td className="py-1 pr-2 text-right">{num('steals','stl')}</td>
                <td className="py-1 pr-2 text-right">{num('blocks','blk')}</td>
                <td className="py-1 pr-2 text-right">{num('minutes','min')}</td>
                <td className="py-1 pr-2">
                  {vurl
                    ? <a href={vurl} target="_blank" rel="noreferrer" className="text-orange-600 hover:underline">▶ {formatTimecode(g.video_timecode_seconds) || 'Watch'}</a>
                    : <span className={subtle}>—</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function SplitsTab({ games, dark }) {
  const subtle = dark ? 'text-neutral-400' : 'text-neutral-500'
  if (!games.length) return <p className={`text-sm ${subtle}`}>No games recorded yet.</p>
  const groups = {
    Home:   computeCareerAverages(games.filter(g => g.home_or_away === 'home')),
    Away:   computeCareerAverages(games.filter(g => g.home_or_away === 'away')),
    Wins:   computeCareerAverages(games.filter(g => g.result === 'W')),
    Losses: computeCareerAverages(games.filter(g => g.result === 'L')),
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {Object.entries(groups).map(([k, a]) => (
        <div key={k} className={`rounded-lg border ${dark ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-neutral-200'} p-3`}>
          <div className={`text-xs font-medium ${subtle}`}>{k} ({a.gp} GP)</div>
          <div className="grid grid-cols-5 gap-2 mt-2 text-center">
            {['ppg','rpg','apg','spg','mpg'].map(k => (
              <div key={k}>
                <div className={`text-[10px] uppercase ${subtle}`}>{k}</div>
                <div className="text-base font-bold">{a[k]}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function NotVisible({ dark }) {
  return (
    <div className={`rounded-xl border ${dark ? 'border-neutral-800 bg-neutral-900' : 'border-neutral-200 bg-white'} p-8 text-center`}>
      <div className="text-lg font-semibold">This profile isn't visible to you.</div>
      <p className="text-sm mt-2 opacity-70">Either the profile doesn't exist, or its owner hasn't given you access.</p>
      <div className="mt-4">
        <Link to="/p/onboard" className="inline-block px-4 py-2 rounded-md bg-orange-600 text-white text-sm hover:bg-orange-700">Claim your own HoopBase profile</Link>
      </div>
    </div>
  )
}

export default function PlayerProfile() {
  const { uid } = useParams()
  const { supabaseUser } = useAuth()
  const [profile, setProfile] = React.useState(null)
  const [seasons, setSeasons] = React.useState([])
  const [games, setGames] = React.useState([])
  const [tab, setTab] = React.useState('stats')
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState(null)
  const [theme, setTheme] = React.useState(getStoredTheme())

  React.useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true); setError(null)
      try {
        const p = await fetchHoopBaseProfile(uid)
        if (cancelled) return
        if (!p) { setError('not_found'); setLoading(false); return }
        setProfile(p)
        if (p.theme) setTheme(p.theme)
        const [s, g] = await Promise.all([listSeasons(uid), listCareerGames(uid)])
        if (cancelled) return
        setSeasons(s); setGames(g)
      } catch (e) {
        if (!cancelled) setError(String(e?.message || e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [uid])

  const isOwner = !!(profile && supabaseUser?.email && String(profile.owner_email || '').toLowerCase() === String(supabaseUser.email).toLowerCase())
  const isParent = !!(profile && supabaseUser?.email && String(profile.parent_email || '').toLowerCase() === String(supabaseUser.email).toLowerCase())
  const isMinor = !!profile?.is_minor
  const consentPending = isMinor && profile?.consent_status === 'pending'
  const consentRevoked = isMinor && profile?.consent_status === 'revoked'
  const averages = React.useMemo(() => computeCareerAverages(games), [games])
  const customCfg = theme === 'custom' ? (profile?.theme_config || {}) : null
  const dark = theme === 'dark' || (customCfg?.mode === 'dark')
  const accentColor = customCfg?.accent || '#ea580c'

  React.useEffect(() => {
    if (!profile || !profile.is_public) return
    const og = computeProfileOgTags(profile, averages)
    return applyOgMetaTags(og)
  }, [profile, averages])

  return (
    <PlayerLayout theme={theme}>
      <div style={{ '--hb-accent': accentColor }}>
        {loading
          ? <p className="text-sm opacity-60">Loading profile…</p>
          : error === 'not_found' || !profile
            ? <NotVisible dark={dark} />
            : (
              <>
                {consentPending ? (
                  <div className={`mb-4 p-3 rounded-md border ${dark ? 'border-orange-700 bg-orange-900/30 text-orange-200' : 'border-orange-300 bg-orange-50 text-orange-800'} text-sm`}>
                    <strong>Profile locked — awaiting parental consent.</strong> No seasons, games or viewers can be added until the parent / guardian opens the confirmation link emailed during sign-up.
                  </div>
                ) : null}
                {consentRevoked ? (
                  <div className={`mb-4 p-3 rounded-md border ${dark ? 'border-red-700 bg-red-900/30 text-red-200' : 'border-red-300 bg-red-50 text-red-800'} text-sm`}>
                    <strong>Consent revoked.</strong> This profile is locked. Contact mark@insideshots.au to discuss.
                  </div>
                ) : null}
                <HeroCard profile={profile} averages={averages} dark={dark} isOwner={isOwner || isParent} accentColor={accentColor} />
                <TabBar active={tab} onChange={setTab} dark={dark} />
                {tab === 'stats'   && <StatsTab seasons={seasons} games={games} dark={dark} />}
                {tab === 'gamelog' && (games.length ? <GameLogTable games={games} dark={dark} /> : <p className={`text-sm ${dark ? 'text-neutral-400' : 'text-neutral-500'}`}>No games recorded yet.</p>)}
                {tab === 'splits'  && <SplitsTab games={games} dark={dark} />}
                {tab === 'bio'     && <BioTab profile={profile} dark={dark} />}
                {tab === 'teams'   && <TeamsSection profile={profile} isOwner={isOwner || isParent} dark={dark} />}
              </>
            )}
      </div>
    </PlayerLayout>
  )
}
