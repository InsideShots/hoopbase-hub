// /account/profile — lets a signed-in HoopBase user manage their
// name / phone / fav NBA team / fav NBA player / notification settings.
// Reads + writes public.app_users self-row (RLS gated by JWT email).
// Row is upserted on first save if the user has never had one.

import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  User, Mail, Phone, Star, Heart, Bell, BellOff, Loader2, ShieldCheck,
  ChevronDown, Check, X, ArrowLeft, MessageCircle, Calendar, Trophy, AtSign,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import { getAllNbaTeams, getNbaTeamLogo } from '../../lib/nbaTeams'

const PROFILE_COLS =
  'email,display_name,full_name,phone,fav_nba_team,fav_nba_player,mute_notifications,notification_prefs'

const NOTIF_CATEGORIES = [
  { key: 'team_chat',        label: 'Team Chat messages',       icon: MessageCircle },
  { key: 'schedule_changes', label: 'Schedule changes & events', icon: Calendar },
  { key: 'game_updates',     label: 'Game results & shot charts', icon: Trophy },
  { key: 'email_notifs',     label: 'Email notifications',       icon: AtSign },
]

const DEFAULT_PREFS = { team_chat: true, schedule_changes: true, game_updates: true, email_notifs: false }

export default function Profile() {
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [row, setRow] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [saving, setSaving] = useState(false)

  // Local edit state — committed on Save
  const [displayName, setDisplayName] = useState('')
  const [phone, setPhone] = useState('')
  const [favTeam, setFavTeam] = useState('')
  const [favPlayer, setFavPlayer] = useState('')
  const [muteNotifications, setMuteNotifications] = useState(false)
  const [prefs, setPrefs] = useState(DEFAULT_PREFS)

  // Load row
  useEffect(() => {
    if (authLoading) return
    if (!user) { setLoading(false); return }
    let cancelled = false
    ;(async () => {
      setLoading(true); setErr('')
      const { data, error } = await supabase
        .from('app_users')
        .select(PROFILE_COLS)
        .eq('email', user.email.toLowerCase())
        .maybeSingle()
      if (cancelled) return
      if (error) { setErr(error.message); setLoading(false); return }
      const r = data || { email: user.email.toLowerCase() }
      setRow(r)
      setDisplayName(r.display_name || r.full_name || user.user_metadata?.full_name || '')
      setPhone(r.phone || '')
      setFavTeam(r.fav_nba_team || '')
      setFavPlayer(r.fav_nba_player || '')
      setMuteNotifications(!!r.mute_notifications)
      setPrefs({ ...DEFAULT_PREFS, ...(r.notification_prefs || {}) })
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [authLoading, user])

  const dirty = useMemo(() => {
    if (!row) return false
    const base = {
      display_name: row.display_name || '',
      phone: row.phone || '',
      fav_nba_team: row.fav_nba_team || '',
      fav_nba_player: row.fav_nba_player || '',
      mute_notifications: !!row.mute_notifications,
      notification_prefs: JSON.stringify({ ...DEFAULT_PREFS, ...(row.notification_prefs || {}) }),
    }
    const cur = {
      display_name: displayName || '',
      phone: phone || '',
      fav_nba_team: favTeam || '',
      fav_nba_player: favPlayer || '',
      mute_notifications: !!muteNotifications,
      notification_prefs: JSON.stringify(prefs),
    }
    return Object.keys(base).some((k) => base[k] !== cur[k])
  }, [row, displayName, phone, favTeam, favPlayer, muteNotifications, prefs])

  async function handleSave() {
    if (!user) return
    setSaving(true); setErr(''); setMsg('')
    const email = user.email.toLowerCase()
    const patch = {
      email,
      display_name: displayName.trim(),
      phone: phone.trim(),
      fav_nba_team: favTeam,
      fav_nba_player: favPlayer.trim(),
      mute_notifications: muteNotifications,
      notification_prefs: prefs,
    }
    // upsert keys on email — works whether or not a row exists.
    const { data, error } = await supabase
      .from('app_users')
      .upsert(patch, { onConflict: 'email' })
      .select(PROFILE_COLS)
      .maybeSingle()
    setSaving(false)
    if (error) { setErr(error.message); return }
    setRow(data || { ...row, ...patch })
    setMsg('Saved.')
    setTimeout(() => setMsg(''), 2200)
  }

  if (authLoading) return (
    <div className="min-h-screen bg-gray-950 text-gray-500 flex items-center justify-center">Loading…</div>
  )
  if (!user) return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center gap-4 px-6">
      <p className="text-gray-400">Sign in to manage your profile.</p>
      <Link to="/login" className="bg-brand-500 hover:bg-brand-600 px-4 py-2 rounded-lg font-semibold">Sign in</Link>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-950 text-white pb-32">
      <header className="border-b border-gray-800 px-5 py-4 flex items-center gap-3 sticky top-0 z-10 bg-gray-950/95 backdrop-blur">
        <button onClick={() => navigate(-1)} className="p-1 -ml-1 rounded hover:bg-gray-800" aria-label="Back">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <User className="w-5 h-5 text-brand-500" />
        <h1 className="font-bold">My Profile</h1>
        <span className="text-xs text-gray-500 ml-auto truncate max-w-[40%]">{user.email}</span>
      </header>

      <div className="p-5 max-w-xl mx-auto space-y-6">
        {loading && <div className="text-gray-500 text-sm py-6">Loading profile…</div>}

        {!loading && (
          <>
            <Section title="Account">
              <Field icon={User} label="Display name">
                <input
                  type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="How others see you"
                  className="w-full bg-transparent text-sm focus:outline-none placeholder-gray-600"
                />
              </Field>
              <Field icon={Mail} label="Email" readOnly>
                <div className="text-sm text-gray-400">{row?.email || user.email}</div>
              </Field>
              <Field icon={Phone} label="Phone">
                <input
                  type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                  placeholder="Optional"
                  className="w-full bg-transparent text-sm focus:outline-none placeholder-gray-600"
                />
              </Field>
            </Section>

            <Section title="Favourites">
              <NbaTeamPicker value={favTeam} onChange={setFavTeam} />
              <Field icon={Star} label="Fav NBA player">
                <input
                  type="text" value={favPlayer} onChange={(e) => setFavPlayer(e.target.value)}
                  placeholder="e.g. LeBron James"
                  className="w-full bg-transparent text-sm focus:outline-none placeholder-gray-600"
                />
              </Field>
            </Section>

            <Section title="Notifications">
              <PushToggle muted={muteNotifications} onChange={setMuteNotifications} />
              <div className="rounded-xl overflow-hidden bg-gray-900 border border-gray-800">
                <div className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Notify me about
                </div>
                {NOTIF_CATEGORIES.map((cat, i) => {
                  const checked = !muteNotifications && (prefs[cat.key] ?? true)
                  return (
                    <label
                      key={cat.key}
                      className={`flex items-center gap-3 px-4 py-3 cursor-pointer select-none ${i > 0 ? 'border-t border-gray-800' : ''}`}
                    >
                      <cat.icon className={`w-4 h-4 ${muteNotifications ? 'text-gray-600' : 'text-gray-400'}`} />
                      <span className={`flex-1 text-sm ${muteNotifications ? 'text-gray-600' : 'text-gray-200'}`}>{cat.label}</span>
                      <input
                        type="checkbox" checked={checked} disabled={muteNotifications}
                        onChange={(e) => setPrefs((p) => ({ ...p, [cat.key]: e.target.checked }))}
                        className="w-4 h-4 rounded accent-brand-500 disabled:opacity-40"
                      />
                    </label>
                  )
                })}
              </div>
              <p className="text-xs text-gray-500 px-1">
                These prefs sync across your devices. Browser push permissions are managed by
                your OS / browser — toggle the master switch above to opt out app-wide.
              </p>
            </Section>

            <Section title="Security">
              <Link to="/account/mfa" className="flex items-center gap-3 rounded-xl bg-gray-900 border border-gray-800 px-4 py-3 hover:bg-gray-800 transition-colors">
                <ShieldCheck className="w-4 h-4 text-brand-500" />
                <div className="flex-1 text-sm">Multi-Factor Authentication</div>
                <span className="text-xs text-gray-500">Manage →</span>
              </Link>
            </Section>

            {/* Save bar */}
            <div className="sticky bottom-4 flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={!dirty || saving}
                className="flex-1 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
              </button>
            </div>

            {err && <div className="text-sm text-red-400">{err}</div>}
            {msg && <div className="text-sm text-emerald-400">{msg}</div>}
          </>
        )}
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <section className="space-y-2">
      <h2 className="text-xs uppercase tracking-widest font-bold text-gray-500 px-1">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  )
}

function Field({ icon: Icon, label, readOnly, children }) {
  return (
    <label className={`flex items-center gap-3 rounded-xl bg-gray-900 border border-gray-800 px-4 py-3 ${readOnly ? '' : 'focus-within:border-brand-500'}`}>
      <Icon className="w-4 h-4 text-gray-500 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 mb-0.5">{label}</div>
        {children}
      </div>
    </label>
  )
}

function NbaTeamPicker({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const teams = useMemo(() => getAllNbaTeams(), [])
  const current = value ? teams.find((t) => t.name.toLowerCase() === value.toLowerCase()) : null

  return (
    <div className="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden">
      <button
        type="button" onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        <Heart className="w-4 h-4 text-gray-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 mb-0.5">Fav NBA team</div>
          <div className="flex items-center gap-2">
            {current && <img src={current.logo} alt="" className="w-5 h-5 object-contain" />}
            <span className={`text-sm truncate ${current ? 'text-white' : 'text-gray-500'}`}>
              {current ? current.name : 'Select a team'}
            </span>
          </div>
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="max-h-64 overflow-y-auto border-t border-gray-800">
          {value && (
            <button
              type="button" onClick={() => { onChange(''); setOpen(false) }}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-800 text-left border-b border-gray-800"
            >
              <X className="w-4 h-4 text-gray-500" />
              <span className="text-sm text-gray-400">Clear selection</span>
            </button>
          )}
          {teams.map((t) => {
            const sel = current?.id === t.id
            return (
              <button
                key={t.id} type="button" onClick={() => { onChange(t.name); setOpen(false) }}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-800 text-left"
              >
                <img src={t.logo} alt="" className="w-6 h-6 object-contain shrink-0" />
                <span className="text-sm flex-1 truncate">{t.name}</span>
                {sel && <Check className="w-4 h-4 text-emerald-400 shrink-0" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function PushToggle({ muted, onChange }) {
  const enabled = !muted
  return (
    <button
      type="button"
      onClick={() => onChange(!muted)}
      className="w-full flex items-center gap-3 rounded-xl bg-gray-900 border border-gray-800 px-4 py-3.5 hover:bg-gray-800 transition-colors"
    >
      {enabled ? <Bell className="w-5 h-5 text-emerald-400" /> : <BellOff className="w-5 h-5 text-red-400" />}
      <div className="flex-1 text-left">
        <div className="text-sm font-semibold">
          {enabled ? 'Notifications on' : 'All notifications muted'}
        </div>
        <div className="text-xs text-gray-500">
          {enabled ? 'Tap to mute every category' : 'Tap to re-enable categories below'}
        </div>
      </div>
      <div className={`w-11 h-6 rounded-full relative transition-colors ${enabled ? 'bg-emerald-500' : 'bg-gray-700'}`}>
        <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </div>
    </button>
  )
}
