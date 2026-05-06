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
import Auth from './pages/auth/Auth'
import PlayerHome from './pages/player/Home'
import PlayerProfile from './pages/player/Profile'
import PlayerProfileEdit from './pages/player/ProfileEdit'
import PlayerProfileAccess from './pages/player/ProfileAccess'
import PlayerOnboard from './pages/player/Onboard'
import ConsentConfirm from './pages/player/ConsentConfirm'
import SuperAdmin from './pages/admin/SuperAdmin'

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
          <Route path="/auth" element={<Auth />} />

          {/* Player profiles */}
          <Route path="/p" element={<PlayerHome />} />
          <Route path="/p/onboard" element={<PlayerOnboard />} />
          <Route path="/p/consent-confirm" element={<ConsentConfirm />} />
          <Route path="/p/:uid" element={<PlayerProfile />} />
          <Route path="/p/:uid/edit" element={<PlayerProfileEdit />} />
          <Route path="/p/:uid/access" element={<PlayerProfileAccess />} />
          <Route path="/join" element={
            <div className="min-h-screen bg-gray-950">
              <Header />
              <Join />
            </div>
          } />

          {/* SuperAdmin — top-level URL Mark uses; gate is is_super_admin() RPC */}
          <Route path="/SuperAdmin" element={<SuperAdmin />} />

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
