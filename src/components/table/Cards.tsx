import { SUIT_SYMBOL, cardRank, cardSuit, type Card } from '../../domain/poker/cards'
import './table.css'

/**
 * Cards as they look on the felt. Presentation only: whatever shows a card
 * carries the accessible description, so these are hidden from assistive
 * technology rather than announced one glyph at a time.
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
