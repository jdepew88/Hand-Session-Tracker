import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { HandHistoryPage } from './pages/HandHistoryPage'
import { HomePage } from './pages/HomePage'
import { NewSessionPage } from './pages/NewSessionPage'
import { PlayersPage } from './pages/PlayersPage'
import { RecordHandPage } from './pages/RecordHandPage'
import { RecordRoute } from './pages/RecordRoute'
import { ResultsPage } from './pages/ResultsPage'
import { SessionPage } from './pages/SessionPage'
import { SessionsPage } from './pages/SessionsPage'
import { SettingsPage } from './pages/SettingsPage'
import { TableRoute } from './pages/TableRoute'
import { ResultsProvider } from './store/ResultsProvider'

export function App() {
  return (
    <Routes>
      {/* The homepage has its own site header, so it sits outside the app's tab-bar shell. */}
      <Route index element={<HomePage />} />
      <Route
        element={
          <ResultsProvider>
            <AppShell />
          </ResultsProvider>
        }
      >
        <Route path="sessions" element={<SessionsPage />} />
        <Route path="sessions/new" element={<NewSessionPage />} />
        <Route path="sessions/:sessionId" element={<SessionPage />} />
        <Route path="sessions/:sessionId/players" element={<PlayersPage />} />
        <Route path="table" element={<TableRoute />} />
        <Route path="record" element={<RecordRoute />} />
        <Route path="hands" element={<HandHistoryPage />} />
        <Route path="hands/:handId" element={<RecordHandPage />} />
        <Route path="results" element={<ResultsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
