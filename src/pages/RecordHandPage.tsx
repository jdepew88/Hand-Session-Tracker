import { useMemo, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { ActionPanel } from '../components/ActionPanel'
import { CardPicker } from '../components/CardPicker'
import { HandStatusBar } from '../components/HandStatusBar'
import { HandSetupPanel } from '../components/HandSetupPanel'
import { HandSummaryPanel } from '../components/HandSummaryPanel'
import { Page } from '../components/Page'
import { SeatList } from '../components/SeatList'
import { ShowdownPanel } from '../components/ShowdownPanel'
import { formatCents } from '../domain/money'
import type { Card } from '../domain/poker/cards'
import { handContext, newId } from '../domain/poker/factories'
import { deriveHand } from '../domain/poker/lifecycle'
import type { ActionEvent, HandEvent, HandRecord, Street } from '../domain/poker/models'
import { awaitingBoardStreet, cardsRequiredFor, replay } from '../domain/poker/reducer'
import { useStore } from '../store/context'
import { seatTitle } from '../utils/labels'

const STREET_TITLE: Record<Exclude<Street, 'preflop'>, string> = {
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
}

/**
 * The recorder.
 *
 * All mutation goes through `update`, which writes the new record to storage
 * and mirrors it locally so the screen never lags a tap behind. The record
 * holds setup plus an event log; everything on screen is derived from a replay
 * of that log, which is why undo is a one-line operation and correcting an
 * earlier action cannot leave the pot and the stacks disagreeing.
 */
export function RecordHandPage() {
  const { handId } = useParams()
  const { hands, sessions, players, saveHand, deleteHand, ready } = useStore()

  const stored = hands.find((hand) => hand.id === handId)
  const [working, setWorking] = useState<HandRecord | null>(stored ?? null)
  const [workingId, setWorkingId] = useState<string | null>(stored?.id ?? null)
  const [editingSetup, setEditingSetup] = useState(false)

  // Switching to a different hand reloads the local copy; edits to the current
  // one are not clobbered by the store echoing our own write back.
  if ((stored?.id ?? null) !== workingId) {
    setWorkingId(stored?.id ?? null)
    setWorking(stored ?? null)
    setEditingSetup(false)
  }

  const record = working ?? stored ?? null
  const session = sessions.find((entry) => entry.id === record?.sessionId)

  const derived = useMemo(() => (record ? deriveHand(record) : null), [record])

  if (!ready) {
    return (
      <Page title="Hand">
        <p className="text-sm text-room-400">Loading…</p>
      </Page>
    )
  }
  if (!record || !derived) return <Navigate to="/hands" replace />

  const { state, result, inProgress } = derived
  const setupOpen = editingSetup || record.setup.heroCards.length < 2

  const update = (next: HandRecord) => {
    const stamped = { ...next, updatedAt: new Date().toISOString() }
    setWorking(stamped)
    void saveHand(stamped)
  }

  const pushEvent = (event: HandEvent) => update({ ...record, events: [...record.events, event] })

  const undo = () => {
    if (record.events.length === 0) return
    update({ ...record, events: record.events.slice(0, -1) })
  }

  const reveal = (seat: number, cards: Card[]) => {
    // One reveal per seat: replace rather than append, so undo stays meaningful.
    const withoutSeat = record.events.filter(
      (event) => !(event.kind === 'reveal' && event.seat === seat),
    )
    update({
      ...record,
      events: cards.length > 0
        ? [...withoutSeat, { id: newId(), kind: 'reveal', seat, cards }]
        : withoutSeat,
    })
  }

  const awaiting = awaitingBoardStreet(state)
  const lastEvent = record.events.at(-1)

  return (
    <Page
      title={`Hand #${record.handNumber}`}
      back={
        session
          ? { to: `/sessions/${session.id}`, label: session.location || 'Session' }
          : { to: '/hands', label: 'Hand history' }
      }
      subtitle={
        <>
          {record.context.stakesLabel} · {record.context.heroPosition} ·{' '}
          {record.context.tableSize}-handed
        </>
      }
    >
      {setupOpen && session ? (
        <HandSetupPanel
          setup={record.setup}
          session={session}
          onChange={(setup) =>
            update({ ...record, setup, context: handContext(session, setup) })
          }
          onStart={() => setEditingSetup(false)}
        />
      ) : (
        <div className="-mx-3 pb-8">
          <HandStatusBar state={state} />

          {state.actingSeat !== null && (
            <ActionPanel
              state={state}
              heroSeat={record.setup.heroSeat}
              bigBlind={record.setup.bigBlind}
              onAction={(event: ActionEvent) => pushEvent(event)}
            />
          )}

          {awaiting && (
            <div className="px-3 py-4">
              <p className="mb-3 text-sm text-room-300">
                Betting is complete. Enter the {STREET_TITLE[awaiting].toLowerCase()}.
              </p>
              <BoardEntry
                street={awaiting}
                usedCards={state.usedCards}
                onComplete={(cards) =>
                  pushEvent({ id: newId(), kind: 'deal', street: awaiting, cards })
                }
              />
            </div>
          )}

          {state.status === 'showdown' && (
            <ShowdownPanel
              state={state}
              result={result}
              heroSeat={record.setup.heroSeat}
              manualWinners={record.manualWinners}
              onReveal={reveal}
              onSetManualWinners={(seats) => update({ ...record, manualWinners: seats })}
            />
          )}

          {state.status === 'complete' && state.endedBy === 'fold' && (
            <p className="px-3 py-4 text-sm text-felt-200">
              Everyone else folded.{' '}
              {seatTitle(state.seats.get(state.activeSeats[0]!)!, record.setup.heroSeat)} wins{' '}
              <span className="tabular font-semibold">{formatCents(result.netPot)}</span>.
            </p>
          )}

          {!inProgress && (
            <HandSummaryPanel record={record} result={result} onChange={update} />
          )}

          <section className="px-3 py-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-room-400">
                Action log
              </h2>
              <button
                type="button"
                className="btn-secondary"
                disabled={record.events.length === 0}
                onClick={undo}
              >
                Undo last
              </button>
            </div>
            {lastEvent && (
              <p className="mb-2 text-xs text-room-400">
                Undo removes the most recent entry. Everything after it is recalculated from the
                action history, so pots and stacks stay consistent.
              </p>
            )}
            <ActionLog record={record} />
          </section>

          <section className="px-3 pb-4">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-room-400">
              Players
            </h2>
            <div className="card-surface overflow-hidden">
              <SeatList state={state} heroSeat={record.setup.heroSeat} showCards />
            </div>
          </section>

          <section className="space-y-2 px-3">
            {record.events.length === 0 ? (
              <button
                type="button"
                className="btn-secondary w-full"
                onClick={() => setEditingSetup(true)}
              >
                Edit hand setup
              </button>
            ) : (
              <p className="text-xs text-room-400">
                To change the button, your seat or a starting stack, undo back to the start of the
                hand.
              </p>
            )}
            <button
              type="button"
              className="btn-danger w-full"
              onClick={() => void deleteHand(record.id)}
            >
              Delete hand
            </button>
          </section>
        </div>
      )}

      {players.length === 0 && setupOpen && session && (
        <p className="mt-4 text-xs text-room-400">
          Tip: fill in the table lineup for this session and nicknames will appear here and in every
          saved hand.
        </p>
      )}
    </Page>
  )
}

/** Board entry that commits only once the whole street is filled in. */
function BoardEntry({
  street,
  usedCards,
  onComplete,
}: {
  street: Exclude<Street, 'preflop'>
  usedCards: readonly Card[]
  onComplete: (cards: Card[]) => void
}) {
  const [cards, setCards] = useState<Card[]>([])
  const required = cardsRequiredFor(street)

  return (
    <div className="space-y-3">
      <CardPicker
        legend={STREET_TITLE[street]}
        count={required}
        value={cards}
        usedCards={[...usedCards, ...cards]}
        onChange={setCards}
      />
      <button
        type="button"
        className="btn-primary h-14 w-full text-base"
        disabled={cards.length !== required}
        onClick={() => {
          onComplete(cards)
          setCards([])
        }}
      >
        Deal the {STREET_TITLE[street].toLowerCase()}
      </button>
    </div>
  )
}

/** Human-readable replay of what has been entered so far. */
function ActionLog({ record }: { record: HandRecord }) {
  const lines = useMemo(() => {
    const output: { key: string; text: string; street: Street }[] = []
    record.events.forEach((event, index) => {
      const before = replay(record.setup, record.events.slice(0, index))
      if (event.kind === 'deal') {
        output.push({
          key: event.id,
          street: event.street,
          text: `${STREET_TITLE[event.street]}: ${event.cards.join(' ')}`,
        })
        return
      }
      if (event.kind === 'reveal') {
        const seat = before.seats.get(event.seat)
        output.push({
          key: event.id,
          street: before.street,
          text: `${seat ? seatTitle(seat, record.setup.heroSeat) : `Seat ${event.seat}`} shows ${event.cards.join(' ')}`,
        })
        return
      }
      const seat = before.seats.get(event.seat)
      const who = seat ? seatTitle(seat, record.setup.heroSeat) : `Seat ${event.seat}`
      const added = seat ? Math.max(0, event.to - seat.streetCommitted) : 0
      const detail =
        event.action === 'fold' || event.action === 'check'
          ? ''
          : event.action === 'call'
            ? ` ${formatCents(Math.min(added, seat?.stack ?? added))}`
            : ` to ${formatCents(event.to)}`
      output.push({ key: event.id, street: event.street, text: `${who} ${event.action}s${detail}` })
    })
    return output
  }, [record])

  if (lines.length === 0) {
    return <p className="text-sm text-room-400">Nothing recorded yet.</p>
  }

  return (
    <ol className="card-surface divide-y divide-room-800 text-sm">
      {lines.map((line) => (
        <li key={line.key} className="flex items-baseline gap-2 px-3 py-2">
          <span className="w-14 shrink-0 text-xs uppercase tracking-wide text-room-500">
            {line.street}
          </span>
          <span>{line.text}</span>
        </li>
      ))}
    </ol>
  )
}
