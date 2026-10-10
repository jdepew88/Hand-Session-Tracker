import type { Cents } from '../../money'
import type { Rank, Suit } from '../cards'
import type { Street } from '../models'

/**
 * A hand as the player remembers it.
 *
 * Quick Reconstruct writes this; a future voice or text parser must be able
 * to write exactly the same thing. It sits inside a `HandRecord` beside the
 * table the hand was dealt at (`HandRecord.setup`), so seats, positions,
 * stakes, names and the button always come from the table rather than from
 * the draft.
 *
 * Unknown is a first-class value everywhere: a card can be missing its suit,
 * an amount can be null, a street can have no actions, a winner can be
 * unrecorded. Nothing here is filled in by guessing. When enough is known,
 * `reconstructEvents` turns a draft into an exact event log for the engine;
 * when it is not, the draft is still a valid, saveable hand.
 *
 * Plain JSON throughout (no Maps, no classes), so it stores, exports and
 * imports as-is.
 */

export const DRAFT_VERSION = 1

/** A card as remembered. Both parts known is a real card; either may be unknown. */
export interface CardMemory {
  rank: Rank | null
  suit: Suit | null
}

export interface HoleCardsMemory {
  cards: [CardMemory, CardMemory]
  /**
   * Suited or offsuit, for when the exact suits are not remembered ("AK
   * suited"). null = not recorded. Ignored once both suits are known.
   */
  suited: boolean | null
}

/** How the flop's suits fell, when the exact suits are not remembered ("two clubs"). */
export type FlopSuits =
  | { kind: 'rainbow' }
  | { kind: 'two-tone'; suit: Suit | null }
  | { kind: 'monotone'; suit: Suit | null }

/**
 * `allin` is a shove: a bet or raise of everything. Calling all-in is a
 * `call`. Limps, opens, 3-bets and 4-bets are not separate kinds -- they are
 * calls and raises, and are named from the order they happened in.
 */
export type DraftActionKind = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin'

export const DRAFT_ACTION_KINDS: readonly DraftActionKind[] = ['fold', 'check', 'call', 'bet', 'raise', 'allin']

/** Kinds that can carry an amount. */
export const SIZED_ACTIONS: readonly DraftActionKind[] = ['bet', 'raise', 'allin']

export interface DraftAction {
  id: string
  /** Physical seat. */
  seat: number
  action: DraftActionKind
  /**
   * bet / raise / allin only: the seat's total for the street, the same
   * convention as `ActionEvent.to` ("raises to $20"). null = not recorded.
   */
  amount: Cents | null
}

export interface DraftStreet {
  street: Street
  /**
   * Board cards that arrived on this street: none preflop, three on the
   * flop, one on the turn and river. Each may be partly or wholly unknown.
   */
  cards: CardMemory[]
  /** Flop only. null = not recorded (or not needed: every suit is known). */
  suits: FlopSuits | null
  /** In the order they happened. Empty = not recorded. May be partial. */
  actions: DraftAction[]
}

/**
 * - `shown`: the hand was seen (the cards may still be partly remembered).
 * - `mucked`: reached showdown and did not show.
 * - `unknown`: reached showdown; whether or what they showed is not recorded.
 * - `no-showdown`: was out before showdown (folded at a point not recorded).
 */
export type ShowdownStatus = 'shown' | 'mucked' | 'unknown' | 'no-showdown'

export const SHOWDOWN_STATUSES: readonly ShowdownStatus[] = ['shown', 'mucked', 'unknown', 'no-showdown']

export interface ShowdownMemory {
  seat: number
  status: ShowdownStatus
  /** Opponents with status `shown`. Hero's cards are always `HandDraft.hero`. */
  cards: HoleCardsMemory | null
}

export interface HandDraft {
  version: typeof DRAFT_VERSION
  /**
   * Physical seats that played the hand, Hero always included. Every other
   * seat dealt in folded preflop without putting in chips beyond a blind.
   */
  participants: number[]
  hero: HoleCardsMemory
  /** The streets the hand reached, preflop first, contiguous. */
  streets: DraftStreet[]
  /** One entry per seat with something recorded about showdown. */
  showdown: ShowdownMemory[]
  /** Who won. null = not recorded. Two or more seats = a split pot. */
  winners: number[] | null
  /** The final pot, if remembered. null = not recorded. */
  pot: Cents | null
}

export const UNKNOWN_CARD: CardMemory = { rank: null, suit: null }

export const unknownHoleCards = (): HoleCardsMemory => ({
  cards: [{ ...UNKNOWN_CARD }, { ...UNKNOWN_CARD }],
  suited: null,
})

/** How many board cards each street adds. */
export const BOARD_SLOTS: Record<Street, number> = { preflop: 0, flop: 3, turn: 1, river: 1 }
