// /account/mfa — TOTP enrollment + management.
//
// W6.MFA. Lets any signed-in user enrol a TOTP factor (Google Authenticator,
// 1Password, Authy, etc.) on their HoopBase account. Required for the two
// super-admin emails per the W6 platform-security plan; recommended for any
// admin-tier account.
//
// Flow:
//   1. List existing factors via supabase.auth.mfa.listFactors().
//   2. If none verified, hit Enable → enroll(totp) → show QR code + secret.
//   3. User scans QR with authenticator app, types the 6-digit code.
//   4. challenge() + verify() → factor becomes 'verified'. Save status.
//   5. From here on, the next sign-in needs the 6-digit code.
//
// To unenroll: button next to the factor → unenroll(factorId).

import { useEffect, useState, useCallback } from 'react'
import { ShieldCheck, ShieldAlert, Loader2, Trash2, Check } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'

export default function MFA() {
  const { user, loading: authLoading } = useAuth()
  const [factors, setFactors] = useState({ totp: [] })
  const [loading, setLoading] = useState(true)
  const [enrolling, setEnrolling] = useState(false)
  const [pending, setPending] = useState(null) // { factorId, qr_code, secret, uri }
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.auth.mfa.listFactors()
    if (error) { setErr(error.message); setFactors({ totp: [] }) }
    else setFactors(data || { totp: [] })
    setLoading(false)
  }, [])

  useEffect(() => { if (!authLoading && user) reload() }, [authLoading, user, reload])

  async function startEnroll() {
    setErr(''); setMsg(''); setEnrolling(true)
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
    setEnrolling(false)
    if (error) { setErr(error.message); return }
    setPending({
      factorId: data.id,
      qr_code: data.totp.qr_code,
      secret: data.totp.secret,
      uri: data.totp.uri,
    })
    setCode('')
  }

  async function verifyEnroll() {
    if (!pending || code.length !== 6) return
    setErr(''); setBusy(true)
    const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: pending.factorId })
    if (chErr) { setErr(chErr.message); setBusy(false); return }
    const { error: vErr } = await supabase.auth.mfa.verify({
      factorId: pending.factorId,
      challengeId: ch.id,
      code,
    })
    setBusy(false)
    if (vErr) { setErr(vErr.message); return }
    setPending(null); setCode(''); setMsg('MFA enabled. From your next sign-in you will be asked for a 6-digit code.')
    reload()
  }

  async function cancelEnroll() {
    if (!pending) return
    await supabase.auth.mfa.unenroll({ factorId: pending.factorId })
    setPending(null); setCode(''); setErr('')
  }

  async function unenroll(factorId) {
    if (!confirm('Disable MFA on this account? You will be able to sign in with just your password again.')) return
    setBusy(true); setErr('')
    const { error } = await supabase.auth.mfa.unenroll({ factorId })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setMsg('MFA disabled.')
    reload()
  }

  if (authLoading) return <div className="min-h-screen bg-gray-950 text-gray-500 flex items-center justify-center">Loading…</div>
  if (!user) return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
      <a href="/login" className="text-brand-500 underline">Sign in to manage MFA</a>
    </div>
  )

  const verified = (factors.totp || []).filter(f => f.status === 'verified')

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800 px-5 py-4 flex items-center gap-3">
        <ShieldCheck className="w-5 h-5 text-brand-500" />
        <h1 className="font-bold">Multi-Factor Authentication</h1>
        <span className="text-xs text-gray-500 ml-2">{user.email}</span>
      </header>

      <div className="p-5 max-w-xl">
        {loading && <div className="text-gray-500 text-sm py-6">Loading…</div>}

        {!loading && verified.length > 0 && !pending && (
          <div className="rounded-xl bg-gray-900 border border-gray-800 p-5 space-y-3">
            <div className="flex items-center gap-2 text-emerald-400">
              <ShieldCheck className="w-5 h-5" />
              <h2 className="font-bold">MFA is enabled on this account</h2>
            </div>
            <p className="text-sm text-gray-400">Every sign-in now requires a 6-digit code from your authenticator app.</p>
            <ul className="space-y-2 text-sm">
              {verified.map(f => (
                <li key={f.id} className="flex items-center justify-between bg-gray-950 rounded-lg px-3 py-2 border border-gray-800">
                  <div>
                    <div className="font-medium">{f.friendly_name || 'Authenticator app'}</div>
                    <div className="text-xs text-gray-500">Added {new Date(f.created_at).toLocaleDateString('en-AU')}</div>
                  </div>
                  <button onClick={() => unenroll(f.id)} disabled={busy}
                    className="text-xs px-3 py-1.5 rounded-lg border border-red-800 text-red-400 hover:bg-red-900/20 disabled:opacity-50 flex items-center gap-1">
                    <Trash2 className="w-3 h-3" /> Disable
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!loading && verified.length === 0 && !pending && (
          <div className="rounded-xl bg-gray-900 border border-yellow-900/50 p-5 space-y-3">
            <div className="flex items-center gap-2 text-yellow-400">
              <ShieldAlert className="w-5 h-5" />
              <h2 className="font-bold">MFA is not enabled</h2>
            </div>
            <p className="text-sm text-gray-400">
              Add an authenticator app (Google Authenticator, 1Password, Authy, etc.). After setup, every sign-in
              will require the 6-digit code from your app — even if your password leaks.
            </p>
            <button onClick={startEnroll} disabled={enrolling}
              className="px-4 py-2 rounded-lg bg-brand-500 text-white font-semibold text-sm flex items-center gap-2 disabled:opacity-50">
              {enrolling && <Loader2 className="w-4 h-4 animate-spin" />}
              Enable MFA
            </button>
          </div>
        )}

        {pending && (
          <div className="rounded-xl bg-gray-900 border border-brand-500/40 p-5 space-y-4">
            <h2 className="font-bold flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-brand-500" /> Scan this QR code</h2>
            <p className="text-sm text-gray-400">
              Open your authenticator app and scan the QR. If you can't scan, type the secret manually.
            </p>
            <div className="bg-white p-4 rounded-lg inline-block">
              <img src={pending.qr_code} alt="TOTP QR" className="w-48 h-48 block" />
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">Manual setup secret:</div>
              <code className="text-xs bg-gray-950 px-2 py-1 rounded border border-gray-700 select-all">{pending.secret}</code>
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1">Enter the 6-digit code from your app:</label>
              <input
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                maxLength={6}
                inputMode="numeric"
                className="w-32 bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-lg tracking-widest font-mono text-center"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={verifyEnroll} disabled={busy || code.length !== 6}
                className="px-4 py-2 rounded-lg bg-brand-500 text-white font-semibold text-sm flex items-center gap-2 disabled:opacity-50">
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                <Check className="w-4 h-4" /> Verify and enable
              </button>
              <button onClick={cancelEnroll}
                className="px-4 py-2 rounded-lg border border-gray-700 hover:bg-gray-800 text-sm">Cancel</button>
            </div>
          </div>
        )}

        {err && <div className="mt-3 text-sm text-red-400">{err}</div>}
        {msg && <div className="mt-3 text-sm text-emerald-400">{msg}</div>}
      </div>
    </div>
  )
}
