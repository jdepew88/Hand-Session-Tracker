import type { HandRecord, HandResult, HandState } from './models'
import { replay } from './reducer'
import { computeResult } from './showdown'

/**
 * Convenience wrappers that pair a stored record with its derived state.
 *
 * Deriving is cheap (a replay of a few dozen events) and always correct, so the
 * app never caches a result: open a hand a year later and the numbers are
 * recomputed from the same log that produced them.
 */

export interface DerivedHand {
  state: HandState
  result: HandResult
  inProgress: boolean
}

export function deriveHand(record: HandRecord): DerivedHand {
  const state = replay(record.setup, record.events)
  const result = computeResult(record.setup, state, record.manualWinners)
  return { state, result, inProgress: isUnfinished(state, result) }
}

function isUnfinished(state: HandState, result: HandResult): boolean {
  if (state.status === 'complete') return false
  if (state.status === 'showdown') return result.undetermined
  return true
}

export function isHandInProgress(record: HandRecord): boolean {
  return deriveHand(record).inProgress
}

/** Hero's profit or loss for a hand, after the drop. */
export function heroResultOf(record: HandRecord): number {
  return deriveHand(record).result.heroResult
}
