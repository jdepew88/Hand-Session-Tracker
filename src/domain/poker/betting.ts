import type { Cents } from '../money'
import type { ActionEvent, ActionType, HandState, SeatState } from './models'

/**
 * Legal-action helpers.
 *
 * Everything here is derived from a `HandState`; nothing mutates. The UI asks
 * "what can this seat do and for how much", renders buttons, and emits a single
 * `ActionEvent` whose `to` is a **total street contribution**.
 */

export interface ActionOption {
  action: ActionType
  /** Total street contribution this action produces. */
  to: Cents
  /** Chips leaving the stack. */
  delta: Cents
  allIn: boolean
}

export function seatOrThrow(state: HandState, seat: number): SeatState {
  const found = state.seats.get(seat)
  if (!found) throw new Error(`Seat ${seat} is not in this hand`)
  return found
}

/** Chips this seat must add to match the current bet, capped by their stack. */
export function amountToCall(state: HandState, seat: number): Cents {
  const player = state.seats.get(seat)
  if (!player) return 0
  return Math.max(0, Math.min(state.currentBet - player.streetCommitted, player.stack))
}

/** The total street contribution a call produces. */
export function callTo(state: HandState, seat: number): Cents {
  const player = state.seats.get(seat)
  if (!player) return 0
  return player.streetCommitted + amountToCall(state, seat)
}

/** The largest total this seat can put in on this street: everything they have. */
export function maxTo(state: HandState, seat: number): Cents {
  const player = state.seats.get(seat)
  if (!player) return 0
  return player.streetCommitted + player.stack
}

/**
 * Smallest legal bet/raise total. Clamped to the seat's stack, because going
 * all-in for less than a full raise is always legal.
 */
export function minRaiseTo(state: HandState, seat: number): Cents {
  const target =
    state.currentBet > 0 ? state.currentBet + state.minRaiseIncrement : state.minRaiseIncrement
  return Math.min(target, maxTo(state, seat))
}

export function canCheck(state: HandState, seat: number): boolean {
  const player = state.seats.get(seat)
  if (!player) return false
  return player.streetCommitted >= state.currentBet
}

/** `bet` when nobody has bet this street, `raise` otherwise. */
export function aggressiveActionType(state: HandState): Extract<ActionType, 'bet' | 'raise'> {
  return state.currentBet > 0 ? 'raise' : 'bet'
}

export function legalActions(state: HandState, seat: number): ActionType[] {
  const player = state.seats.get(seat)
  if (!player || player.folded || player.allIn) return []
  const actions: ActionType[] = ['fold']
  if (canCheck(state, seat)) actions.push('check')
  else if (amountToCall(state, seat) > 0) actions.push('call')
  if (player.stack > 0) actions.push(aggressiveActionType(state))
  return actions
}

export function buildAction(
  state: HandState,
  seat: number,
  action: ActionType,
  requestedTo?: Cents,
): ActionEvent {
  const player = seatOrThrow(state, seat)
  const ceiling = maxTo(state, seat)
  let to: Cents
  switch (action) {
    case 'fold':
    case 'check':
      to = player.streetCommitted
      break
    case 'call':
      to = callTo(state, seat)
      break
    case 'bet':
    case 'raise':
      to = Math.min(requestedTo ?? minRaiseTo(state, seat), ceiling)
      break
  }
  return { id: crypto.randomUUID(), kind: 'action', street: state.street, seat, action, to }
}

/** Convenience: the all-in action for a seat, typed correctly for the situation. */
export function buildAllIn(state: HandState, seat: number): ActionEvent {
  seatOrThrow(state, seat)
  const ceiling = maxTo(state, seat)
  // Shoving for less than the current bet is a call, not a raise.
  const action: ActionType = ceiling > state.currentBet ? aggressiveActionType(state) : 'call'
  return { id: crypto.randomUUID(), kind: 'action', street: state.street, seat, action, to: ceiling }
}

export interface ActionValidation {
  errors: string[]
  warnings: string[]
}

/**
 * Hard errors block the action; warnings do not.
 *
 * A sub-minimum raise is only a warning on purpose: this app records what
 * actually happened at the table, and floors occasionally rule in ways a strict
 * engine would reject. Anything that would corrupt the money -- wrong seat,
 * betting more than a stack, checking into a bet -- is a hard error.
 */
export function validateAction(state: HandState, event: ActionEvent): ActionValidation {
  const errors: string[] = []
  const warnings: string[] = []
  const player = state.seats.get(event.seat)

  if (!player) {
    errors.push(`Seat ${event.seat} is not in this hand.`)
    return { errors, warnings }
  }
  if (state.status === 'complete' || state.status === 'showdown') {
    errors.push('The hand is already finished.')
    return { errors, warnings }
  }
  if (player.folded) errors.push('That player has already folded.')
  if (player.allIn) errors.push('That player is already all-in.')
  if (state.actingSeat !== null && state.actingSeat !== event.seat) {
    warnings.push(`Action is on seat ${state.actingSeat}.`)
  }

  const ceiling = maxTo(state, event.seat)

  switch (event.action) {
    case 'check':
      if (!canCheck(state, event.seat)) {
        errors.push(`Cannot check facing a bet of ${state.currentBet}.`)
      }
      break
    case 'call':
      if (amountToCall(state, event.seat) === 0) errors.push('There is nothing to call.')
      break
    case 'bet':
    case 'raise': {
      if (event.to > ceiling) {
        errors.push('A player cannot wager more than their stack.')
      }
      if (event.to <= state.currentBet) {
        errors.push('A raise must be larger than the current bet.')
      } else if (event.to < minRaiseTo(state, event.seat) && event.to < ceiling) {
        warnings.push('Below the minimum raise for this street.')
      }
      break
    }
    case 'fold':
      break
  }

  return { errors, warnings }
}

/* ------------------------------------------------------- quick sizings */

export interface SizingOption {
  label: string
  to: Cents
}

function roundToChip(amount: Cents, bigBlind: Cents): Cents {
  const step = bigBlind >= 100 && bigBlind % 100 === 0 ? 100 : 25
  return Math.round(amount / step) * step
}

/**
 * Sizing shortcuts for the seat to act.
 *
 * Preflop shortcuts are multiples of the current bet (the standard way opens
 * and 3-bets are described); postflop shortcuts are fractions of the pot when
 * betting, and pot-relative raise sizes when facing a bet.
 */
export function sizingOptions(state: HandState, seat: number, bigBlind: Cents): SizingOption[] {
  const player = state.seats.get(seat)
  if (!player) return []
  const ceiling = maxTo(state, seat)
  const floor = minRaiseTo(state, seat)
  const toCall = amountToCall(state, seat)
  const raw: SizingOption[] = []

  if (state.street === 'preflop') {
    for (const multiple of [2, 2.5, 3, 4]) {
      const to = roundToChip(state.currentBet * multiple, bigBlind)
      raw.push({ label: `${multiple}x`, to })
    }
  } else if (state.currentBet === 0) {
    for (const [label, fraction] of [
      ['1/3', 1 / 3],
      ['1/2', 0.5],
      ['2/3', 2 / 3],
      ['Pot', 1],
    ] as const) {
      raw.push({ label, to: roundToChip(state.pot * fraction, bigBlind) })
    }
  } else {
    // Pot-sized raise: call first, then bet the resulting pot.
    const potAfterCall = state.pot + toCall
    raw.push({ label: '2.5x', to: roundToChip(state.currentBet * 2.5, bigBlind) })
    raw.push({ label: '3x', to: roundToChip(state.currentBet * 3, bigBlind) })
    raw.push({ label: 'Pot', to: roundToChip(player.streetCommitted + toCall + potAfterCall, bigBlind) })
  }

  const seen = new Set<Cents>()
  const options = raw
    .map((option) => ({ ...option, to: Math.max(floor, Math.min(option.to, ceiling)) }))
    .filter((option) => {
      if (seen.has(option.to)) return false
      seen.add(option.to)
      return true
    })

  if (!seen.has(ceiling) && ceiling > floor) options.push({ label: 'All-in', to: ceiling })
  return options
}
