import type { Cents } from '../../domain/money'
import type { Card } from '../../domain/poker/cards'
import { stackDepth, type Depth } from '../table/depth'

/**
 * The illustrative hand the homepage tells, start to finish.
 *
 * It is static marketing content, not engine state, but it is kept internally
 * consistent so a poker player reading it finds nothing wrong: $2/$5, eight
 * handed, hero on the button with A♠Q♠.
 *
 *   Preflop  UTG, +1, LJ fold · HJ raises to $20 · CO, hero call · SB folds · BB calls  → $82
 *   Flop     9♣ K♥ 4♠ · BB checks · HJ bets $55 · CO calls · hero to act  (the hero scene)
 *   Turn     2♦ · HJ folds after hero and CO put in $68 more
 *   River    J♣ · checked through · CO shows K♠J♦, two pair, and wins $383
 *
 * Hero's total in is $20 + $55 + $68 = $143, the loss shown in step four.
 */

export const BIG_BLIND: Cents = 500

/** Stack depth bucket for the chip illustration. */
export function depthOf(stack: Cents): Depth {
  return stackDepth(stack / BIG_BLIND)
}

export type DemoSeat = {
  /** Table slot: 0 is the hero at the bottom, then clockwise. */
  slot: number
  position: string
  stack: Cents
  status: 'folded' | 'in' | 'to-act'
  /** What the seat has done on the current street, as the pod shows it. */
  note?: string
  /** Chips pushed forward on the current street. */
  bet?: Cents
}

export const HERO_SEATS: readonly DemoSeat[] = [
  { slot: 0, position: 'BTN', stack: 74_000, status: 'to-act' },
  { slot: 1, position: 'SB', stack: 9_500, status: 'folded', note: 'Fold' },
  { slot: 2, position: 'BB', stack: 51_000, status: 'in', note: 'Check' },
  { slot: 3, position: 'UTG', stack: 31_000, status: 'folded', note: 'Fold' },
  { slot: 4, position: 'UTG+1', stack: 64_000, status: 'folded', note: 'Fold' },
  { slot: 5, position: 'LJ', stack: 48_000, status: 'folded', note: 'Fold' },
  { slot: 6, position: 'HJ', stack: 22_500, status: 'in', note: 'Bet', bet: 5_500 },
  { slot: 7, position: 'CO', stack: 124_000, status: 'in', note: 'Call', bet: 5_500 },
]

export const HERO_CARDS: readonly Card[] = ['As', 'Qs']
export const VILLAIN_CARDS: readonly Card[] = ['Ks', 'Jd']
export const FLOP: readonly Card[] = ['9c', 'Kh', '4s']
export const TURN: Card = '2d'
export const RIVER: Card = 'Jc'

export const POT_ON_FLOP: Cents = 8_200
export const FINAL_POT: Cents = 38_300
export const HERO_RESULT: Cents = -14_300

export const PREFLOP_ACTION: readonly { who: string; action: string; hero?: boolean }[] = [
  { who: 'UTG–LJ', action: 'Fold' },
  { who: 'HJ', action: 'Raises to $20' },
  { who: 'CO', action: 'Calls' },
  { who: 'YOU', action: 'Calls', hero: true },
  { who: 'SB', action: 'Folds' },
  { who: 'BB', action: 'Calls' },
]
