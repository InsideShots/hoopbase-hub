// /p/onboard — HoopBase Player Profile onboarding.

import React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import PlayerLayout, { getStoredTheme } from '@/layouts/PlayerLayout'
import {
  fetchHoopBaseProfileForOwner,
  createHoopBaseProfile,
  ageFromDob,
  MINOR_AGE_THRESHOLD,
  fetchConsentTextVersion,
  createConsentRecord,
} from '@/lib/playerProfiles'
import { useAuth } from '@/lib/AuthContext'
import { invokeSupabaseFunction } from '@/lib/fnFetch'

export default function PlayerOnboard() {
  const navigate = useNavigate()
  const { supabaseUser, isLoadingAuth } = useAuth()
  const theme = getStoredTheme()
  const dark = theme === 'dark'
  const inputCls = `w-full rounded-md border px-3 py-2 text-sm ${dark ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-white border-neutral-300 text-neutral-900'}`
  const cardCls = `rounded-xl border p-6 ${dark ? 'border-neutral-800 bg-neutral-900' : 'border-neutral-200 bg-white'}`
  const subtle = dark ? 'text-neutral-400' : 'text-neutral-600'

  const email = supabaseUser?.email || ''
  const [existing, setExisting] = React.useState(null)
  const [checking, setChecking] = React.useState(true)
  const [fullName, setFullName] = React.useState('')
  const [dob, setDob] = React.useState('')
  const [forceMinor, setForceMinor] = React.useState(false)
  const [stage, setStage] = React.useState(1)
  const [consentVersion, setConsentVersion] = React.useState(null)
  const [parentName, setParentName] = React.useState('')
  const [parentEmail, setParentEmail] = React.useState('')
  const [parentPhone, setParentPhone] = React.useState('')
  const [parentRelationship, setParentRelationship] = React.useState('Parent')
  const [createdProfile, setCreatedProfile] = React.useState(null)
  const [createdConsent, setCreatedConsent] = React.useState(null)
  const [emailSentTo, setEmailSentTo] = React.useState(null)
  const [emailError, setEmailError] = React.useState(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState(null)

  React.useEffect(() => {
    let cancel = false
    ;(async () => {
      if (!email) { setChecking(false); return }
      const p = await fetchHoopBaseProfileForOwner(email)
      if (cancel) return
      setExisting(p); setChecking(false)
    })()
    return () => { cancel = true }
  }, [email])

  const age = ageFromDob(dob)
  const isMinor = forceMinor || (age != null && age < MINOR_AGE_THRESHOLD)

  async function onSubmitIdentity(e) {
    e.preventDefault(); setError(null)
    if (isMinor) {
      try {
        const v = await fetchConsentTextVersion('v1.0')
        if (!v) throw new Error('Consent text v1.0 not found in DB.')
        setConsentVersion(v); setStage(2)
      } catch (err) { setError(String(err?.message || err)) }
    } else {
      setBusy(true)
      try {
        const p = await createHoopBaseProfile({ ownerEmail: email, fullName, dob: dob || null })
        navigate(`/p/${p.id}`)
      } catch (err) { setError(String(err?.message || err)) }
      finally { setBusy(false) }
    }
  }

  async function onSubmitParentDetails(e) {
    e.preventDefault(); setError(null)
    if (!parentName.trim() || !parentEmail.trim() || !parentRelationship.trim()) {
      setError('Parent / guardian full name, email, and relationship are all required.'); return
    }
    if (parentEmail.trim().toLowerCase() === email.toLowerCase()) {
      setError('The parent / guardian email must be different from the player email.'); return
    }
    setBusy(true)
    try {
      const profile = await createHoopBaseProfile({ ownerEmail: email, fullName, dob: dob || null, forceMinor: true })
      const consent = await createConsentRecord(profile.id, { consentTextVersionId: consentVersion.id, parentName, parentEmail, parentPhone, parentRelationship })
      setCreatedProfile(profile); setCreatedConsent(consent); setStage(3)
      try {
        const r = await invokeSupabaseFunction('send-consent-email', { consent_id: consent.id })
        if (r?.sent) setEmailSentTo(r.to)
        else if (r?.reason) setEmailError(`Email skipped: ${r.reason}`)
      } catch (sendErr) { setEmailError(String(sendErr?.message || sendErr)) }
    } catch (err) { setError(String(err?.message || err)) }
    finally { setBusy(false) }
  }

  if (isLoadingAuth) return <PlayerLayout theme={theme}><p className="text-sm opacity-60">Checking sign-in…</p></PlayerLayout>

  if (!email) {
    return (
      <PlayerLayout theme={theme}>
        <div className={`${cardCls} max-w-xl mx-auto`}>
          <h1 className="text-2xl font-bold mb-2">Sign in to claim a profile</h1>
          <p className={`text-sm mb-4 ${subtle}`}>You'll need to sign in with the player's own email.</p>
          <Link to="/auth" className="inline-block px-4 py-2 rounded-md bg-orange-600 text-white text-sm hover:bg-orange-700">Sign in</Link>
        </div>
      </PlayerLayout>
    )
  }

  if (checking) return <PlayerLayout theme={theme}><p className="text-sm opacity-60">Checking for existing profile…</p></PlayerLayout>

  if (existing) {
    return (
      <PlayerLayout theme={theme}>
        <div className={`${cardCls} max-w-xl mx-auto`}>
          <h1 className="text-2xl font-bold mb-2">You already have a HoopBase profile</h1>
          <Link to={`/p/${existing.id}`} className="inline-block px-4 py-2 rounded-md bg-orange-600 text-white text-sm hover:bg-orange-700">Open your profile</Link>
        </div>
      </PlayerLayout>
    )
  }

  return (
    <PlayerLayout theme={theme}>
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Claim your HoopBase profile</h1>
        <p className={`text-sm mb-6 ${subtle}`}>Private, lifelong basketball career profile. Visible only to you and the people you choose.</p>
        {error ? <div className="mb-4 p-3 rounded-md border border-red-500 text-sm text-red-500">{error}</div> : null}

        {stage === 1 && (
          <form onSubmit={onSubmitIdentity} className={`${cardCls} space-y-4`}>
            <div>
              <span className="text-xs font-medium opacity-70 mb-1 block">Owner email</span>
              <input value={email} disabled className={`${inputCls} opacity-70`} />
            </div>
            <label className="block">
              <span className="text-xs font-medium opacity-70 mb-1 block">Player's full name</span>
              <input required value={fullName} onChange={e=>setFullName(e.target.value)} className={inputCls} />
            </label>
            <label className="block">
              <span className="text-xs font-medium opacity-70 mb-1 block">Date of birth</span>
              <input type="date" value={dob} onChange={e=>setDob(e.target.value)} className={inputCls} />
              <span className={`text-xs mt-1 block ${subtle}`}>Players under 16 require parental consent — we'll email your parent / guardian on the next step.</span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={forceMinor} onChange={e=>setForceMinor(e.target.checked)} className="mt-1" />
              <span>This player is under 16 (use this if you'd rather not enter a date of birth).</span>
            </label>
            {isMinor ? (
              <p className={`text-sm p-3 rounded ${dark ? 'bg-orange-900/30 text-orange-200' : 'bg-orange-50 text-orange-800'}`}>
                Player is under 16 — the next step collects parent / guardian contact details so we can email them the consent form to sign.
              </p>
            ) : null}
            <button type="submit" disabled={busy || !fullName} className="px-4 py-2 rounded-md bg-orange-600 text-white text-sm hover:bg-orange-700 disabled:opacity-50">
              {busy ? 'Working…' : (isMinor ? 'Continue →' : 'Create my profile')}
            </button>
          </form>
        )}

        {stage === 2 && consentVersion && (
          <form onSubmit={onSubmitParentDetails} className={`${cardCls} space-y-5`}>
            <div className={`p-3 rounded ${dark ? 'bg-neutral-800' : 'bg-neutral-100'}`}>
              <div className="text-xs font-semibold mb-1">Player</div>
              <div className="text-sm">{fullName}{dob ? ` · DOB ${dob}` : ''}{age != null ? ` · age ${age}` : ''}</div>
            </div>
            <div className={`rounded border ${dark ? 'border-orange-700 bg-orange-900/20' : 'border-orange-300 bg-orange-50'} p-3 text-sm`}>
              <strong>How this works:</strong> You enter your parent / guardian's contact details below. We send them an email with a private link to read and sign the HoopBase Parent / Guardian Consent (v1.0). The profile is locked until they sign.
            </div>
            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold">Parent / guardian details</legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block"><span className="text-xs font-medium opacity-70 mb-1 block">Full name</span><input required value={parentName} onChange={e=>setParentName(e.target.value)} className={inputCls} /></label>
                <label className="block"><span className="text-xs font-medium opacity-70 mb-1 block">Email</span><input required type="email" value={parentEmail} onChange={e=>setParentEmail(e.target.value)} className={inputCls} /></label>
                <label className="block"><span className="text-xs font-medium opacity-70 mb-1 block">Phone</span><input value={parentPhone} onChange={e=>setParentPhone(e.target.value)} className={inputCls} /></label>
                <label className="block">
                  <span className="text-xs font-medium opacity-70 mb-1 block">Relationship to player</span>
                  <select value={parentRelationship} onChange={e=>setParentRelationship(e.target.value)} className={inputCls}>
                    <option>Parent</option><option>Mother</option><option>Father</option><option>Step-parent</option><option>Legal guardian</option><option>Grandparent (with parental authority)</option>
                  </select>
                </label>
              </div>
            </fieldset>
            <p className={`text-xs ${subtle}`}>
              The full consent text:{' '}
              <a className="text-orange-600 hover:underline" href="/consent/PARENT_CONSENT_v1_0.pdf" target="_blank" rel="noreferrer">PARENT_CONSENT_v1_0.pdf ↗</a>
              {' '}(version {consentVersion.version}, SHA-256 <code className="text-[10px] break-all">{consentVersion.sha256_hash}</code>).
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={()=>setStage(1)} className="px-4 py-2 rounded-md border text-sm">← Back</button>
              <button type="submit" disabled={busy} className="px-4 py-2 rounded-md bg-orange-600 text-white text-sm hover:bg-orange-700 disabled:opacity-50">
                {busy ? 'Sending email…' : 'Email my parent / guardian'}
              </button>
            </div>
          </form>
        )}

        {stage === 3 && createdProfile && createdConsent && (
          <SuccessPanel profile={createdProfile} consent={createdConsent} emailSentTo={emailSentTo} emailError={emailError} cardCls={cardCls} subtle={subtle} dark={dark} />
        )}
      </div>
    </PlayerLayout>
  )
}

function SuccessPanel({ profile, consent, emailSentTo, emailError, cardCls, subtle, dark }) {
  const url = `${window.location.origin}/p/consent-confirm?token=${consent.confirmation_token}`
  return (
    <div className={`${cardCls} space-y-4`}>
      <h2 className="text-xl font-bold">We've emailed your parent / guardian</h2>
      <p className={`text-sm ${subtle}`}>
        Your profile has been created in a <strong>pending</strong> state. Your parent / guardian needs to open the email, read the consent form, and add their electronic signature.
      </p>
      {emailSentTo ? (
        <div className={`rounded border ${dark ? 'border-green-700 bg-green-900/30' : 'border-green-300 bg-green-50'} p-3 text-sm`}>
          ✓ Confirmation email sent to <strong>{emailSentTo}</strong>.
        </div>
      ) : null}
      {emailError ? (
        <div className="rounded border border-red-500 p-3 text-sm text-red-500">The email could not be sent automatically: {emailError}</div>
      ) : null}
      <div className={`rounded border ${dark ? 'border-orange-700 bg-orange-900/30' : 'border-orange-300 bg-orange-50'} p-3`}>
        <div className="text-xs font-semibold mb-1">Backup link (only share with your parent / guardian)</div>
        <div className="font-mono text-xs break-all p-2 rounded bg-black/10">{url}</div>
        <button onClick={() => navigator.clipboard?.writeText(url)} className="mt-2 text-xs px-2 py-1 rounded border">Copy link</button>
      </div>
      <div className="flex gap-2">
        <Link to={`/p/${profile.id}`} className="px-4 py-2 rounded-md border text-sm">Open profile (locked until consent confirmed)</Link>
      </div>
    </div>
  )
}
