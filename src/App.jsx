import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './lib/AuthContext'
import Header from './components/Header'
import Landing from './pages/Landing'
import Join from './pages/Join'
import Login from './pages/Login'
import AdminLayout from './pages/admin/AdminLayout'
import Dashboard from './pages/admin/Dashboard'
import TeamsManager from './pages/admin/TeamsManager'
import VideoQueue from './pages/admin/VideoQueue'
import ProStudioBench from './pages/admin/ProStudioBench'
import TeamLayout from './pages/team/TeamLayout'
import TeamHome from './pages/team/TeamHome'
import Games from './pages/team/Games'
import SubmitVideo from './pages/team/SubmitVideo'

const Soon = ({ title }) => (
  <div className="text-gray-400 py-16 text-center">
    <div className="text-2xl font-bold text-white mb-2">{title}</div>
    <div>Coming soon</div>
  </div>
)

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/join" element={
            <div className="min-h-screen bg-gray-950">
              <Header />
              <Join />
            </div>
          } />

          {/* Admin */}
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="teams" element={<TeamsManager />} />
            <Route path="videos" element={<VideoQueue />} />
            <Route path="pro-studio-bench" element={<ProStudioBench />} />
            <Route path="settings" element={<Soon title="Settings" />} />
          </Route>

          {/* Team portal — /club/age/gender/year */}
          <Route path="/:club/:age/:gender/:year" element={<TeamLayout />}>
            <Route index element={<TeamHome />} />
            <Route path="games" element={<Games />} />
            <Route path="submit-video" element={<SubmitVideo />} />
            <Route path="stats" element={<Soon title="Stats" />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
