import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Play, Check, X, ChevronDown, ChevronUp } from 'lucide-react'

export default function VideoQueue() {
  const [videos, setVideos] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('pending')
  const [expanded, setExpanded] = useState(null)

  const load = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('hb_video_submissions')
      .select('*, stat_suggestions:video_stat_suggestions(*)')
      .order('created_at', { ascending: false })
    setVideos(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const updateStatus = async (id, status, youtube_playlist_url = null) => {
    const update = { status, updated_at: new Date().toISOString() }
    if (youtube_playlist_url) update.youtube_playlist_url = youtube_playlist_url
    await supabase.from('hb_video_submissions').update(update).eq('id', id)
    load()
  }

  const filtered = videos.filter(v => filter === 'all' ? true : v.status === filter)

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Video Queue</h1>
        <div className="flex gap-2">
          {['pending','processing','reviewed','approved','all'].map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-sm capitalize transition-colors ${
                filter === s ? 'bg-brand-500 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {loading ? <div className="text-gray-500">Loading…</div> : filtered.length === 0 ? (
        <div className="text-gray-500">No {filter} videos.</div>
      ) : (
        <div className="space-y-3">
          {filtered.map(v => (
            <div key={v.id} className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
              <div className="p-5 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="font-semibold">{v.team_path || 'Unknown team'}</span>
                    <StatusBadge status={v.status} />
                  </div>
                  <div className="text-sm text-gray-400 mb-2">{v.game_label || 'No label'}</div>
                  <a
                    href={v.youtube_url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-brand-400 hover:text-brand-300 text-sm"
                  >
                    <Play className="w-3.5 h-3.5" /> Watch on YouTube
                  </a>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {(v.stat_suggestions?.length ?? 0) > 0 && (
                    <button
                      onClick={() => setExpanded(expanded === v.id ? null : v.id)}
                      className="flex items-center gap-1 text-sm text-gray-400 hover:text-white px-3 py-1.5 bg-gray-800 rounded-lg"
                    >
                      {v.stat_suggestions.length} suggestions
                      {expanded === v.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  )}
                  {v.status === 'reviewed' && (
                    <button
                      onClick={() => updateStatus(v.id, 'approved')}
                      className="flex items-center gap-1.5 bg-green-500/20 hover:bg-green-500/30 text-green-400 px-3 py-1.5 rounded-lg text-sm"
                    >
                      <Check className="w-4 h-4" /> Approve & publish
                    </button>
                  )}
                  {v.status === 'pending' && (
                    <button
                      onClick={() => updateStatus(v.id, 'processing')}
                      className="flex items-center gap-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 px-3 py-1.5 rounded-lg text-sm"
                    >
                      Run analysis
                    </button>
                  )}
                  {['pending','processing','reviewed'].includes(v.status) && (
                    <button
                      onClick={() => updateStatus(v.id, 'rejected')}
                      className="flex items-center gap-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 px-3 py-1.5 rounded-lg text-sm"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Stat suggestions panel */}
              {expanded === v.id && v.stat_suggestions?.length > 0 && (
                <div className="border-t border-gray-800 p-5">
                  <h3 className="text-sm font-semibold text-gray-300 mb-3">YOLO stat suggestions</h3>
                  <StatSuggestions suggestions={v.stat_suggestions} videoId={v.id} onSave={load} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function StatSuggestions({ suggestions, videoId, onSave }) {
  const [vals, setVals] = useState(() =>
    Object.fromEntries(suggestions.map(s => [s.id, s.confirmed_value ?? s.suggested_value]))
  )

  const save = async () => {
    await Promise.all(
      suggestions.map(s =>
        supabase.from('hb_video_stat_suggestions').update({
          confirmed_value: vals[s.id],
          confirmed: true,
        }).eq('id', s.id)
      )
    )
    await supabase.from('hb_video_submissions').update({ status: 'reviewed' }).eq('id', videoId)
    onSave()
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-800">
              <th className="pb-2 pr-4">Player</th>
              <th className="pb-2 pr-4">Stat</th>
              <th className="pb-2 pr-4">Suggested</th>
              <th className="pb-2">Confirmed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {suggestions.map(s => (
              <tr key={s.id}>
                <td className="py-2 pr-4 text-gray-300">{s.player_label || `#${s.player_id}`}</td>
                <td className="py-2 pr-4 text-gray-400 capitalize">{s.stat_type}</td>
                <td className="py-2 pr-4 text-yellow-400 font-mono">{s.suggested_value}</td>
                <td className="py-2">
                  <input
                    type="number" min="0"
                    value={vals[s.id] ?? ''}
                    onChange={e => setVals(v => ({ ...v, [s.id]: e.target.value }))}
                    className="w-20 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-white font-mono text-sm focus:outline-none focus:border-brand-500"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        onClick={save}
        className="mt-4 bg-brand-500 hover:bg-brand-600 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors"
      >
        Confirm stats & mark reviewed
      </button>
    </div>
  )
}

function StatusBadge({ status }) {
  const map = {
    pending: 'bg-yellow-500/20 text-yellow-400',
    processing: 'bg-blue-500/20 text-blue-400',
    reviewed: 'bg-purple-500/20 text-purple-400',
    approved: 'bg-green-500/20 text-green-400',
    rejected: 'bg-red-500/20 text-red-400',
  }
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${map[status] || 'bg-gray-700 text-gray-400'}`}>
      {status}
    </span>
  )
}
