import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { SETTINGS_ICON } from '../components/AppShell'
import { Page } from '../components/Page'
import { SessionCard } from '../components/sessions/SessionCard'
import { TableGlyph } from '../components/sessions/TableGlyph'
import { summarizeSession, type SessionSummary } from '../domain/poker/sessionSummary'
import { describeTable } from '../domain/poker/tableView'
import { useNow } from '../hooks/useNow'
import { useStore } from '../store/context'

/**
 * The session journal: anything still being played first, then every
 * finished session, newest first, under a heading per month.
 */
export function SessionsPage() {
  const { sessions, hands, players, ready, setActiveSessionId } = useStore()
  const anyLive = sessions.some((session) => session.endedAt === null)
  const now = useNow(anyLive)

  const summaries = useMemo(
    () => sessions.map((session) => ({ session, summary: summarizeSession(session, hands, now) })),
    [sessions, hands, now],
  )
  const live = summaries.filter(({ summary }) => summary.live)
  const months = useMemo(
    () => groupByMonth(summaries.filter(({ summary }) => !summary.live).map(({ summary }) => summary)),
    [summaries],
  )

  return (
    <Page
      title="Sessions"
      subtitle="Your poker journal. Everything is stored on this device."
      action={
        <div className="flex shrink-0 items-center gap-1">
          {sessions.length > 0 && (
            <Link to="/sessions/new" className="btn-primary shrink-0">
              New session
            </Link>
          )}
          {/* On a phone Settings is not in the tab bar; it lives here. */}
          <Link to="/settings" aria-label="Settings" className="btn-ghost h-11 w-11 px-0 sm:hidden">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d={SETTINGS_ICON} />
            </svg>
          </Link>
        </div>
      }
    >
      {!ready ? (
        <p className="text-sm text-room-400">Loading…</p>
      ) : sessions.length === 0 ? (
        <section className="card-surface flex flex-col items-center px-5 py-10 text-center">
          <TableGlyph seats={9} className="h-12 w-16" />
          <h2 className="mt-4 text-lg font-semibold tracking-tight">No sessions yet</h2>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-room-300">
            Start your first session and SessionTracker will keep your table, hands and results together.
          </p>
          <Link to="/sessions/new" className="btn-primary mt-5 h-12 px-6">
            Start a session
          </Link>
        </section>
      ) : (
        <div className="space-y-7 pb-8">
          {live.length > 0 && (
            <section aria-labelledby="sessions-live">
              <h2 id="sessions-live" className="label">
                {live.length === 1 ? 'Live session' : 'Live sessions'}
              </h2>
              <ul className="space-y-3">
                {live.map(({ session, summary }) => (
                  <li key={session.id}>
                    <SessionCard
                      summary={summary}
                      now={now}
                      {...seatNoteFor(describeTable(session, players))}
                      onOpen={() => setActiveSessionId(session.id)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {months.length === 0 ? (
            <p className="text-sm text-room-400">Finished sessions will collect here.</p>
          ) : (
            months.map((month) => (
              <section key={month.key} aria-labelledby={`sessions-${month.key}`}>
                <h2 id={`sessions-${month.key}`} className="label">
                  {month.label}
                </h2>
                <ul className="space-y-2.5">
                  {month.sessions.map((summary) => (
                    <li key={summary.id}>
                      <SessionCard summary={summary} now={now} onOpen={() => setActiveSessionId(summary.id)} />
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      )}
    </Page>
  )
}

function seatNoteFor(views: ReturnType<typeof describeTable>): { seatNote?: string } {
  const hero = views.find((view) => view.isHero)
  return hero ? { seatNote: `Seat ${hero.seat}${hero.position ? ` · ${hero.position}` : ''}` } : {}
}

/** Sessions arrive newest first; keep that order within and across months. */
function groupByMonth(summaries: SessionSummary[]) {
  const months: { key: string; label: string; sessions: SessionSummary[] }[] = []
  for (const summary of summaries) {
    const time = Date.parse(summary.startedAt)
    const date = Number.isNaN(time) ? null : new Date(time)
    const key = date ? `${date.getFullYear()}-${date.getMonth() + 1}` : 'undated'
    let month = months.find((entry) => entry.key === key)
    if (!month) {
      const label = date
        ? date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
        : 'Undated'
      month = { key, label, sessions: [] }
      months.push(month)
    }
    month.sessions.push(summary)
  }
  return months
}
