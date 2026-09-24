import type { Cents } from '../money'
import type { Card } from './cards'
import {
  STREETS,
  type ActionEvent,
  type ForcedBet,
  type ForcedBetKind,
  type HandEvent,
  type HandSetup,
  type HandState,
  type HandStatus,
  type SeatState,
  type Street,
} from './models'
import { blindSeats, derivePositions, postflopSeatOrder, preflopSeatOrder, seatsClockwiseFrom } from './positions'
import { buildPots } from './pot'
import { computeRake } from './rake'

/**
 * The hand engine.
 *
 * `replay(setup, events)` is the ONLY way state is produced. There is no
 * mutable pot variable that survives between calls, no incremental stack
 * bookkeeping, nothing to drift. Undo is `events.slice(0, -1)`; editing an
 * action is a splice followed by another replay; an imported hand is replayed
 * exactly like a locally recorded one. Any bug in accounting is a bug in one
 * pure function, reproducible from the event log alone.
 */

export function nextStreet(street: Street): Street | null {
  const index = STREETS.indexOf(street)
  return index >= 0 && index < STREETS.length - 1 ? STREETS[index + 1]! : null
}

export function cardsRequiredFor(street: Exclude<Street, 'preflop'>): number {
  return street === 'flop' ? 3 : 1
}

export function replay(setup: HandSetup, events: readonly HandEvent[]): HandState {
  const seatSetups = [...setup.seats].sort((a, b) => a.seat - b.seat)
  const seatOrder = seatSetups.map((s) => s.seat)
  const positions = derivePositions(seatOrder, setup.buttonSeat)

  const seats = new Map<number, SeatState>()
  for (const entry of seatSetups) {
    seats.set(entry.seat, {
      seat: entry.seat,
      ...(entry.label !== undefined ? { label: entry.label } : {}),
      ...(entry.playerId !== undefined ? { playerId: entry.playerId } : {}),
      position: positions.get(entry.seat) ?? `Seat ${entry.seat}`,
      startingStack: entry.startingStack,
      stack: entry.startingStack,
      committed: 0,
      streetCommitted: 0,
      folded: false,
      allIn: false,
      cards: entry.seat === setup.heroSeat ? [...setup.heroCards] : [],
      hasActedThisStreet: false,
    })
  }

  const board: Card[] = []
  const forcedBets: ForcedBet[] = []
  let street: Street = 'preflop'
  // Assigned below once the forced bets are posted, which is what defines them.
  let currentBet: Cents
  let minRaiseIncrement: Cents
  let lastAggressorSeat: number | null
  let seatsToAct: number[] = []
  let awaitingBoard: Street | null = null
  let endedBy: HandState['endedBy'] = null
  let complete = false
  let showdownReached = false

  const liveSeats = () => seatOrder.filter((seat) => !seats.get(seat)!.folded)
  const actorSeats = () => liveSeats().filter((seat) => !seats.get(seat)!.allIn)

  /** Move chips from a stack into the pot. Never lets a seat wager more than it has. */
  function commit(state: SeatState, requested: Cents, live: boolean): Cents {
    const amount = Math.max(0, Math.min(requested, state.stack))
    if (amount === 0) return 0
    state.stack -= amount
    state.committed += amount
    if (live) state.streetCommitted += amount
    if (state.stack === 0) state.allIn = true
    return amount
  }

  function postForced(seat: number | undefined, amount: Cents, kind: ForcedBetKind, live: boolean) {
    if (seat === undefined || amount <= 0) return
    const state = seats.get(seat)
    if (!state) return
    const posted = commit(state, amount, live)
    if (posted > 0) forcedBets.push({ seat, kind, amount: posted })
  }

  /* --------------------------------------------------------- forced bets */

  const { smallBlindSeat, bigBlindSeat } = blindSeats(seatOrder, setup.buttonSeat)

  // Antes and dead money go to the pot without counting as a live bet: they
  // never reduce what a player owes to call.
  if (setup.ante > 0) {
    if (setup.anteMode === 'all') for (const seat of seatOrder) postForced(seat, setup.ante, 'ante', false)
    else if (setup.anteMode === 'bb') postForced(bigBlindSeat, setup.ante, 'ante', false)
    else if (setup.anteMode === 'button') postForced(setup.buttonSeat, setup.ante, 'ante', false)
  }
  for (const dead of setup.deadMoney) postForced(dead.seat, dead.amount, 'dead', false)

  postForced(smallBlindSeat, setup.smallBlind, 'sb', true)
  postForced(bigBlindSeat, setup.bigBlind, 'bb', true)
  for (const straddle of setup.straddles) postForced(straddle.seat, straddle.amount, 'straddle', true)

  currentBet = Math.max(0, ...seatOrder.map((seat) => seats.get(seat)!.streetCommitted))
  // A raise must at least double the largest live blind, so the opening
  // increment is that blind -- which is the straddle when one is posted.
  minRaiseIncrement = Math.max(setup.bigBlind, currentBet, 1)
  lastAggressorSeat =
    setup.straddles.length > 0 ? setup.straddles[setup.straddles.length - 1]!.seat : (bigBlindSeat ?? null)

  /* ------------------------------------------------ street bookkeeping */

  /**
   * Return chips nobody could call. A bet is uncalled to the extent it exceeds
   * every other contribution in the hand; those chips were never at risk and
   * must not inflate the pot, the drop, or the result.
   *
   * Only safe once a betting round has closed, which is the only time it runs.
   */
  function returnUncalled() {
    const contributions = seatOrder
      .map((seat) => ({ seat, amount: seats.get(seat)!.committed }))
      .sort((a, b) => b.amount - a.amount)
    const top = contributions[0]
    const second = contributions[1]
    if (!top || !second || top.amount <= second.amount) return
    const state = seats.get(top.seat)!
    if (state.folded) return
    const excess = top.amount - second.amount
    state.committed -= excess
    state.streetCommitted = Math.max(0, state.streetCommitted - excess)
    state.stack += excess
    if (state.stack > 0) state.allIn = false
  }

  function finishHand(reason: NonNullable<HandState['endedBy']>) {
    returnUncalled()
    complete = true
    endedBy = reason
    seatsToAct = []
    awaitingBoard = null
  }

  /** Called after every action and every deal. */
  function settle() {
    if (complete) return
    if (liveSeats().length <= 1) {
      finishHand('fold')
      return
    }
    if (seatsToAct.length > 0) return

    // Betting for this street is closed.
    returnUncalled()
    if (street === 'river') {
      showdownReached = true
      endedBy = 'showdown'
      awaitingBoard = null
      return
    }
    awaitingBoard = nextStreet(street)
  }

  function openStreet(newStreet: Street) {
    street = newStreet
    for (const seat of seatOrder) {
      const state = seats.get(seat)!
      state.streetCommitted = 0
      state.hasActedThisStreet = false
    }
    currentBet = 0
    minRaiseIncrement = Math.max(setup.bigBlind, 1)
    lastAggressorSeat = null
    awaitingBoard = null
    // Betting needs at least two players with chips behind. One live stack
    // against an all-in opponent has nobody to bet into.
    const candidates = postflopSeatOrder(actorSeats(), setup.buttonSeat)
    seatsToAct = candidates.length >= 2 ? candidates : []
  }

  /* ------------------------------------------------------- opening order */

  const straddleSeats = setup.straddles.map((s) => s.seat)
  const preflopCandidates = preflopSeatOrder(actorSeats(), setup.buttonSeat, straddleSeats)
  seatsToAct = preflopCandidates.length >= 2 ? preflopCandidates : []
  settle()

  /* ---------------------------------------------------------- event loop */

  for (const event of events) {
    if (event.kind === 'reveal') {
      // Cards can be shown even after the hand is over.
      const state = seats.get(event.seat)
      if (state) state.cards = [...event.cards]
      continue
    }
    if (complete) continue

    if (event.kind === 'deal') {
      board.push(...event.cards)
      openStreet(event.street)
      settle()
      continue
    }

    applyAction(event)
  }

  function applyAction(event: ActionEvent) {
    const state = seats.get(event.seat)
    if (!state || state.folded || awaitingBoard !== null) return

    let aggressive = false

    switch (event.action) {
      case 'fold':
        state.folded = true
        break
      case 'check':
        break
      case 'call':
        commit(state, currentBet - state.streetCommitted, true)
        break
      case 'bet':
      case 'raise': {
        const previousBet = currentBet
        commit(state, event.to - state.streetCommitted, true)
        if (state.streetCommitted > previousBet) {
          const increment = state.streetCommitted - previousBet
          // An all-in that falls short of a full raise moves the bet but does
          // not raise the minimum increment for later raisers.
          if (increment >= minRaiseIncrement) minRaiseIncrement = increment
          currentBet = state.streetCommitted
          lastAggressorSeat = event.seat
          aggressive = true
        }
        break
      }
    }

    state.hasActedThisStreet = true

    if (aggressive) {
      seatsToAct = seatsClockwiseFrom(liveSeats(), event.seat).filter(
        (seat) => seat !== event.seat && !seats.get(seat)!.allIn,
      )
    } else {
      seatsToAct = seatsToAct.filter((seat) => {
        if (seat === event.seat) return false
        const other = seats.get(seat)!
        return !other.folded && !other.allIn
      })
    }

    settle()
  }

  /* ------------------------------------------------------------- derive */

  const contributions = new Map<number, Cents>()
  const folded = new Set<number>()
  for (const seat of seatOrder) {
    const state = seats.get(seat)!
    contributions.set(seat, state.committed)
    if (state.folded) folded.add(seat)
  }

  const pot = [...contributions.values()].reduce((sum, amount) => sum + amount, 0)
  const pots = buildPots(contributions, folded)
  const rake = computeRake(setup.rake, street, pot)

  const usedCards = new Set<Card>(board)
  for (const seat of seatOrder) for (const card of seats.get(seat)!.cards) usedCards.add(card)

  const status: HandStatus = complete
    ? 'complete'
    : showdownReached
      ? 'showdown'
      : events.length === 0 && setup.heroCards.length < 2
        ? 'setup'
        : street

  return {
    status,
    street,
    board,
    seats,
    seatOrder,
    forcedBets,
    currentBet,
    minRaiseIncrement,
    lastAggressorSeat,
    actingSeat: seatsToAct[0] ?? null,
    seatsToAct,
    pot,
    pots,
    rake,
    netPot: pot - rake.total,
    activeSeats: liveSeats(),
    events: [...events],
    endedBy,
    usedCards: [...usedCards],
  }
}

/** True when no further board cards or actions are expected. */
export function isHandFinished(state: HandState): boolean {
  return state.status === 'complete' || state.status === 'showdown'
}

/** The street whose cards the engine is waiting for, if any. */
export function awaitingBoardStreet(state: HandState): Exclude<Street, 'preflop'> | null {
  if (state.status === 'complete' || state.status === 'showdown') return null
  if (state.actingSeat !== null) return null
  const next = nextStreet(state.street)
  return next === null || next === 'preflop' ? null : next
}

export function seatState(state: HandState, seat: number): SeatState | undefined {
  return state.seats.get(seat)
}

export function heroState(state: HandState, heroSeat: number): SeatState | undefined {
  return state.seats.get(heroSeat)
}
