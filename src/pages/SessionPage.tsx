import { useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { MoneyField } from '../components/MoneyField'
import { EmptyState, Page } from '../components/Page'
import { formatCents, type Cents } from '../domain/money'
import { newId, stakesLabel } from '../domain/poker/factories'
import { deriveHand } from '../domain/poker/lifecycle'
import { rakeStructureSummary } from '../domain/poker/rake'
import { useStore } from '../store/context'
import { formatDuration } from '../utils/labels'
import { HandCard } from './HandHistoryPage'

export function SessionPage() {
  const { sessionId } = useParams()
  const { sessions, hands, ready, saveSession, deleteSession, setActiveSessionId } = useStore()
  const [addingBuyIn, setAddingBuyIn] = useState(false)
  const [buyInAmount, setBuyInAmount] = useState<Cents>(0)
  const [cashOut, setCashOut] = useState<Cents>(0)
  const [ending, setEnding] = useState(false)

  const session = sessions.find((entry) => entry.id === sessionId)
  const sessionHands = useMemo(
    () => hands.filter((hand) => hand.sessionId === sessionId),
    [hands, sessionId],
  )

  const stats = useMemo(() => {
    let recordedNet = 0
    let won = 0
    let favorites = 0
    for (const hand of sessionHands) {
      const { result } = deriveHand(hand)
      recordedNet += result.heroResult
      if (result.winners.includes(hand.setup.heroSeat)) won += 1
      if (hand.favorite) favorites += 1
    }
    return { recordedNet, won, favorites }
  }, [sessionHands])

  if (!ready) return <Page title="Session"><p className="text-sm text-room-400">Loading…</p></Page>
  if (!session) return <Navigate to="/sessions" replace />

  const totalBuyIn = session.buyIns.reduce((sum, entry) => sum + entry.amount, 0)
  const settled = session.cashOut !== null

  return (
    <Page
      title={session.location || 'Unnamed room'}
      back={{ to: '/sessions', label: 'Sessions' }}
      subtitle={
        <>
          {stakesLabel(session)} · {session.gameType} · {session.tableSize}-handed
        </>
      }
      action={
        <Link
          to="/record"
          onClick={() => setActiveSessionId(session.id)}
          className="btn-primary shrink-0"
        >
          Record hand
        </Link>
      }
    >
      <div className="space-y-5 pb-8">
        <section className="card-surface p-3">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-room-400">
            Session
          </h2>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Buy-ins" value={formatCents(totalBuyIn)} />
            <Stat
              label={settled ? 'Cashed out' : 'Duration'}
              value={settled ? formatCents(session.cashOut!) : formatDuration(session.startedAt, session.endedAt)}
            />
            <Stat
              label="Session P/L"
              value={settled ? formatCents(session.cashOut! - totalBuyIn, { sign: true }) : '—'}
              tone={settled ? (session.cashOut! - totalBuyIn >= 0 ? 'good' : 'bad') : 'muted'}
            />
            <Stat label="Hands recorded" value={String(sessionHands.length)} />
          </dl>

          {sessionHands.length > 0 && (
            <div className="mt-3 rounded-lg border border-room-700 bg-room-850 p-3">
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

          <p className="mt-3 text-xs text-room-400">Drop: {rakeStructureSummary(session.rake)}</p>
        </section>

        <div className="grid grid-cols-2 gap-2">
          <Link to={`/sessions/${session.id}/players`} className="btn-secondary h-12">
            Table lineup
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

        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-room-400">
            Hands
          </h2>
          {sessionHands.length === 0 ? (
            <EmptyState
              title="No hands recorded yet"
              description="Record a hand while it is fresh. The table details carry over, so you only pick your seat, your cards and the action."
              action={
                <Link to="/record" className="btn-primary">
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
    tone === 'good' ? 'text-felt-200' : tone === 'bad' ? 'text-chip-red' : tone === 'muted' ? 'text-room-400' : ''
  return (
    <div>
      <dt className="text-[0.7rem] uppercase tracking-wide text-room-400">{label}</dt>
      <dd className={`text-lg font-semibold tabular ${toneClass}`}>{value}</dd>
    </div>
  )
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
