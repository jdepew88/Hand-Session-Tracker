import { Link } from 'react-router-dom'
import { EmptyState, Page } from '../components/Page'
import { formatCents } from '../domain/money'
import { heroResultOf } from '../domain/poker/lifecycle'
import type { Session } from '../domain/poker/models'
import { stakesLabel } from '../domain/poker/factories'
import { useStore } from '../store/context'
import { formatDate, formatDuration } from '../utils/labels'

export function SessionsPage() {
  const { sessions, hands, ready, activeSessionId, setActiveSessionId } = useStore()

  return (
    <Page
      title="Sessions"
      subtitle="Everything is stored on this device."
      action={
        <Link to="/sessions/new" className="btn-primary shrink-0">
          New session
        </Link>
      }
    >
      {!ready ? (
        <p className="text-sm text-room-400">Loading…</p>
      ) : sessions.length === 0 ? (
        <EmptyState
          title="No sessions yet"
          description="Start a session with your room, stakes and buy-in. You only enter the table details once, then every hand reuses them."
          action={
            <Link to="/sessions/new" className="btn-primary">
              Start a session
            </Link>
          }
        />
      ) : (
        <ul className="space-y-2">
          {sessions.map((session) => (
            <li key={session.id}>
              <SessionCard
                session={session}
                handCount={hands.filter((hand) => hand.sessionId === session.id).length}
                recordedNet={hands
                  .filter((hand) => hand.sessionId === session.id)
                  .reduce((sum, hand) => sum + heroResultOf(hand), 0)}
                active={session.id === activeSessionId}
                onSelect={() => setActiveSessionId(session.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </Page>
  )
}

function SessionCard({
  session,
  handCount,
  recordedNet,
  active,
  onSelect,
}: {
  session: Session
  handCount: number
  recordedNet: number
  active: boolean
  onSelect: () => void
}) {
  const live = session.endedAt === null

  return (
    <Link
      to={`/sessions/${session.id}`}
      onClick={onSelect}
      className={`card-surface block px-3 py-3 transition-colors hover:border-room-500 ${
        active ? 'border-felt-500/60' : ''
      }`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="truncate font-semibold">{session.location || 'Unnamed room'}</p>
        <p className="shrink-0 text-sm text-room-400 tabular">{formatDate(session.startedAt)}</p>
      </div>
      <p className="mt-0.5 text-sm text-room-300 tabular">
        {stakesLabel(session)} · {session.gameType} · {session.tableSize}-handed
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        {live && <span className="chip border-felt-500/50 text-felt-200">Live</span>}
        {active && <span className="chip">Active</span>}
        <span className="chip tabular">{formatDuration(session.startedAt, session.endedAt)}</span>
        <span className="chip tabular">
          {handCount} hand{handCount === 1 ? '' : 's'}
        </span>
        {handCount > 0 && (
          <span
            className={`chip tabular ${recordedNet >= 0 ? 'text-felt-200' : 'text-chip-red'}`}
            title="Across recorded hands only"
          >
            {formatCents(recordedNet, { sign: true })} recorded
          </span>
        )}
      </div>
    </Link>
  )
}
