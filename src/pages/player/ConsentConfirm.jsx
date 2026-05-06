// /p/consent-confirm?token=<uuid> — parent consent page.

import React from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import PlayerLayout, { getStoredTheme } from '@/layouts/PlayerLayout'
import { fetchConsentByToken, approveConsentByTokenWithSignature } from '@/lib/playerProfiles'

const ACK_BOXES = [
  'I am the parent or legal guardian of the player named above.',
  'I have read and understood the HoopBase Parent / Guardian Consent (v1.0) in full.',
  'I authorise HoopBase to collect and store the categories of personal information set out in Section 4 for the purposes set out in Section 5.',
  'I understand the profile is private by default — only the player, me, and the HoopBase SuperAdmin can see it until I add additional viewers.',
  'I understand I can withdraw this consent at any time, and that doing so will trigger deletion as described in Section 11.',
  'I understand custody of the profile transfers to the player when they turn 16, as described in Section 12.',
]

export default function ConsentConfirm() {
  const [params] = useSearchParams()
  const token = params.get('token')
  const theme = getStoredTheme()
  const dark = theme === 'dark'
  const cardCls = `rounded-xl border p-6 ${dark ? 'border-neutral-800 bg-neutral-900' : 'border-neutral-200 bg-white'}`
  const subtle = dark ? 'text-neutral-400' : 'text-neutral-600'
  const inputCls = `w-full rounded-md border px-3 py-2 text-sm ${dark ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-white border-neutral-300 text-neutral-900'}`

  const [state, setState] = React.useState('loading')
  const [error, setError] = React.useState(null)
  const [data, setData] = React.useState(null)
  const [acks, setAcks] = React.useState(() => ACK_BOXES.map(() => false))
  const [signature, setSignature] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (!token) { setState('error'); setError('Missing token in URL.'); return }
    let cancel = false
    ;(async () => {
      try {
        const d = await fetchConsentByToken(token)
        if (cancel) return
        if (!d) { setError('Consent not found. The link may have expired or been used already.'); setState('error'); return }
        setData(d)
        setState(d.status === 'approved' ? 'already' : (d.status === 'revoked' ? 'revoked' : 'form'))
      } catch (e) {
        if (cancel) return
        setError(String(e?.message || e)); setState('error')
      }
    })()
    return () => { cancel = true }
  }, [token])

  async function onSubmit(e) {
    e.preventDefault(); setError(null)
    if (acks.some(v => !v)) { setError('Please tick every acknowledgement box.'); return }
    if (signature.trim().toLowerCase() !== String(data?.parent_name || '').trim().toLowerCase()) {
      setError('Your typed-name signature must exactly match the parent / guardian full name we have on file.'); return
    }
    setBusy(true)
    try {
      const r = await approveConsentByTokenWithSignature(token, signature.trim())
      if (r?.profile_id) {
        setData(d => ({ ...d, profile_id: r.profile_id, status: 'approved' }))
        setState('approved')
      }
    } catch (e2) { setError(String(e2?.message || e2)) }
    finally { setBusy(false) }
  }

  return (
    <PlayerLayout theme={theme}>
      <div className="max-w-2xl mx-auto">
        {state === 'loading' && <p className={`text-sm ${subtle}`}>Loading consent form…</p>}

        {state === 'error' && (
          <div className={cardCls}>
            <h1 className="text-2xl font-bold mb-2">Consent link issue</h1>
            <p className="text-sm text-red-500 mb-4">{error}</p>
            <p className={`text-xs ${subtle}`}>If you believe this is in error, contact info@hoopbase.com.au.</p>
          </div>
        )}

        {state === 'revoked' && (
          <div className={cardCls}>
            <h1 className="text-2xl font-bold mb-2">Consent revoked</h1>
            <p className={`text-sm ${subtle}`}>This consent has been revoked. Contact info@hoopbase.com.au if unexpected.</p>
          </div>
        )}

        {(state === 'already' || state === 'approved') && (
          <div className={cardCls}>
            <h1 className="text-2xl font-bold mb-2">{state === 'approved' ? 'Consent confirmed' : 'Already confirmed'}</h1>
            <p className={`text-sm mb-4 ${subtle}`}>
              {state === 'approved'
                ? 'Thank you — the HoopBase profile is now active.'
                : 'This consent has already been confirmed. The profile is active.'}
            </p>
            {data?.profile_id ? <Link to={`/p/${data.profile_id}`} className="inline-block px-4 py-2 rounded-md bg-orange-600 text-white text-sm hover:bg-orange-700">Open the profile</Link> : null}
          </div>
        )}

        {state === 'form' && data && (
          <form onSubmit={onSubmit} className={`${cardCls} space-y-5`}>
            <div>
              <h1 className="text-2xl font-bold mb-1">HoopBase Parent / Guardian Consent</h1>
              <p className={`text-sm ${subtle}`}>
                Hello {data.parent_name}. Your child <strong>{data.player_name}</strong>{data.player_dob ? ` (DOB ${data.player_dob})` : ''} has requested a HoopBase Player Profile.
                Because they are under 16, you must read and sign this consent before any data can be added.
              </p>
            </div>
            <div className={`p-3 rounded ${dark ? 'bg-neutral-800' : 'bg-neutral-100'} text-sm space-y-1`}>
              <div><span className={subtle}>Player:</span> <strong>{data.player_name}</strong></div>
              <div><span className={subtle}>Parent / guardian:</span> {data.parent_name} ({data.parent_relationship})</div>
              <div><span className={subtle}>Parent email:</span> {data.parent_email}</div>
            </div>
            <div className={`rounded border ${dark ? 'border-orange-700 bg-orange-900/20' : 'border-orange-300 bg-orange-50'} p-3 text-sm`}>
              <p className="mb-2"><strong>Read the full consent before signing.</strong> Version <strong>{data.consent_text_version}</strong>, SHA-256 <code className="text-[10px] break-all">{data.consent_text_sha256}</code>.</p>
              <a className="text-orange-700 underline" href="/consent/PARENT_CONSENT_v1_0.pdf" target="_blank" rel="noreferrer">Open the consent PDF in a new tab ↗</a>
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold">Acknowledgements</legend>
              {ACK_BOXES.map((label, idx) => (
                <label key={idx} className="flex items-start gap-2 text-xs">
                  <input type="checkbox" checked={acks[idx]} onChange={e=>{ const next = [...acks]; next[idx] = e.target.checked; setAcks(next) }} className="mt-0.5" />
                  <span>{label}</span>
                </label>
              ))}
            </fieldset>
            <fieldset>
              <legend className="text-sm font-semibold mb-1">Electronic signature</legend>
              <p className={`text-xs ${subtle} mb-2`}>
                Type your full name <strong>exactly as shown above ({data.parent_name})</strong> as your electronic signature.
              </p>
              <input required value={signature} onChange={e=>setSignature(e.target.value)} className={inputCls} placeholder="Type your full name" />
            </fieldset>
            {error ? <div className="rounded border border-red-500 p-3 text-sm text-red-500">{error}</div> : null}
            <button type="submit" disabled={busy} className="px-5 py-2 rounded-md bg-orange-600 text-white text-sm hover:bg-orange-700 disabled:opacity-50">
              {busy ? 'Submitting consent…' : 'Sign and activate the profile'}
            </button>
          </form>
        )}
      </div>
    </PlayerLayout>
  )
}
