import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Calendar, Video, Trophy } from 'lucide-react'

export default function TeamHome() {
  const { club, age, gender, year } = useParams()
  const [teamData, setTeamData] = useState(null)
  const [recentGames, setRecentGames] = useState([])
  const teamPath = `${club}/${age}/${gender}/${year}`

  useEffect(() => {
    const load = async () => {
      const { data: team } = await supabase
        .from('teams')
        .select('*')
        .eq('team_path', teamPath)
        .single()
      setTeamData(team)

      if (team) {
        const { data: games } = await supabase
          .from('team_games')
          .select('*')
          .eq('team_id', team.id)
          .order('game_date', { ascending: false })
          .limit(5)
        setRecentGames(games || [])
      }
    }
    load()
  }, [teamPath])

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold capitalize mb-1">{club.replace(/-/g, ' ')}</h1>
        <p className="text-gray-400">{age} {gender} · {year} Season</p>
      </div>

      <div className="grid md:grid-cols-3 gap-4 mb-8">
        <Link to="games" className="bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-2xl p-5 transition-colors group">
          <Calendar className="w-6 h-6 text-brand-400 mb-3" />
          <div className="font-semibold mb-1 group-hover:text-white">Games</div>
          <div className="text-gray-400 text-sm">View schedule and results</div>
        </Link>
        <Link to="submit-video" className="bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-2xl p-5 transition-colors group">
          <Video className="w-6 h-6 text-brand-400 mb-3" />
          <div className="font-semibold mb-1 group-hover:text-white">Submit Video</div>
          <div className="text-gray-400 text-sm">Upload game footage for stat analysis</div>
        </Link>
        <Link to="stats" className="bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-2xl p-5 transition-colors group">
          <Trophy className="w-6 h-6 text-brand-400 mb-3" />
          <div className="font-semibold mb-1 group-hover:text-white">Stats</div>
          <div className="text-gray-400 text-sm">Player and team analytics</div>
        </Link>
      </div>

      {recentGames.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-4">Recent games</h2>
          <div className="space-y-2">
            {recentGames.map(g => (
              <div key={g.id} className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4 flex items-center justify-between">
                <div>
                  <div className="font-medium">vs {g.opponent}</div>
                  <div className="text-sm text-gray-400">{new Date(g.game_date).toLocaleDateString('en-AU', { weekday:'short', day:'numeric', month:'short' })}</div>
                </div>
                <div className="text-right">
                  {g.our_score != null ? (
                    <>
                      <div className={`text-lg font-bold ${g.our_score > g.opponent_score ? 'text-green-400' : 'text-red-400'}`}>
                        {g.our_score} – {g.opponent_score}
                      </div>
                      <div className="text-xs text-gray-500">{g.our_score > g.opponent_score ? 'W' : 'L'}</div>
                    </>
                  ) : (
                    <span className="text-gray-500 text-sm">TBC</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
