import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { PlayCircle, BarChart2 } from 'lucide-react'

export default function Games() {
  const { club, age, gender, year } = useParams()
  const teamPath = `${club}/${age}/${gender}/${year}`
  const [games, setGames] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const { data: team } = await supabase
        .from('teams').select('id').eq('team_path', teamPath).single()
      if (!team) { setLoading(false); return }
      const { data } = await supabase
        .from('team_games')
        .select('*')
        .eq('team_id', team.id)
        .order('game_date', { ascending: false })
      setGames(data || [])
      setLoading(false)
    }
    load()
  }, [teamPath])

  if (loading) return <div className="text-gray-500">Loading…</div>

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Games</h1>
      {games.length === 0 ? (
        <div className="text-gray-500">No games recorded yet.</div>
      ) : (
        <div className="space-y-3">
          {games.map(g => (
            <div key={g.id} className="bg-gray-900 border border-gray-800 rounded-2xl px-6 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-lg">vs {g.opponent}</div>
                  <div className="text-sm text-gray-400 mt-0.5">
                    {new Date(g.game_date).toLocaleDateString('en-AU', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}
                    {g.venue && ` · ${g.venue}`}
                  </div>
                </div>
                <div className="text-right flex items-center gap-4">
                  {g.our_score != null && (
                    <div>
                      <div className={`text-2xl font-bold ${g.our_score > g.opponent_score ? 'text-green-400' : 'text-red-400'}`}>
                        {g.our_score} – {g.opponent_score}
                      </div>
                      <div className="text-xs text-gray-500 text-right">
                        {g.our_score > g.opponent_score ? 'WIN' : 'LOSS'}
                      </div>
                    </div>
                  )}
                  <div className="flex flex-col gap-2">
                    {g.youtube_url && (
                      <a
                        href={g.youtube_url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-xs bg-red-500/20 text-red-400 hover:bg-red-500/30 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        <PlayCircle className="w-3.5 h-3.5" /> Watch
                      </a>
                    )}
                    <button className="flex items-center gap-1.5 text-xs bg-brand-500/20 text-brand-400 hover:bg-brand-500/30 px-3 py-1.5 rounded-lg transition-colors">
                      <BarChart2 className="w-3.5 h-3.5" /> Box score
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
