import { buildAction, canCheck } from './betting'
import type { ActionEvent, HandEvent, HandSetup } from './models'
import { replay } from './reducer'

/**
 * Live Track shortcuts. Each one is a run of ordinary actions, built and
 * checked by the engine one at a time, so a shortcut can never record
 * anything that tapping the same actions one by one could not. Each returns
 * null when it does not apply, rather than a partial run.
 */

/** Everyone due to act before `seat` folds: "fold to Hero". */
export function foldTo(setup: HandSetup, events: readonly HandEvent[], seat: number): ActionEvent[] | null {
  let state = replay(setup, events)
  if (state.actingSeat === null || state.actingSeat === seat || !state.seatsToAct.includes(seat)) return null
  const added: ActionEvent[] = []
  while (state.actingSeat !== null && state.actingSeat !== seat) {
    added.push(buildAction(state, state.actingSeat, 'fold'))
    state = replay(setup, [...events, ...added])
  }
  // Folding everyone in front can never end the hand past `seat`, who is still in it.
  return added.length > 0 && state.actingSeat === seat ? added : null
}

/** Everyone left on this street checks. Only when nobody faces a bet. */
export function checkAround(setup: HandSetup, events: readonly HandEvent[]): ActionEvent[] | null {
  let state = replay(setup, events)
  if (state.actingSeat === null || !canCheck(state, state.actingSeat)) return null
  const street = state.street
  const added: ActionEvent[] = []
  while (state.actingSeat !== null && state.street === street) {
    if (!canCheck(state, state.actingSeat)) return null
    added.push(buildAction(state, state.actingSeat, 'check'))
    state = replay(setup, [...events, ...added])
  }
  return added.length > 0 ? added : null
}
