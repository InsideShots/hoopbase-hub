import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { CheckCircle } from 'lucide-react'

const AGE_GROUPS = ['U10', 'U12', 'U14', 'U16', 'U18', 'U20', 'Open', 'Masters']
const GENDERS = ['Girls', 'Boys', 'Mixed', 'Women', 'Men']
const SEASONS = ['2024', '2025', '2026', '2027']
const COMPETITIONS = ['WABL', 'State League', 'Association', 'School', 'Social', 'Other']

export default function Join() {
  const [form, setForm] = useState({
    club_name: '', club_slug: '', contact_name: '', contact_email: '',
    age_group: 'U14', gender: 'Girls', season_year: '2026',
    competition: 'WABL', state: 'WA', notes: '',
  })
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

  const set = (k, v) => setForm(f => ({
    ...f, [k]: v,
    ...(k === 'club_name' ? { club_slug: slugify(v) } : {}),
  }))

  const preview = form.club_slug
    ? `hoopbase.com.au/${form.club_slug}/${form.age_group.toLowerCase()}/${form.gender.toLowerCase()}/${form.season_year}`
    : null

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error: err } = await supabase.from('hb_team_join_requests').insert({
      club_name: form.club_name,
      club_slug: form.club_slug,
      contact_name: form.contact_name,
      contact_email: form.contact_email,
      age_group: form.age_group,
      gender: form.gender,
      season_year: form.season_year,
      competition: form.competition,
      state: form.state,
      notes: form.notes,
      status: 'pending',
    })
    setLoading(false)
    if (err) { setError(err.message); return }
    setSubmitted(true)
  }

  if (submitted) return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center px-6">
      <div className="text-center max-w-md">
        <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
        <h1 className="text-2xl font-bold mb-2">Request received!</h1>
        <p className="text-gray-400 mb-2">
          We'll review your application and set up your team portal at:
        </p>
        {preview && (
          <div className="bg-gray-800 rounded-xl px-4 py-3 font-mono text-sm text-brand-400 mb-4">
            {preview}
          </div>
        )}
        <p className="text-gray-500 text-sm">You'll get an email at <strong className="text-gray-300">{form.contact_email}</strong> once approved.</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-950 text-white px-6 py-16">
      <div className="max-w-xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Register your team</h1>
        <p className="text-gray-400 mb-8">
          Free for all Australian grassroots clubs. We'll set up your team portal once approved.
        </p>

        {preview && (
          <div className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 mb-6">
            <div className="text-xs text-gray-500 mb-1">Your team URL will be:</div>
            <div className="font-mono text-sm text-brand-400 break-all">{preview}</div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <Field label="Club name" required>
            <input className={input} value={form.club_name} onChange={e => set('club_name', e.target.value)} required placeholder="Joondalup Wolves" />
          </Field>
          <Field label="Club URL slug" hint="Auto-generated — edit if needed">
            <input className={input} value={form.club_slug} onChange={e => set('club_slug', slugify(e.target.value))} required placeholder="joondalup-wolves" />
          </Field>

          <div className="grid grid-cols-3 gap-4">
            <Field label="Age group">
              <select className={input} value={form.age_group} onChange={e => set('age_group', e.target.value)}>
                {AGE_GROUPS.map(a => <option key={a}>{a}</option>)}
              </select>
            </Field>
            <Field label="Gender">
              <select className={input} value={form.gender} onChange={e => set('gender', e.target.value)}>
                {GENDERS.map(g => <option key={g}>{g}</option>)}
              </select>
            </Field>
            <Field label="Season">
              <select className={input} value={form.season_year} onChange={e => set('season_year', e.target.value)}>
                {SEASONS.map(s => <option key={s}>{s}</option>)}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Competition">
              <select className={input} value={form.competition} onChange={e => set('competition', e.target.value)}>
                {COMPETITIONS.map(c => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="State">
              <select className={input} value={form.state} onChange={e => set('state', e.target.value)}>
                {['WA','NSW','VIC','QLD','SA','TAS','ACT','NT'].map(s => <option key={s}>{s}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Your name" required>
            <input className={input} value={form.contact_name} onChange={e => set('contact_name', e.target.value)} required placeholder="Mark Edmonds" />
          </Field>
          <Field label="Email" required>
            <input className={input} type="email" value={form.contact_email} onChange={e => set('contact_email', e.target.value)} required placeholder="coach@club.com.au" />
          </Field>
          <Field label="Anything else?" hint="Optional">
            <textarea className={`${input} h-24 resize-none`} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Tell us about your team..." />
          </Field>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors"
          >
            {loading ? 'Submitting…' : 'Submit request'}
          </button>
        </form>
      </div>
    </div>
  )
}

const input = 'w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-brand-500'

function Field({ label, hint, required, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-1.5">
        {label}{required && <span className="text-brand-500 ml-0.5">*</span>}
        {hint && <span className="text-gray-500 font-normal ml-2">({hint})</span>}
      </label>
      {children}
    </div>
  )
}
