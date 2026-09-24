import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { HandHistoryPage } from './pages/HandHistoryPage'
import { NewSessionPage } from './pages/NewSessionPage'
import { PlayersPage } from './pages/PlayersPage'
import { RecordHandPage } from './pages/RecordHandPage'
import { RecordRoute } from './pages/RecordRoute'
import { SessionPage } from './pages/SessionPage'
import { SessionsPage } from './pages/SessionsPage'
import { SettingsPage } from './pages/SettingsPage'
import { TableRoute } from './pages/TableRoute'

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<SessionsPage />} />
        <Route path="sessions/new" element={<NewSessionPage />} />
        <Route path="sessions/:sessionId" element={<SessionPage />} />
        <Route path="sessions/:sessionId/players" element={<PlayersPage />} />
        <Route path="table" element={<TableRoute />} />
        <Route path="record" element={<RecordRoute />} />
        <Route path="hands" element={<HandHistoryPage />} />
        <Route path="hands/:handId" element={<RecordHandPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
