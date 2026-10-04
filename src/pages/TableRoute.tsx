import { Link, Navigate } from 'react-router-dom'
import { EmptyState, Page } from '../components/Page'
import { useActiveSession } from '../store/useActiveSession'

/** The "Table" tab: jumps to whichever session is currently being played. */
export function TableRoute() {
  const { session, sessions, ready } = useActiveSession()

  if (!ready) {
    return (
      <Page title="Current session">
        <p className="text-sm text-room-400">Loading…</p>
      </Page>
    )
  }

  if (session) return <Navigate to={`/sessions/${session.id}`} replace />

  return (
    <Page title="Current session">
      <EmptyState
        title="No session in progress"
        description="Start a session to set your room, stakes, table size and drop once, then record hands against it."
        action={
          <Link to={sessions.length === 0 ? '/sessions/new' : '/sessions'} className="btn-primary">
            {sessions.length === 0 ? 'Start a session' : 'Choose a session'}
          </Link>
        }
      />
    </Page>
  )
}
