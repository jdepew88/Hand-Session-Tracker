import { formatCents } from '../../money'
import { aggressiveActionType, buildAction, maxTo, validateAction } from '../betting'
import type { ActionEvent, HandEvent, HandResult, HandSetup, HandState } from '../models'
import { awaitingBoardStreet, replay } from '../reducer'
import { computeResult } from '../showdown'
import { exactCards, exactHoleCards } from './memory'
import type { DraftAction, HandDraft } from './model'
import { STREET_TITLE, seatName, seatPositions } from './text'

/**
 * From a remembered hand to the engine's exact event log -- when, and only
 * when, the draft says enough.
 *
 * The draft's actions are fed to `replay` one at a time, exactly as the live
 * recorder feeds them, so the pot, stacks, rake and result come from the same
 * engine and the same rules. Anyone not in the hand folds when the action
 * reaches them preflop (that is what "not in the hand" means). Anything else
 * the engine needs and the draft does not have -- a raise amount, a street's
 * action, a player's turn -- stops the conversion, and the reason is reported
 * instead of a guess.
 *
 * The hand's starting stacks are a snapshot of the table when it was dealt,
 * and they stay authoritative: an all-in with no amount is everything the
 * player had left, and a recorded amount that disagrees with the stack is
 * reported as a conflict for the player to settle, never fixed by quietly
 * changing the stack.
 *
 * Cards are not needed for money. A street whose cards were not remembered
 * still opens; only cards known exactly are put on the board, and the
 * recorded winner decides the pot when the cards cannot.
 *
 * The events produced here are derived, never stored: a reconstructed hand's
 * source of truth stays its draft.
 */

/**
 * A recorded amount that does not fit the stack this hand started with. The
 * hand's stacks are a snapshot of the table when it was dealt; an amount the
 * player remembers can disagree with it. That is reported, never resolved by
 * quietly changing the stack: the player decides which one is right.
 */
export interface StackConflict {
  seat: number
  /** "Flop: CO's all-in for $310 does not match the $955 CO had left in this hand." */
  message: string
  /**
   * For an all-in: the starting stack for this hand that would make the
   * recorded amount exactly everything the player had. Null when no
   * starting stack could (the amount is less than they already had in).
   */
  suggestedStartingStack: number | null
}

export type Reconstruction =
  | {
      exact: true
      setup: HandSetup
      events: HandEvent[]
      manualWinners: number[]
      state: HandState
      result: HandResult
    }
  | {
      exact: false
      /** Why the pot cannot be worked out, e.g. "Preflop: CO's raise amount not recorded". */
      missing: string[]
      /** Recorded amounts that disagree with the hand's stacks. Empty when nothing conflicts. */
      conflicts: StackConflict[]
    }

type Attempt = { kind: 'done'; value: Reconstruction }

export function reconstructHand(setup: HandSetup, draft: HandDraft): Reconstruction {
  // The hand's own stacks are authoritative. Only Hero's cards are added.
  return attemptReconstruction({ ...setup, heroCards: exactHoleCards(draft.hero) ?? [] }, draft).value
}

function attemptReconstruction(setup: HandSetup, draft: HandDraft): Attempt {
  const positions = seatPositions(setup)
  const name = (seat: number) => seatName(setup, seat, positions)
  const participants = new Set(draft.participants)
  const events: HandEvent[] = []
  let state = replay(setup, events)
  let counter = 0

  const push = (event: HandEvent) => {
    events.push(event)
    state = replay(setup, events)
  }
  const fold = (seat: number): ActionEvent => ({
    ...buildAction(state, seat, 'fold'),
    id: `reconstructed-${(counter += 1)}`,
  })
  const missing = (reason: string): Attempt => ({ kind: 'done', value: { exact: false, missing: [reason], conflicts: [] } })

  for (const street of draft.streets) {
    const title = STREET_TITLE[street.street]

    if (street.street !== 'preflop') {
      if (state.status === 'complete') return missing(`The hand was over before the ${street.street}.`)
      if (awaitingBoardStreet(state) !== street.street) return missing(`${STREET_TITLE[state.street]}: the rest of the action not recorded`)
      push({
        id: `reconstructed-${(counter += 1)}`,
        kind: 'deal',
        street: street.street,
        cards: exactCards(street.cards),
      })
    }

    for (const action of street.actions) {
      while (state.actingSeat !== null && state.actingSeat !== action.seat) {
        if (street.street === 'preflop' && !participants.has(state.actingSeat)) push(fold(state.actingSeat))
        else return missing(`${title}: ${name(state.actingSeat)}'s action not recorded`)
      }
      if (state.actingSeat === null) return missing(`${title}: ${name(action.seat)} acts after the betting was over`)

      const built = eventFor(state, action, () => `reconstructed-${(counter += 1)}`)
      if ('conflict' in built) {
        const message = `${title}: ${name(action.seat)}'s ${built.conflict}`
        return {
          kind: 'done',
          value: {
            exact: false,
            missing: [message],
            conflicts: [{ seat: action.seat, message, suggestedStartingStack: built.suggestedStartingStack }],
          },
        }
      }
      if ('missing' in built) return missing(`${title}: ${name(action.seat)}'s ${built.missing}`)
      push(built.event)
    }

    if (street.street === 'preflop') {
      while (state.actingSeat !== null && !participants.has(state.actingSeat)) push(fold(state.actingSeat))
    }
    if (state.actingSeat !== null) {
      return missing(
        street.actions.length === 0 ? `${title} action not recorded` : `${title}: the rest of the action not recorded`,
      )
    }
  }

  // Later streets that were not recorded only matter if there could have been
  // more betting: once everyone left is all-in, the pot is already final.
  if (state.status !== 'complete' && state.status !== 'showdown') {
    const next = awaitingBoardStreet(state)
    const withChips = state.activeSeats.filter((seat) => !state.seats.get(seat)!.allIn)
    if (next && withChips.length >= 2) return missing(`${STREET_TITLE[next]} not recorded`)
  }

  for (const entry of draft.showdown) {
    const cards = entry.status === 'shown' ? exactHoleCards(entry.cards) : null
    if (cards && entry.seat !== setup.heroSeat) {
      push({ id: `reconstructed-${(counter += 1)}`, kind: 'reveal', seat: entry.seat, cards })
    }
  }

  const manualWinners = draft.winners ?? []
  return {
    kind: 'done',
    value: {
      exact: true,
      setup,
      events,
      manualWinners,
      state,
      result: computeResult(setup, state, manualWinners),
    },
  }
}

function eventFor(
  state: HandState,
  action: DraftAction,
  id: () => string,
): { event: ActionEvent } | { missing: string } | { conflict: string; suggestedStartingStack: number | null } {
  const seat = action.seat
  switch (action.action) {
    case 'fold':
    case 'check':
    case 'call': {
      const event = { ...buildAction(state, seat, action.action), id: id() }
      return validateAction(state, event).errors.length > 0 ? { missing: `${action.action} does not fit the hand` } : { event }
    }
    case 'bet':
    case 'raise': {
      if (action.amount === null) return { missing: `${action.action} amount not recorded` }
      const ceiling = maxTo(state, seat)
      if (action.amount > ceiling) {
        return {
          conflict: `${action.action} to ${formatCents(action.amount)} is more than the ${formatCents(ceiling)} they could put in this hand`,
          suggestedStartingStack: null,
        }
      }
      const event: ActionEvent = {
        ...buildAction(state, seat, aggressiveActionType(state), action.amount),
        id: id(),
      }
      return validateAction(state, event).errors.length > 0 ? { missing: `${action.action} does not fit the hand` } : { event }
    }
    case 'allin': {
      const ceiling = maxTo(state, seat)
      // No amount: everything they had left, from the hand's own stack.
      // An amount that disagrees is reported; the stack is never changed to fit it.
      if (action.amount !== null && action.amount !== ceiling) {
        const player = state.seats.get(seat)!
        const startingStack = player.startingStack
        const suggested = startingStack + (action.amount - ceiling)
        return {
          conflict: `all-in for ${formatCents(action.amount)} does not match the ${formatCents(ceiling)} they had in this hand`,
          suggestedStartingStack: action.amount > player.streetCommitted && suggested > 0 ? suggested : null,
        }
      }
      const event: ActionEvent =
        ceiling > state.currentBet
          ? { ...buildAction(state, seat, aggressiveActionType(state), ceiling), id: id() }
          : { ...buildAction(state, seat, 'call'), id: id() }
      return validateAction(state, event).errors.length > 0 ? { missing: 'all-in does not fit the hand' } : { event }
    }
  }
}
