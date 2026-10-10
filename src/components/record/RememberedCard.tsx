import { SUIT_SYMBOL } from '../../domain/poker/cards'
import { exactCard, isUnknownCard } from '../../domain/poker/draft/memory'
import type { CardMemory, HoleCardsMemory } from '../../domain/poker/draft/model'
import { EmptySlot, FeltCard } from '../table/Cards'
import './record.css'

/**
 * A card on the felt as remembered. Exact cards are drawn as cards; a card
 * with only its rank or suit shows that part and a "?" for the rest; an
 * unknown card is a "?" outline. Presentation only -- the text beside it
 * carries the words.
 */
export function RememberedCard({ card, empty = 'unknown' }: { card: CardMemory; empty?: 'unknown' | 'slot' }) {
  const exact = exactCard(card)
  if (exact) return <FeltCard card={exact} />
  if (isUnknownCard(card)) {
    if (empty === 'slot') return <EmptySlot />
    return (
      <span className="hf-card rc-card--unknown" aria-hidden="true">
        ?
      </span>
    )
  }
  const suitClass = card.suit ? `hf-card--${card.suit}` : ''
  return (
    <span className={`hf-card rc-card--partial ${suitClass}`} aria-hidden="true">
      <span className="hf-card__rank">
        {card.rank ? (card.rank === 'T' ? '10' : card.rank) : '?'}
        <small>{card.suit ? SUIT_SYMBOL[card.suit] : '?'}</small>
      </span>
      <span className="hf-card__pip">{card.suit ? SUIT_SYMBOL[card.suit] : '?'}</span>
    </span>
  )
}

/** Two hole cards side by side, as they sit in front of a seat. */
export function HoleCards({ cards }: { cards: HoleCardsMemory['cards'] }) {
  return (
    <span className="rc-spot__cards">
      <RememberedCard card={cards[0]} />
      <RememberedCard card={cards[1]} />
    </span>
  )
}
