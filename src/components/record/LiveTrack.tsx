import { useId, useMemo, useState, type ReactNode } from 'react'
import { formatCents } from '../../domain/money'
import type { Card } from '../../domain/poker/cards'
import { describeCard } from '../../domain/poker/cards'
import { handFlow } from '../../domain/poker/draft/flow'
import { draftFromEvents } from '../../domain/poker/draft/project'
import { STREET_TITLE, streetActionWords, seatPositions } from '../../domain/poker/draft/text'
import { handContext, newId } from '../../domain/poker/factories'
import { deriveLiveHand } from '../../domain/poker/lifecycle'
import { checkAround, foldTo } from '../../domain/poker/liveShortcuts'
import type { ActionEvent, HandEvent, HandRecord, Session, Street } from '../../domain/poker/models'
import { awaitingBoardStreet, cardsRequiredFor } from '../../domain/poker/reducer'
import { positionName } from '../../domain/poker/tableView'
import { seatTitle } from '../../utils/labels'
import { ActionPanel } from '../ActionPanel'
import { CardPicker } from '../CardPicker'
import { HandSetupPanel } from '../HandSetupPanel'
import { HandStatusBar } from '../HandStatusBar'
import { HandSummaryPanel } from '../HandSummaryPanel'
import { SeatList } from '../SeatList'
import { ShowdownPanel } from '../ShowdownPanel'
import { EmptySlot, FeltCard } from '../table/Cards'
import { ActionTimeline } from './ActionTimeline'
import { RecordTable, type RecordSeatView } from './RecordTable'
import './record.css'

/**
 * Live Track: the hand as it happens, through the engine.
 *
 * The hand starts from the table -- seats, Hero, button, blinds, stakes and
 * stacks -- so the first tap is Hero's cards (or straight to the action).
 * After that the engine says whose turn it is; the tray offers only what
 * that player can do, and the table shows who is in, who folded, what is in
 * front of each seat and the pot. Nothing asks "who acts next?".
 */
export function LiveTrack({
  record,
  session,
  update,
  onDelete,
}: {
  record: HandRecord
  session: Session | undefined
  update: (next: HandRecord) => void
  onDelete: () => void
}) {
  const derived = useMemo(() => deriveLiveHand(record), [record])
  const { state, result, inProgress } = derived
  const [cardsSkipped, setCardsSkipped] = useState(false)
  const tableId = useId()
  const { setup } = record
  const heroSeat = setup.heroSeat
  const positions = useMemo(() => seatPositions(setup), [setup])

  const pushEvents = (events: HandEvent[]) => update({ ...record, events: [...record.events, ...events] })
  const undo = () => record.events.length > 0 && update({ ...record, events: record.events.slice(0, -1) })
  const reveal = (seat: number, cards: Card[]) => {
    const withoutSeat = record.events.filter((event) => !(event.kind === 'reveal' && event.seat === seat))
    update({
      ...record,
      events: cards.length > 0 ? [...withoutSeat, { id: newId(), kind: 'reveal', seat, cards }] : withoutSeat,
    })
  }

  const choosingCards = record.events.length === 0 && setup.heroCards.length < 2 && !cardsSkipped
  const awaiting = awaitingBoardStreet(state)
  const foldToHero = state.street === 'preflop' ? foldTo(setup, record.events, heroSeat) : null
  const checks = checkAround(setup, record.events)

  /* ------------------------------------------------------------- table */

  const seats: RecordSeatView[] = Array.from({ length: setup.tableSize }, (_, index) => {
    const seatNumber = index + 1
    const seat = state.seats.get(seatNumber)
    if (!seat) return { seat: seatNumber, position: null, empty: true, hero: false, label: `Seat ${seatNumber}, not dealt in` }
    const isHero = seatNumber === heroSeat
    const bet = seat.streetCommitted > 0 && !seat.folded ? <span className="rc-chipnote">{formatCents(seat.streetCommitted)}</span> : null
    let spot: ReactNode = bet
    if (seat.cards.length >= 2 && (isHero || state.status === 'showdown' || state.status === 'complete')) {
      spot = (
        <>
          <span className="rc-spot__cards">
            {seat.cards.slice(0, 2).map((card) => (
              <FeltCard key={card} card={card} />
            ))}
          </span>
          {bet}
        </>
      )
    }
    const view: RecordSeatView = {
      seat: seatNumber,
      position: seat.position,
      empty: false,
      hero: isHero,
      stack: formatCents(seat.stack),
      label: `Seat ${seatNumber}`,
      spot,
      heroSpot: isHero,
      ...(seat.label ? { name: seat.label } : {}),
    }
    if (seat.folded) return { ...view, tone: 'folded', status: 'FOLDED' }
    if (seat.allIn) return { ...view, status: 'ALL-IN' }
    if (state.actingSeat === seatNumber && !choosingCards) return { ...view, tone: 'acting', status: 'TO ACT' }
    return view
  })

  const actor = state.actingSeat !== null ? state.seats.get(state.actingSeat) : undefined
  const tableText = [
    `${state.activeSeats.length} of ${state.seatOrder.length} players still in.`,
    actor && !choosingCards ? `${actor.seat === heroSeat ? 'Hero' : positionName(actor.position)} to act.` : '',
    state.board.length > 0 ? `Board: ${state.board.map(describeCard).join(', ')}.` : '',
    `Pot ${formatCents(state.pot)}.`,
  ]
    .filter(Boolean)
    .join(' ')

  /* --------------------------------------------------------- the story */

  const story = useMemo(() => {
    const draft = draftFromEvents(setup, record.events, record.manualWinners)
    const flows = handFlow(setup, draft)
    return draft.streets.map((street, index) => ({
      street: street.street,
      words: streetActionWords(setup, flows[index]!, positions),
    }))
  }, [setup, record.events, record.manualWinners, positions])

  return (
    <div className="pb-6">
      <HandStatusBar state={state} />

      <div className="mt-3 grid gap-4 px-3 sm:px-0 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
        <div className="min-w-0">
          <p id={tableId} className="sr-only">
            {tableText}
          </p>
          <RecordTable
            seatCount={setup.tableSize}
            seats={seats}
            buttonSeat={setup.buttonSeat}
            label="The table"
            describedBy={tableId}
            compact
            center={
              <>
                <span className="rc-center__street">
                  {state.status === 'complete' ? 'Hand over' : state.status === 'showdown' ? 'Showdown' : STREET_TITLE[state.street]}
                </span>
                {state.board.length > 0 && (
                  <span className="rc-center__board">
                    {state.board.map((card) => (
                      <FeltCard key={card} card={card} />
                    ))}
                    {Array.from({ length: 5 - state.board.length }, (_, index) => (
                      <EmptySlot key={index} />
                    ))}
                  </span>
                )}
                <span className="rc-center__pot">Pot {formatCents(state.pot)}</span>
              </>
            }
          />
        </div>

        <div className="min-w-0 space-y-4">
          <div className="rc-tray -mx-3 border-t border-room-700 bg-room-950/95 backdrop-blur lg:mx-0 lg:rounded-xl lg:border">
            {choosingCards ? (
              <div className="space-y-3 px-3 py-3">
                <CardPicker
                  legend="Your hole cards"
                  count={2}
                  value={setup.heroCards}
                  usedCards={setup.heroCards}
                  onChange={(cards) => update({ ...record, setup: { ...setup, heroCards: cards } })}
                />
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <button type="button" className="btn-primary h-12 text-base" disabled>
                    Choose your two cards
                  </button>
                  <button type="button" className="btn-secondary h-12" onClick={() => setCardsSkipped(true)}>
                    Skip cards
                  </button>
                </div>
              </div>
            ) : state.actingSeat !== null ? (
              <>
                <ActionPanel state={state} heroSeat={heroSeat} bigBlind={setup.bigBlind} onAction={(event: ActionEvent) => pushEvents([event])} />
                {(foldToHero || checks) && (
                  <div className="flex flex-wrap gap-2 bg-room-900/95 px-3 pb-3">
                    {foldToHero && (
                      <button type="button" className="btn-ghost border border-room-700 text-sm" onClick={() => pushEvents(foldToHero)}>
                        Fold to Hero
                        <span className="sr-only">: {foldToHero.length} players fold</span>
                      </button>
                    )}
                    {checks && (
                      <button type="button" className="btn-ghost border border-room-700 text-sm" onClick={() => pushEvents(checks)}>
                        Check around
                      </button>
                    )}
                  </div>
                )}
              </>
            ) : awaiting ? (
              <div className="px-3 py-3">
                <p className="mb-2 text-sm text-room-300">Betting is complete. Enter the {STREET_TITLE[awaiting].toLowerCase()}.</p>
                <BoardEntry
                  street={awaiting}
                  usedCards={state.usedCards}
                  onComplete={(cards) => pushEvents([{ id: newId(), kind: 'deal', street: awaiting, cards }])}
                />
              </div>
            ) : state.status === 'complete' && state.endedBy === 'fold' ? (
              <p className="px-3 py-3 text-sm text-felt-200">
                Everyone else folded. {seatTitle(state.seats.get(state.activeSeats[0]!)!, heroSeat)} wins{' '}
                <span className="tabular font-semibold">{formatCents(result.netPot)}</span>.
              </p>
            ) : null}
          </div>

          {state.status === 'showdown' && (
            <ShowdownPanel
              state={state}
              result={result}
              heroSeat={heroSeat}
              manualWinners={record.manualWinners}
              onReveal={reveal}
              onSetManualWinners={(seats) => update({ ...record, manualWinners: seats })}
            />
          )}

          {!inProgress && <HandSummaryPanel record={record} result={result} onChange={update} />}

          <section aria-labelledby={`${tableId}-log`}>
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 id={`${tableId}-log`} className="text-sm font-semibold uppercase tracking-wide text-room-400">
                Action log
              </h2>
              <button type="button" className="btn-secondary" disabled={record.events.length === 0} onClick={undo}>
                Undo last
              </button>
            </div>
            {record.events.length > 0 && (
              <p className="mb-2 text-xs text-room-400">
                Undo removes the most recent entry. Everything after it is recalculated from the action history, so pots
                and stacks stay consistent.
              </p>
            )}
            {story.every((street) => street.words.length === 0) ? (
              <p className="text-sm text-room-400">Nothing recorded yet. Blinds are in; the engine knows who acts first.</p>
            ) : (
              <ol className="space-y-2">
                {story.map((street) => (
                  <li key={street.street} className="border-l-2 border-room-700 pl-3">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-room-400">{STREET_TITLE[street.street as Street]}</p>
                    <ActionTimeline words={street.words} label={`${STREET_TITLE[street.street as Street]} action`} heroSeat={heroSeat} empty="No action." />
                  </li>
                ))}
              </ol>
            )}
          </section>

          <details className="card-surface">
            <summary className="cursor-pointer px-3 py-3 text-sm font-semibold">Players and stacks</summary>
            <SeatList state={state} heroSeat={heroSeat} showCards />
          </details>

          {record.events.length === 0 && session && (
            <details className="card-surface p-3">
              <summary className="cursor-pointer text-sm font-semibold">
                Adjust this hand
                <span className="ml-2 font-normal text-room-400">straddle, stacks, seats</span>
              </summary>
              <p className="mt-2 text-xs text-room-400">
                Everything here comes from the table already. Change it only if this hand was different.
              </p>
              {setup.heroCards.length > 0 && (
                <button
                  type="button"
                  className="btn-secondary mt-3"
                  onClick={() => {
                    setCardsSkipped(false)
                    update({ ...record, setup: { ...setup, heroCards: [] } })
                  }}
                >
                  Change your cards
                </button>
              )}
              <div className="mt-3">
                <HandSetupPanel
                  setup={setup}
                  session={session}
                  onChange={(next) => update({ ...record, setup: next, context: handContext(session, next) })}
                />
              </div>
            </details>
          )}
          {record.events.length > 0 && (
            <p className="text-xs text-room-400">
              To change the button, your seat or a starting stack, undo back to the start of the hand.
            </p>
          )}

          <button type="button" className="btn-danger w-full" onClick={onDelete}>
            Delete hand
          </button>
        </div>
      </div>
    </div>
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
      <CardPicker legend={STREET_TITLE[street]} count={required} value={cards} usedCards={[...usedCards, ...cards]} onChange={setCards} />
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
