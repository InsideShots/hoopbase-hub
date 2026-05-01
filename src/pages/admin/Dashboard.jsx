import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Users, Video, Clock, CheckCircle } from 'lucide-react'

export default function Dashboard() {
  const [stats, setStats] = useState({ pending_teams: 0, active_teams: 0, pending_videos: 0, total_videos: 0 })

  useEffect(() => {
    const load = async () => {
      const [teams, videos] = await Promise.all([
        supabase.from('team_join_requests').select('status'),
        supabase.from('video_submissions').select('status'),
      ])
      const tr = teams.data || []
      const vr = videos.data || []
      setStats({
        pending_teams: tr.filter(t => t.status === 'pending').length,
        active_teams: tr.filter(t => t.status === 'approved').length,
        pending_videos: vr.filter(v => v.status === 'pending').length,
        total_videos: vr.length,
      })
    }
    load()
  }, [])

  const cards = [
    { label: 'Pending team requests', value: stats.pending_teams, icon: Clock, color: 'text-yellow-400', href: '/admin/teams' },
    { label: 'Active teams', value: stats.active_teams, icon: Users, color: 'text-green-400', href: '/admin/teams' },
    { label: 'Videos awaiting review', value: stats.pending_videos, icon: Video, color: 'text-brand-400', href: '/admin/videos' },
    { label: 'Total video submissions', value: stats.total_videos, icon: CheckCircle, color: 'text-blue-400', href: '/admin/videos' },
  ]

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-8">Dashboard</h1>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        {cards.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <Icon className={`w-5 h-5 ${color} mb-3`} />
            <div className="text-3xl font-bold mb-1">{value}</div>
            <div className="text-gray-400 text-sm">{label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
