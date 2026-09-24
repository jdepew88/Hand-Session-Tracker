/** Card primitives. A card is the two-character string "Rank + suit", e.g. "As", "Td", "2c". */

export const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'] as const
export const SUITS = ['s', 'h', 'd', 'c'] as const

export type Rank = (typeof RANKS)[number]
export type Suit = (typeof SUITS)[number]
export type Card = string

/** Numeric rank value used by the evaluator. Deuce = 2 … Ace = 14. */
const RANK_VALUE: Record<Rank, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
  '9': 9, T: 10, J: 11, Q: 12, K: 13, A: 14,
}

export const SUIT_SYMBOL: Record<Suit, string> = { s: '♠', h: '♥', d: '♦', c: '♣' }

/**
 * Spelled-out suit names. Rank/suit must be understandable without relying on
 * colour or glyph alone, so every card control carries one of these in its
 * accessible name.
 */
export const SUIT_NAME: Record<Suit, string> = {
  s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs',
}

export const RANK_NAME: Record<Rank, string> = {
  A: 'Ace', K: 'King', Q: 'Queen', J: 'Jack', T: 'Ten', '9': 'Nine', '8': 'Eight',
  '7': 'Seven', '6': 'Six', '5': 'Five', '4': 'Four', '3': 'Three', '2': 'Two',
}

export const RANK_PLURAL: Record<Rank, string> = {
  A: 'Aces', K: 'Kings', Q: 'Queens', J: 'Jacks', T: 'Tens', '9': 'Nines', '8': 'Eights',
  '7': 'Sevens', '6': 'Sixes', '5': 'Fives', '4': 'Fours', '3': 'Threes', '2': 'Twos',
}

export function isCard(value: unknown): value is Card {
  if (typeof value !== 'string' || value.length !== 2) return false
  return (RANKS as readonly string[]).includes(value[0]!) && (SUITS as readonly string[]).includes(value[1]!)
}

export function makeCard(rank: Rank, suit: Suit): Card {
  return `${rank}${suit}`
}

export function cardRank(card: Card): Rank {
  return card[0] as Rank
}

export function cardSuit(card: Card): Suit {
  return card[1] as Suit
}

export function rankValue(card: Card): number {
  return RANK_VALUE[cardRank(card)]
}

/** Full 52-card deck, ordered by rank then suit. */
export function fullDeck(): Card[] {
  const deck: Card[] = []
  for (const rank of RANKS) for (const suit of SUITS) deck.push(makeCard(rank, suit))
  return deck
}

/** "As" -> "A♠" for compact summary text. */
export function formatCard(card: Card): string {
  return `${cardRank(card)}${SUIT_SYMBOL[cardSuit(card)]}`
}

export function formatCards(cards: readonly Card[]): string {
  return cards.map(formatCard).join(' ')
}

/** Accessible label, e.g. "Ace of spades". Never relies on colour. */
export function describeCard(card: Card): string {
  return `${RANK_NAME[cardRank(card)]} of ${SUIT_NAME[cardSuit(card)]}`
}

/**
 * Returns the cards that appear more than once across all supplied groups.
 * A physical card exists exactly once in a deck, so any repeat is a data error.
 */
export function findDuplicateCards(groups: readonly (readonly Card[] | undefined)[]): Card[] {
  const seen = new Set<Card>()
  const duplicates = new Set<Card>()
  for (const group of groups) {
    if (!group) continue
    for (const card of group) {
      if (seen.has(card)) duplicates.add(card)
      seen.add(card)
    }
  }
  return [...duplicates]
}

export function sortByRankDesc(cards: readonly Card[]): Card[] {
  return [...cards].sort((a, b) => rankValue(b) - rankValue(a))
}
