import { useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { MoneyField } from '../components/MoneyField'
import { EmptyState, Page } from '../components/Page'
import { RESULT_TONE_CLASS, buyInText, durationText, handCountText, resultDisplay, roomName } from '../components/sessions/sessionText'
import { TableSnapshot } from '../components/sessions/TableSnapshot'
import { formatCents, type Cents } from '../domain/money'
import { newId, stakesLabel } from '../domain/poker/factories'
import { heroOutcome, heroResultOf } from '../domain/poker/lifecycle'
import { rakeStructureSummary } from '../domain/poker/rake'
import { summarizeSession, type SessionSummary } from '../domain/poker/sessionSummary'
import { describeTable, positionName } from '../domain/poker/tableView'
import { useNow } from '../hooks/useNow'
import { useStore } from '../store/context'
import { formatClock, formatDate, formatDateTime } from '../utils/labels'
import { HandCard } from './HandHistoryPage'

export function SessionPage() {
  const { sessionId } = useParams()
  const { sessions, hands, players, ready, saveSession, deleteSession, setActiveSessionId } = useStore()
  const [addingBuyIn, setAddingBuyIn] = useState(false)
  const [buyInAmount, setBuyInAmount] = useState<Cents>(0)
  const [cashOut, setCashOut] = useState<Cents>(0)
  const [ending, setEnding] = useState(false)

  const session = sessions.find((entry) => entry.id === sessionId)
  const now = useNow(session?.endedAt === null)
  const sessionHands = useMemo(
    () => hands.filter((hand) => hand.sessionId === sessionId),
    [hands, sessionId],
  )

  const stats = useMemo(() => {
    let recordedNet = 0
    let won = 0
    let favorites = 0
    for (const hand of sessionHands) {
      // Reconstructed hands without enough detail have no figure to add.
      recordedNet += heroResultOf(hand) ?? 0
      const outcome = heroOutcome(hand)
      if (outcome === 'won' || outcome === 'split') won += 1
      if (hand.favorite) favorites += 1
    }
    return { recordedNet, won, favorites }
  }, [sessionHands])

  if (!ready) return <Page title="Session"><p className="text-sm text-room-400">Loading…</p></Page>
  if (!session) return <Navigate to="/sessions" replace />

  const summary = summarizeSession(session, hands, now)
  const settled = session.cashOut !== null
  const live = summary.live
  const result = resultDisplay(summary)
  const views = describeTable(session, players)
  const activate = () => setActiveSessionId(session.id)

  return (
    <Page
      title={roomName(summary)}
      back={{ to: '/sessions', label: 'Sessions' }}
      subtitle={
        <>
          {stakesLabel(session)} {session.gameType} · {session.tableSize}-handed
        </>
      }
    >
      <div className="space-y-5 pb-8">
        <p className="-mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-room-300 tabular">
          {live && (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold tracking-[0.14em] text-felt-200">
              <span className="sj-live-dot" aria-hidden="true" />
              LIVE
            </span>
          )}
          <span>{formatDate(session.startedAt)}</span>
          <span aria-hidden="true" className="text-room-500">·</span>
          <span>{timeRange(summary)}</span>
        </p>

        <section aria-labelledby="session-result" className={`card-surface p-4 ${live ? 'sj-card--live' : ''}`}>
          <h2 id="session-result" className="sr-only">
            Result
          </h2>
          <p className={`tabular font-semibold leading-none tracking-tight ${result.numeric ? 'text-4xl' : 'text-2xl'} ${RESULT_TONE_CLASS[result.tone]}`}>
            {result.figure}
          </p>
          <p className="mt-1.5 text-xs uppercase tracking-wide text-room-400">
            {result.numeric ? `Session ${result.caption.toLowerCase()}` : result.caption}
          </p>

          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-room-700/70 pt-4 sm:grid-cols-4">
            <Stat label={summary.buyInCount > 1 ? 'Buy-ins' : 'Buy-in'} value={buyInText(summary)} />
            <Stat
              label="Cash-out"
              value={summary.cashOut !== null ? formatCents(summary.cashOut) : live ? 'Not yet' : '—'}
              tone={summary.cashOut !== null ? 'default' : 'muted'}
            />
            <Stat label={live ? 'Playing for' : 'Duration'} value={durationText(summary)} />
            <Stat label="Hands" value={String(summary.handCount)} />
          </dl>
        </section>

        <nav aria-label="Session actions" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {live ? (
            <>
              <Link to="/table" onClick={activate} className="btn-primary h-12">
                Return to table
              </Link>
              <Link to="/record" onClick={activate} className="btn-primary h-12">
                Record hand
              </Link>
              <a href="#session-hands" className="btn-secondary col-span-2 h-12 sm:col-span-1">
                View hands
              </a>
            </>
          ) : (
            <>
              <a href="#session-hands" className="btn-secondary h-12">
                View hands
              </a>
              <Link to="/table" onClick={activate} className="btn-secondary h-12">
                Table
              </Link>
              <Link to="/record" onClick={activate} className="btn-secondary col-span-2 h-12 sm:col-span-1">
                Record hand
              </Link>
            </>
          )}
        </nav>

        <Link
          to="/table"
          onClick={activate}
          aria-label={`Open the table. ${tableSnapshotText(views)}`}
          className="card-surface flex items-center gap-4 p-3 transition-colors hover:border-room-500"
        >
          <div className="w-32 shrink-0 min-[400px]:w-36">
            <TableSnapshot views={views} />
          </div>
          <div aria-hidden="true" className="min-w-0 text-sm">
            <p className="label mb-1">Table</p>
            <SnapshotLines views={views} />
            <p className="mt-2 text-sm font-semibold text-felt-200">Open table →</p>
          </div>
        </Link>

        <section className="space-y-2">
          {sessionHands.length > 0 && (
            <div className="rounded-lg border border-room-700 bg-room-850 p-3">
              <p className="text-sm">
                Across recorded hands: <span className="tabular font-semibold">{formatCents(stats.recordedNet, { sign: true })}</span>
                <span className="text-room-400"> · {stats.won} won · {stats.favorites} favourite</span>
              </p>
              <p className="mt-1 text-xs text-room-400">
                These figures cover only the hands you chose to record. If you record mainly big or
                interesting pots, they are not a sample of how the session went — the buy-in and
                cash-out figures above are.
              </p>
            </div>
          )}

          <p className="text-xs text-room-400">Drop: {rakeStructureSummary(session.rake)}</p>
        </section>

        <div className="grid grid-cols-2 gap-2">
          <Link to={`/sessions/${session.id}/players`} className="btn-secondary h-12">
            Players
          </Link>
          <button
            type="button"
            className="btn-secondary h-12"
            onClick={() => setAddingBuyIn((open) => !open)}
          >
            Add buy-in
          </button>
        </div>

        {addingBuyIn && (
          <section className="card-surface space-y-3 p-3">
            <MoneyField label="Additional buy-in" value={buyInAmount} onChange={setBuyInAmount} />
            <button
              type="button"
              className="btn-primary w-full"
              disabled={buyInAmount <= 0}
              onClick={async () => {
                await saveSession({
                  ...session,
                  buyIns: [
                    ...session.buyIns,
                    { id: newId(), amount: buyInAmount, at: new Date().toISOString() },
                  ],
                })
                setBuyInAmount(0)
                setAddingBuyIn(false)
              }}
            >
              Add {formatCents(buyInAmount)}
            </button>
          </section>
        )}

        <section className="card-surface space-y-3 p-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-room-400">
            {settled ? 'Session ended' : 'End session'}
          </h2>
          {settled ? (
            <button
              type="button"
              className="btn-secondary w-full"
              onClick={() => void saveSession({ ...session, endedAt: null, cashOut: null })}
            >
              Reopen session
            </button>
          ) : ending ? (
            <>
              <MoneyField
                label="Cash out"
                value={cashOut}
                onChange={setCashOut}
                hint="What you took off the table. This is what session profit is calculated from."
              />
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className="btn-secondary" onClick={() => setEnding(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={async () => {
                    await saveSession({
                      ...session,
                      cashOut,
                      endedAt: new Date().toISOString(),
                    })
                    setEnding(false)
                  }}
                >
                  End session
                </button>
              </div>
            </>
          ) : (
            <button type="button" className="btn-secondary w-full" onClick={() => setEnding(true)}>
              Cash out and end
            </button>
          )}
        </section>

        <section id="session-hands" className="scroll-mt-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-room-400">
            Hands · {handCountText(sessionHands.length)}
          </h2>
          {sessionHands.length === 0 ? (
            <EmptyState
              title="No hands recorded yet"
              description="Record a hand while it is fresh. The table details carry over, so you only pick your seat, your cards and the action."
              action={
                <Link to="/record" onClick={activate} className="btn-primary">
                  Record a hand
                </Link>
              }
            />
          ) : (
            <ul className="space-y-2">
              {sessionHands.map((hand) => (
                <li key={hand.id}>
                  <HandCard hand={hand} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card-surface p-3">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-room-400">
            Danger zone
          </h2>
          <DeleteSessionButton
            label={`Delete session and ${sessionHands.length} hand${sessionHands.length === 1 ? '' : 's'}`}
            onConfirm={() => void deleteSession(session.id)}
          />
        </section>
      </div>
    </Page>
  )
}

function Stat({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: string
  tone?: 'default' | 'good' | 'bad' | 'muted'
}) {
  const toneClass =
    tone === 'good' ? 'text-gain' : tone === 'bad' ? 'text-loss' : tone === 'muted' ? 'text-room-400' : ''
  return (
    <div className="min-w-0">
      <dt className="text-[0.7rem] uppercase tracking-wide text-room-400">{label}</dt>
      <dd className={`text-base font-semibold tabular sm:text-lg ${toneClass}`}>{value}</dd>
    </div>
  )
}

/** "7:15 PM – 11:33 PM", "Started 7:15 PM", or a dated end when it ran past midnight. */
function timeRange(summary: SessionSummary): string {
  if (summary.endedAt === null) return `Started ${formatClock(summary.startedAt)}`
  const sameDay = new Date(summary.startedAt).toDateString() === new Date(summary.endedAt).toDateString()
  return `${formatClock(summary.startedAt)} – ${sameDay ? formatClock(summary.endedAt) : formatDateTime(summary.endedAt)}`
}

function snapshotFacts(views: ReturnType<typeof describeTable>) {
  const hero = views.find((view) => view.isHero)
  const button = views.find((view) => view.isButton)
  const occupied = views.filter((view) => !view.isEmpty).length
  return { hero, button, occupied }
}

function SnapshotLines({ views }: { views: ReturnType<typeof describeTable> }) {
  const { hero, button, occupied } = snapshotFacts(views)
  return (
    <>
      <p className="font-semibold text-room-50 tabular">
        {hero ? `Seat ${hero.seat}${hero.position ? ` · ${hero.position}` : ''}` : 'Your seat not set'}
      </p>
      <p className="text-room-300 tabular">
        {views.length}-handed · {occupied} of {views.length} seated
      </p>
      <p className="text-room-400 tabular">
        {button ? `Button seat ${button.seat}${button.isEmpty ? ' (dead)' : ''}` : 'Button not placed'}
      </p>
    </>
  )
}

/** The snapshot in words: "You are in seat 8, button. 9-handed, 7 seats occupied. Dealer button on seat 8." */
function tableSnapshotText(views: ReturnType<typeof describeTable>): string {
  const { hero, button, occupied } = snapshotFacts(views)
  return [
    hero
      ? `You are in seat ${hero.seat}${hero.position ? `, ${positionName(hero.position).toLowerCase()}` : ''}.`
      : 'Your seat is not set.',
    `${views.length}-handed, ${occupied} seats occupied.`,
    button ? `Dealer button on seat ${button.seat}${button.isEmpty ? ', which is empty' : ''}.` : 'Dealer button not placed.',
  ].join(' ')
}

export function DeleteSessionButton({
  label,
  onConfirm,
}: {
  label: string
  onConfirm: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  if (!confirming) {
    return (
      <button type="button" className="btn-danger w-full" onClick={() => setConfirming(true)}>
        {label}
      </button>
    )
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      <button type="button" className="btn-secondary" onClick={() => setConfirming(false)}>
        Keep
      </button>
      <button type="button" className="btn-danger" onClick={onConfirm}>
        Delete permanently
      </button>
    </div>
  )
}
