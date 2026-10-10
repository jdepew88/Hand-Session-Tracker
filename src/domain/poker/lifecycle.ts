import { effectiveWinners } from './draft/text'
import type { HandDraft } from './draft/model'
import { draftFromEvents } from './draft/project'
import { reconstructHand, type StackConflict } from './draft/reconstruct'
import type { HandRecord, HandResult, HandSetup, HandState } from './models'
import { replay } from './reducer'
import { computeResult } from './showdown'

/**
 * Convenience wrappers that pair a stored record with its derived state.
 *
 * Deriving is cheap (a replay of a few dozen events) and always correct, so the
 * app never stores a result: open a hand a year later and the numbers are
 * recomputed from the same log that produced them. Derivations are memoised
 * per record object -- records are replaced, never mutated, on every save.
 */

export interface LiveDerivedHand {
  state: HandState
  result: HandResult
  inProgress: boolean
}

export interface DerivedHand {
  /**
   * Engine state and result. Always present for a live-tracked hand; for a
   * reconstructed hand only when the draft says enough to replay it exactly.
   */
  state: HandState | null
  result: HandResult | null
  inProgress: boolean
  reconstructed: boolean
  /** The hand as a story: the same shape for live and reconstructed hands. */
  draft: HandDraft
  /** What the state was replayed from (a reconstruction adds Hero's cards to the hand's setup). */
  setup: HandSetup
  /** Why a reconstructed hand's pot and result cannot be worked out. Empty when they can. */
  missing: string[]
  /** Recorded amounts that disagree with the hand's starting stacks. */
  conflicts: StackConflict[]
}

const cache = new WeakMap<HandRecord, DerivedHand>()

/** Live hands only: the record's own event log, replayed. */
export function deriveLiveHand(record: HandRecord): LiveDerivedHand {
  const state = replay(record.setup, record.events)
  const result = computeResult(record.setup, state, record.manualWinners)
  return { state, result, inProgress: isUnfinished(state, result) }
}

export function deriveHand(record: HandRecord): DerivedHand {
  const cached = cache.get(record)
  if (cached) return cached
  const derived = record.reconstruction ? deriveReconstructed(record, record.reconstruction) : deriveLive(record)
  cache.set(record, derived)
  return derived
}

function deriveLive(record: HandRecord): DerivedHand {
  const { state, result, inProgress } = deriveLiveHand(record)
  return {
    state,
    result,
    inProgress,
    reconstructed: false,
    draft: draftFromEvents(record.setup, record.events, record.manualWinners),
    setup: record.setup,
    missing: [],
    conflicts: [],
  }
}

function deriveReconstructed(record: HandRecord, draft: HandDraft): DerivedHand {
  const rebuilt = reconstructHand(record.setup, draft)
  // A reconstructed hand is saved when the player says it is done: never "in progress".
  return rebuilt.exact
    ? { state: rebuilt.state, result: rebuilt.result, inProgress: false, reconstructed: true, draft, setup: rebuilt.setup, missing: [], conflicts: [] }
    : {
        state: null,
        result: null,
        inProgress: false,
        reconstructed: true,
        draft,
        setup: record.setup,
        missing: rebuilt.missing,
        conflicts: rebuilt.conflicts,
      }
}

function isUnfinished(state: HandState, result: HandResult): boolean {
  if (state.status === 'complete') return false
  if (state.status === 'showdown') return result.undetermined
  return true
}

export function isHandInProgress(record: HandRecord): boolean {
  return deriveHand(record).inProgress
}

/** Hero's profit or loss for a hand, after the drop; null when it cannot be worked out. */
export function heroResultOf(record: HandRecord): number | null {
  const { result } = deriveHand(record)
  return result && !result.undetermined ? result.heroResult : null
}

/** Seats that won, from the engine where it can tell, otherwise as recorded. Null = not known. */
export function handWinners(record: HandRecord): number[] | null {
  const derived = deriveHand(record)
  if (derived.result && !derived.result.undetermined && derived.result.winners.length > 0) return derived.result.winners
  return effectiveWinners(record.setup, derived.draft)
}

/** How the hand went for Hero, as far as is known. */
export function heroOutcome(record: HandRecord): 'won' | 'lost' | 'split' | null {
  const winners = handWinners(record)
  if (!winners) return null
  if (!winners.includes(record.setup.heroSeat)) return 'lost'
  return winners.length > 1 ? 'split' : 'won'
}
