// HoopBase SuperAdmin console — hoopbase.com.au/SuperAdmin
//
// Cross-team admin surface. Read-only data views over every Supabase table
// the SA can see (RLS enforces super-admin scope). Write actions (merge
// profiles, force-revoke consent, etc.) go through SECURITY DEFINER RPCs
// that audit-log to `super_admin_audit_log` (W6.AUDIT, migration 041).
//
// Auth gate: calls `is_super_admin()` RPC. Covers both `super_admins` table
// rows AND the email-fallback set (mark@insideshots.au, medmonds19@outlook.com)
// from W6.SUPERADMIN-LOCK (migration 034).

import { useEffect, useState, useCallback } from 'react'
import { Crown, Building2, Users, ShieldCheck, Merge, History, RefreshCw, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'

const TABS = [
  { id: 'orgs',     label: 'Orgs',         icon: Building2 },
  { id: 'teams',    label: 'Teams',        icon: Users },
  { id: 'members',  label: 'Members',      icon: Users },
  { id: 'sas',      label: 'Super Admins', icon: ShieldCheck },
  { id: 'audit',    label: 'Audit',        icon: History },
  { id: 'merge',    label: 'Merge UIDs',   icon: Merge },
]

function useTable(table, select = '*') {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let cancel = false
    supabase.from(table).select(select).limit(500)
      .then(({ data }) => { if (!cancel) { setRows(Array.isArray(data) ? data : []); setLoading(false) } })
    return () => { cancel = true }
  }, [table, select])
  return { rows, loading }
}

function Table({ rows, columns, loading }) {
  if (loading) return <div className="text-gray-500 text-sm py-6">Loading…</div>
  if (!rows.length) return <div className="text-gray-500 text-sm py-6">No rows.</div>
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-800">
      <table className="w-full text-sm">
        <thead className="bg-gray-900 text-gray-400">
          <tr>{columns.map(c => <th key={c.key} className="text-left px-3 py-2 font-medium">{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id || i} className="border-t border-gray-800 hover:bg-gray-900/40">
              {columns.map(c => (
                <td key={c.key} className="px-3 py-2 text-gray-300 whitespace-nowrap">
                  {c.render ? c.render(r[c.key], r) : (r[c.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const ORG_COLS = [
  { key: 'name', label: 'Name' },
  { key: 'slug', label: 'Slug' },
  { key: 'created_at', label: 'Created', render: v => v ? new Date(v).toLocaleDateString('en-AU') : '—' },
]
const TEAM_COLS = [
  { key: 'name', label: 'Team' },
  { key: 'slug', label: 'Slug' },
  { key: 'season', label: 'Season' },
  { key: 'sport', label: 'Sport' },
]
const MEMBER_COLS = [
  { key: 'user_id', label: 'User ID' },
  { key: 'team_id', label: 'Team ID' },
  { key: 'role', label: 'Role' },
  { key: 'sub_role', label: 'Sub-role' },
]
const SA_COLS = [
  { key: 'user_id', label: 'User ID' },
  { key: 'added_at', label: 'Added', render: v => v ? new Date(v).toLocaleDateString('en-AU') : '—' },
]
const AUDIT_COLS = [
  { key: 'created_at', label: 'When', render: v => v ? new Date(v).toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'medium' }) : '—' },
  { key: 'actor_email', label: 'Actor' },
  { key: 'action', label: 'Action' },
  { key: 'target_table', label: 'Table' },
  { key: 'target_id', label: 'Target' },
]

function MergePanel() {
  const [src, setSrc] = useState('')
  const [dst, setDst] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const run = async () => {
    if (!src.trim() || !dst.trim()) return
    setBusy(true); setResult(null)
    const { data, error } = await supabase.rpc('hb_merge_profiles', { source_uid: src.trim(), target_uid: dst.trim() })
    setResult(error ? { ok: false, error: error.message } : { ok: true, data })
    setBusy(false)
  }
  return (
    <div className="rounded-xl bg-gray-900 border border-gray-800 p-5 space-y-3 max-w-xl">
      <h2 className="font-bold flex items-center gap-2"><Merge className="w-4 h-4" /> Merge duplicate profiles</h2>
      <p className="text-xs text-gray-400">Re-points all career games, seasons, and viewers from source UID to target UID, then soft-retires the source.</p>
      <div>
        <label className="block text-xs text-gray-400 mb-1">Source UID (will be retired)</label>
        <input value={src} onChange={e => setSrc(e.target.value)} className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">Target UID (canonical)</label>
        <input value={dst} onChange={e => setDst(e.target.value)} className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm" />
      </div>
      <button onClick={run} disabled={busy || !src.trim() || !dst.trim()}
        className="px-4 py-2 rounded-lg bg-brand-500 text-white text-sm font-semibold disabled:opacity-50 flex items-center gap-2">
        {busy && <Loader2 className="w-4 h-4 animate-spin" />} Merge
      </button>
      {result && (
        <div className={`text-xs ${result.ok ? 'text-emerald-400' : 'text-red-400'}`}>
          {result.ok ? `Merged. ${JSON.stringify(result.data)}` : `Error: ${result.error}`}
        </div>
      )}
    </div>
  )
}

export default function SuperAdmin() {
  const { user, loading: authLoading } = useAuth()
  const [isSA, setIsSA] = useState(null)
  const [tab, setTab] = useState('orgs')
  const [audit, setAudit] = useState([])
  const [auditLoading, setAuditLoading] = useState(false)

  useEffect(() => {
    if (authLoading || !user) { setIsSA(false); return }
    supabase.rpc('is_super_admin').then(({ data, error }) => {
      setIsSA(!error && data === true)
    })
  }, [authLoading, user])

  const loadAudit = useCallback(async () => {
    setAuditLoading(true)
    const { data } = await supabase.rpc('hb_list_sa_audit', { p_limit: 200, p_actor: null, p_action: null })
    setAudit(Array.isArray(data) ? data : [])
    setAuditLoading(false)
  }, [])
  useEffect(() => { if (isSA) loadAudit() }, [isSA, loadAudit])

  const { rows: orgs,    loading: orgsLoading }    = useTable('organisations')
  const { rows: teams,   loading: teamsLoading }   = useTable('teams')
  const { rows: members, loading: membersLoading } = useTable('team_members', 'user_id,team_id,role,sub_role,created_at')
  const { rows: sas,     loading: sasLoading }     = useTable('super_admins')

  if (authLoading || isSA === null) return <div className="min-h-screen bg-gray-950 text-gray-500 flex items-center justify-center">Loading…</div>
  if (!user) return <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center"><a href="/login" className="text-brand-500 underline">Sign in</a></div>
  if (!isSA) return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center p-8 gap-3">
      <ShieldCheck className="w-10 h-10 text-brand-500" />
      <h1 className="text-xl font-bold">Super Admin access required</h1>
      <p className="text-sm text-gray-400">Your account does not have super-admin privileges.</p>
      <a href="/" className="text-sm text-brand-500 underline">Back to home</a>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800 px-5 py-4 flex items-center gap-3">
        <Crown className="w-5 h-5 text-brand-500" />
        <h1 className="font-bold">SuperAdmin</h1>
        <span className="text-xs text-gray-500 ml-2">{user.email}</span>
      </header>

      <nav className="border-b border-gray-800 px-5 py-2 flex gap-1 overflow-x-auto">
        {TABS.map(t => {
          const Icon = t.icon
          const active = t.id === tab
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors ${
                active ? 'bg-brand-500/20 text-brand-400' : 'text-gray-400 hover:text-white hover:bg-gray-900'
              }`}>
              <Icon className="w-4 h-4" /> {t.label}
            </button>
          )
        })}
      </nav>

      <div className="p-5">
        {tab === 'orgs'    && <Table rows={orgs}    loading={orgsLoading}    columns={ORG_COLS} />}
        {tab === 'teams'   && <Table rows={teams}   loading={teamsLoading}   columns={TEAM_COLS} />}
        {tab === 'members' && <Table rows={members} loading={membersLoading} columns={MEMBER_COLS} />}
        {tab === 'sas'     && <Table rows={sas}     loading={sasLoading}     columns={SA_COLS} />}
        {tab === 'audit'   && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold flex items-center gap-2"><History className="w-4 h-4" /> Audit log ({audit.length})</h2>
              <button onClick={loadAudit} disabled={auditLoading}
                className="text-xs px-3 py-1.5 rounded-lg border border-gray-700 hover:bg-gray-900 disabled:opacity-50 flex items-center gap-2">
                <RefreshCw className={`w-3 h-3 ${auditLoading ? 'animate-spin' : ''}`} /> Refresh
              </button>
            </div>
            <Table rows={audit} loading={auditLoading} columns={AUDIT_COLS} />
            {!audit.length && !auditLoading && (
              <p className="text-xs text-gray-500 mt-2">No actions logged yet. Privileged RPCs will write here once W6.CONSOLE.WRITES ships.</p>
            )}
          </div>
        )}
        {tab === 'merge' && <MergePanel />}
      </div>
    </div>
  )
}
