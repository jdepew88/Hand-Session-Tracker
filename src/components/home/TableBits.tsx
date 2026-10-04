import { SUIT_SYMBOL, cardRank, cardSuit, type Card } from '../../domain/poker/cards'
import type { Depth } from './demoHand'

/**
 * Physical table objects for the homepage illustrations.
 *
 * These are presentation only: the illustrations they sit in carry a single
 * text description for assistive technology, so the pieces themselves are
 * hidden from it rather than announcing a chip at a time.
 */

/** A face-up card on warm card stock, using the app's four-colour deck. */
export function FeltCard({ card }: { card: Card }) {
  const suit = cardSuit(card)
  const rank = cardRank(card)
  return (
    <span className={`hf-card hf-card--${suit}`} aria-hidden="true">
      <span className="hf-card__rank">
        {rank === 'T' ? '10' : rank}
        <small>{SUIT_SYMBOL[suit]}</small>
      </span>
      <span className="hf-card__pip">{SUIT_SYMBOL[suit]}</span>
    </span>
  )
}

export function CardBacks() {
  return (
    <span className="inline-flex items-end" aria-hidden="true">
      <span className="hf-back" />
      <span className="hf-back" />
    </span>
  )
}

/** A dashed outline where a card has not been dealt yet. */
export function EmptySlot() {
  return <span className="hf-slot" aria-hidden="true" />
}

export function DealerButton() {
  return (
    <span className="hf-dealer-btn" aria-hidden="true">
      D
    </span>
  )
}

const DEPTH_STACKS: Record<Depth, readonly number[]> = {
  short: [3],
  normal: [6],
  deep: [7, 4],
  'very-deep': [8, 7, 5],
}

type ChipColour = 'r' | 'k' | 'g' | 'i'
const PALETTE: readonly ChipColour[] = ['k', 'r', 'g', 'i']

/** Chip columns for a depth; `seed` varies the colours from seat to seat. */
export function ChipStacks({ depth, seed = 0 }: { depth: Depth; seed?: number }) {
  return <ChipColumns heights={DEPTH_STACKS[depth]} seed={seed} />
}

export function ChipColumns({ heights, seed = 0 }: { heights: readonly number[]; seed?: number }) {
  return (
    <span className="hf-stacks" aria-hidden="true">
      {heights.map((height, column) => {
        const colour = PALETTE[(seed + column) % PALETTE.length]!
        return (
          <span key={column} className={`hf-stack hf-top-${colour}`}>
            {Array.from({ length: height }, (_, index) => (
              <span key={index} className={`hf-chip hf-c-${colour}`} />
            ))}
          </span>
        )
      })}
    </span>
  )
}
