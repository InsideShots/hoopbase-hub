import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Check, X, ExternalLink } from 'lucide-react'

export default function TeamsManager() {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('pending')

  const load = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('hb_team_join_requests')
      .select('*')
      .order('created_at', { ascending: false })
    setRequests(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const updateStatus = async (id, status) => {
    await supabase.from('hb_team_join_requests').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
    load()
  }

  const filtered = requests.filter(r => filter === 'all' ? true : r.status === filter)

  const teamUrl = (r) =>
    `hoopbase.com.au/${r.club_slug}/${r.age_group?.toLowerCase()}/${r.gender?.toLowerCase()}/${r.season_year}`

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Teams</h1>
        <div className="flex gap-2">
          {['pending','approved','rejected','all'].map(s => (
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

      {loading ? (
        <div className="text-gray-500">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-gray-500">No {filter} requests.</div>
      ) : (
        <div className="space-y-3">
          {filtered.map(r => (
            <div key={r.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="font-semibold text-lg">{r.club_name}</span>
                    <StatusBadge status={r.status} />
                  </div>
                  <div className="text-sm text-gray-400 mb-1">
                    {r.age_group} · {r.gender} · {r.season_year} · {r.competition} · {r.state}
                  </div>
                  <div className="text-sm text-gray-400 mb-2">
                    {r.contact_name} — <a href={`mailto:${r.contact_email}`} className="text-brand-400 hover:underline">{r.contact_email}</a>
                  </div>
                  <div className="font-mono text-xs text-gray-500 flex items-center gap-1">
                    <ExternalLink className="w-3 h-3" /> {teamUrl(r)}
                  </div>
                  {r.notes && <p className="text-sm text-gray-400 mt-2 italic">"{r.notes}"</p>}
                </div>
                {r.status === 'pending' && (
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => updateStatus(r.id, 'approved')}
                      className="flex items-center gap-1.5 bg-green-500/20 hover:bg-green-500/30 text-green-400 px-3 py-1.5 rounded-lg text-sm transition-colors"
                    >
                      <Check className="w-4 h-4" /> Approve
                    </button>
                    <button
                      onClick={() => updateStatus(r.id, 'rejected')}
                      className="flex items-center gap-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 px-3 py-1.5 rounded-lg text-sm transition-colors"
                    >
                      <X className="w-4 h-4" /> Reject
                    </button>
                  </div>
                )}
              </div>
              <div className="text-xs text-gray-600 mt-3">
                Submitted {new Date(r.created_at).toLocaleDateString('en-AU', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }) {
  const map = {
    pending: 'bg-yellow-500/20 text-yellow-400',
    approved: 'bg-green-500/20 text-green-400',
    rejected: 'bg-red-500/20 text-red-400',
  }
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${map[status] || 'bg-gray-700 text-gray-400'}`}>
      {status}
    </span>
  )
}
