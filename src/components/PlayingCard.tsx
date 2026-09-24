import { SUIT_SYMBOL, cardRank, cardSuit, describeCard, type Card, type Suit } from '../domain/poker/cards'

/**
 * A four-colour deck: spades light, hearts red, diamonds blue, clubs green.
 *
 * Colour is a speed aid, never the only signal -- the rank character and the
 * suit glyph are always rendered, and the accessible name spells the card out
 * in full ("Ace of spades"), so nothing about a card depends on seeing colour.
 */
const SUIT_CLASS: Record<Suit, string> = {
  s: 'text-room-50',
  h: 'text-chip-red',
  d: 'text-sky-400',
  c: 'text-felt-400',
}

const SIZES = {
  sm: 'h-9 w-7 text-sm rounded-[5px]',
  md: 'h-12 w-9 text-lg rounded-md',
  lg: 'h-16 w-12 text-2xl rounded-lg',
} as const

export function PlayingCard({
  card,
  size = 'md',
  className = '',
}: {
  card: Card
  size?: keyof typeof SIZES
  className?: string
}) {
  const suit = cardSuit(card)
  return (
    <span
      className={`inline-flex flex-col items-center justify-center border border-room-700 bg-room-850 font-semibold leading-none tabular ${SIZES[size]} ${SUIT_CLASS[suit]} ${className}`}
      role="img"
      aria-label={describeCard(card)}
    >
      <span aria-hidden="true">{cardRank(card)}</span>
      <span aria-hidden="true" className="text-[0.75em]">
        {SUIT_SYMBOL[suit]}
      </span>
    </span>
  )
}

/** An empty slot where a card will go. */
export function CardSlot({ size = 'md', label }: { size?: keyof typeof SIZES; label?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center border border-dashed border-room-700 bg-room-900/60 text-room-500 ${SIZES[size]}`}
      role="img"
      aria-label={label ?? 'Card not yet entered'}
    >
      <span aria-hidden="true">?</span>
    </span>
  )
}

export function CardRow({
  cards,
  size = 'md',
  placeholders = 0,
}: {
  cards: readonly Card[]
  size?: keyof typeof SIZES
  placeholders?: number
}) {
  const missing = Math.max(0, placeholders - cards.length)
  return (
    <span className="inline-flex gap-1">
      {cards.map((card) => (
        <PlayingCard key={card} card={card} size={size} />
      ))}
      {Array.from({ length: missing }, (_, index) => (
        <CardSlot key={`slot-${index}`} size={size} />
      ))}
    </span>
  )
}
