import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { CheckCircle, Info, PlayCircle } from 'lucide-react'

export default function SubmitVideo() {
  const { club, age, gender, year } = useParams()
  const teamPath = `${club}/${age}/${gender}/${year}`

  const [form, setForm] = useState({ youtube_url: '', game_label: '', game_date: '', notes: '' })
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.youtube_url.includes('youtube.com') && !form.youtube_url.includes('youtu.be')) {
      setError('Please enter a valid YouTube URL.')
      return
    }
    setLoading(true)
    setError('')
    const { error: err } = await supabase.from('video_submissions').insert({
      team_path: teamPath,
      youtube_url: form.youtube_url,
      game_label: form.game_label,
      game_date: form.game_date || null,
      notes: form.notes,
      status: 'pending',
    })
    setLoading(false)
    if (err) { setError(err.message); return }
    setSubmitted(true)
  }

  if (submitted) return (
    <div className="max-w-lg mx-auto text-center py-16">
      <CheckCircle className="w-14 h-14 text-green-500 mx-auto mb-4" />
      <h2 className="text-xl font-bold mb-2">Video submitted!</h2>
      <p className="text-gray-400 mb-6">
        HoopBase will run analysis on your footage and suggest stats. Your team admin will receive a notification to review and confirm.
      </p>
      <button
        onClick={() => setSubmitted(false)}
        className="text-brand-400 hover:underline text-sm"
      >
        Submit another video
      </button>
    </div>
  )

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold mb-2">Submit game video</h1>
      <p className="text-gray-400 mb-6">
        We'll run YOLO tracking on your footage to suggest player stats. Your admin will confirm before anything is published.
      </p>

      <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl px-4 py-3 flex gap-3 mb-6">
        <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-300">
          Video must be uploaded to YouTube (unlisted is fine). Once approved, HoopBase will add it to your team's playlist.
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">
            YouTube URL <span className="text-brand-500">*</span>
          </label>
          <div className="relative">
            <PlayCircle className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-red-500" />
            <input
              className={`${inp} pl-9`}
              type="url" value={form.youtube_url}
              onChange={e => set('youtube_url', e.target.value)}
              placeholder="https://youtube.com/watch?v=..." required
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">Game label</label>
          <input
            className={inp} value={form.game_label}
            onChange={e => set('game_label', e.target.value)}
            placeholder="e.g. Round 5 vs Rockingham Flames"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">Game date</label>
          <input
            className={inp} type="date" value={form.game_date}
            onChange={e => set('game_date', e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">
            Notes <span className="text-gray-500 font-normal">(optional)</span>
          </label>
          <textarea
            className={`${inp} h-24 resize-none`} value={form.notes}
            onChange={e => set('notes', e.target.value)}
            placeholder="Any context that will help with analysis…"
          />
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button
          type="submit" disabled={loading}
          className="w-full bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors"
        >
          {loading ? 'Submitting…' : 'Submit for analysis'}
        </button>
      </form>
    </div>
  )
}

const inp = 'w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-brand-500'
