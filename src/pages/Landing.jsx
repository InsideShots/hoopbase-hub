import { Link } from 'react-router-dom'
import { ChevronRight, BarChart2, Video, Users, Shield } from 'lucide-react'

const features = [
  {
    icon: BarChart2,
    title: 'Live Stat Entry',
    desc: 'Track every point, rebound, and assist in real-time during games.',
  },
  {
    icon: Video,
    title: 'AI-Assisted Video Analysis',
    desc: 'Submit game footage — YOLO tracking suggests stats automatically for your admin to confirm.',
  },
  {
    icon: Users,
    title: 'Full Team Management',
    desc: 'Players, games, schedules, and performance analytics in one place.',
  },
  {
    icon: Shield,
    title: 'Club-Level Organisation',
    desc: 'Structure by club / age group / gender / season. Every team gets their own space.',
  },
]

export default function Landing() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Hero */}
      <section className="px-6 py-24 text-center max-w-4xl mx-auto">
        <div className="inline-block bg-brand-500/10 border border-brand-500/30 text-brand-400 text-sm font-medium px-4 py-1.5 rounded-full mb-6">
          Australian Grassroots Basketball
        </div>
        <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-6">
          Your team's{' '}
          <span className="text-brand-500">basketball hub</span>
        </h1>
        <p className="text-gray-400 text-lg mb-10 max-w-2xl mx-auto">
          HoopBase gives every club, age group, and team their own stats platform —
          game tracking, video analysis, and player development, all free.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            to="/join"
            className="inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
          >
            Register your team <ChevronRight className="w-4 h-4" />
          </Link>
          <a
            href="#how-it-works"
            className="inline-flex items-center gap-2 border border-gray-700 hover:border-gray-500 text-gray-300 font-semibold px-6 py-3 rounded-xl transition-colors"
          >
            How it works
          </a>
        </div>
      </section>

      {/* Features */}
      <section id="how-it-works" className="px-6 py-20 bg-gray-900">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">Everything your team needs</h2>
          <div className="grid sm:grid-cols-2 gap-6">
            {features.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-gray-800 rounded-2xl p-6 border border-gray-700">
                <div className="w-10 h-10 bg-brand-500/20 rounded-xl flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-brand-400" />
                </div>
                <h3 className="font-semibold text-lg mb-2">{title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Video pipeline callout */}
      <section className="px-6 py-20 max-w-4xl mx-auto text-center">
        <h2 className="text-3xl font-bold mb-4">How video analysis works</h2>
        <p className="text-gray-400 mb-10">From raw footage to confirmed stats in minutes.</p>
        <div className="flex flex-col md:flex-row gap-4 text-left">
          {[
            { step: '1', label: 'Submit', desc: 'Upload your YouTube game link via your team portal.' },
            { step: '2', label: 'Analyse', desc: 'YOLO tracking auto-detects players and suggests stats.' },
            { step: '3', label: 'Confirm', desc: 'Team admin reviews suggestions and commits final stats.' },
            { step: '4', label: 'Publish', desc: 'Video added to your HoopBase YouTube playlist. Stats live.' },
          ].map(({ step, label, desc }) => (
            <div key={step} className="flex-1 bg-gray-900 border border-gray-700 rounded-2xl p-5">
              <div className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center text-sm font-bold mb-3">
                {step}
              </div>
              <div className="font-semibold mb-1">{label}</div>
              <div className="text-gray-400 text-sm">{desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-20 bg-brand-600 text-center">
        <h2 className="text-3xl font-bold mb-4">Ready to get started?</h2>
        <p className="text-brand-100 mb-8">Free for all Australian grassroots basketball clubs.</p>
        <Link
          to="/join"
          className="inline-flex items-center gap-2 bg-white text-brand-700 font-bold px-8 py-3 rounded-xl hover:bg-brand-50 transition-colors"
        >
          Register your team <ChevronRight className="w-4 h-4" />
        </Link>
      </section>

      <footer className="bg-gray-950 border-t border-gray-800 px-6 py-8 text-center text-gray-500 text-sm">
        © {new Date().getFullYear()} HoopBase Pty Ltd · Australian grassroots basketball
      </footer>
    </div>
  )
}
