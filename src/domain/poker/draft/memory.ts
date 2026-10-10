import { RANKS, SUITS, cardRank, cardSuit, makeCard, type Card, type Rank, type Suit } from '../cards'
import type { CardMemory, HoleCardsMemory } from './model'

/** Helpers for remembered cards. A card is only a real `Card` once both halves are known. */

export const isExactCard = (card: CardMemory): card is { rank: Rank; suit: Suit } =>
  card.rank !== null && card.suit !== null

export const isUnknownCard = (card: CardMemory) => card.rank === null && card.suit === null

export function exactCard(card: CardMemory): Card | null {
  return isExactCard(card) ? makeCard(card.rank, card.suit) : null
}

export function rememberCard(card: Card): CardMemory {
  return { rank: cardRank(card), suit: cardSuit(card) }
}

/** The real cards among these, skipping anything partly remembered. */
export function exactCards(cards: readonly CardMemory[]): Card[] {
  return cards.flatMap((card) => {
    const exact = exactCard(card)
    return exact ? [exact] : []
  })
}

/** Both hole cards as real cards, or null if either is incomplete. */
export function exactHoleCards(hole: HoleCardsMemory | null): [Card, Card] | null {
  if (!hole) return null
  const first = exactCard(hole.cards[0])
  const second = exactCard(hole.cards[1])
  return first && second ? [first, second] : null
}

export const holeCardsKnown = (hole: HoleCardsMemory | null) =>
  hole !== null && hole.cards.some((card) => !isUnknownCard(card))

/** Suited, offsuit or unknown: from the suits when both are known, otherwise as recorded. */
export function suitedness(hole: HoleCardsMemory): boolean | null {
  const [first, second] = hole.cards
  if (first.suit !== null && second.suit !== null) return first.suit === second.suit
  return hole.suited
}

export const isPair = (hole: HoleCardsMemory) =>
  hole.cards[0].rank !== null && hole.cards[0].rank === hole.cards[1].rank

export const isRank = (value: unknown): value is Rank => (RANKS as readonly unknown[]).includes(value)
export const isSuit = (value: unknown): value is Suit => (SUITS as readonly unknown[]).includes(value)

/** Equality for remembered cards. */
export const sameMemory = (a: CardMemory, b: CardMemory) => a.rank === b.rank && a.suit === b.suit
