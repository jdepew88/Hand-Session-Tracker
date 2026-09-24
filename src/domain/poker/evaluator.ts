import {
  RANK_NAME,
  RANK_PLURAL,
  RANKS,
  cardSuit,
  rankValue,
  type Card,
  type Rank,
  type Suit,
} from './cards'
import type { HandCategory, HandRanking } from './models'

/**
 * Texas Hold'em hand evaluator.
 *
 * Evaluates 5-7 cards directly rather than enumerating every 5-card subset:
 * rank multiplicities, a suit histogram and a straight scan are enough to
 * identify the best hand and its kickers in one pass, and the result carries
 * the actual five cards so the UI can show what played.
 */

export const CATEGORY_RANK: Record<HandCategory, number> = {
  'high-card': 1,
  pair: 2,
  'two-pair': 3,
  trips: 4,
  straight: 5,
  flush: 6,
  'full-house': 7,
  quads: 8,
  'straight-flush': 9,
}

const VALUE_TO_RANK = new Map<number, Rank>(RANKS.map((rank) => [rankValue(`${rank}s`), rank]))

const rankName = (value: number) => RANK_NAME[VALUE_TO_RANK.get(value) ?? 'A']
const rankPlural = (value: number) => RANK_PLURAL[VALUE_TO_RANK.get(value) ?? 'A']

/**
 * Highest card of a straight within `values`, or null.
 * The wheel (A-2-3-4-5) is handled by also treating an Ace as 1; its high card is 5.
 */
function straightHigh(values: ReadonlySet<number>): number | null {
  const present = new Set(values)
  if (present.has(14)) present.add(1)
  for (let high = 14; high >= 5; high -= 1) {
    let run = true
    for (let offset = 0; offset < 5; offset += 1) {
      if (!present.has(high - offset)) {
        run = false
        break
      }
    }
    if (run) return high
  }
  return null
}

function cardsForStraight(cards: readonly Card[], high: number): Card[] {
  const wanted = high === 5 ? [5, 4, 3, 2, 14] : [high, high - 1, high - 2, high - 3, high - 4]
  const picked: Card[] = []
  for (const value of wanted) {
    const card = cards.find((c) => rankValue(c) === value && !picked.includes(c))
    if (card) picked.push(card)
  }
  return picked
}

function describe(category: HandCategory, kickers: readonly number[]): string {
  const [a, b] = kickers
  switch (category) {
    case 'straight-flush':
      return a === 14 ? 'a royal flush' : `a straight flush, ${rankName(a!)}-high`
    case 'quads':
      return `four of a kind, ${rankPlural(a!)}`
    case 'full-house':
      return `a full house, ${rankPlural(a!)} full of ${rankPlural(b!)}`
    case 'flush':
      return `a flush, ${rankName(a!)}-high`
    case 'straight':
      return `a straight, ${rankName(a!)}-high`
    case 'trips':
      return `three of a kind, ${rankPlural(a!)}`
    case 'two-pair':
      return `two pair, ${rankPlural(a!)} and ${rankPlural(b!)}`
    case 'pair':
      return `a pair of ${rankPlural(a!)}`
    case 'high-card':
      return `${rankName(a!)}-high`
  }
}

function ranking(category: HandCategory, kickers: number[], cards: Card[]): HandRanking {
  return {
    category,
    categoryRank: CATEGORY_RANK[category],
    kickers,
    cards,
    description: describe(category, kickers),
  }
}

/** Best five-card hand from 5, 6 or 7 cards. Returns null for fewer than five. */
export function evaluateHand(input: readonly Card[]): HandRanking | null {
  const cards = [...new Set(input)]
  if (cards.length < 5) return null

  const byValueDesc = [...cards].sort((a, b) => rankValue(b) - rankValue(a))

  const bySuit = new Map<Suit, Card[]>()
  for (const card of byValueDesc) {
    const suit = cardSuit(card)
    const list = bySuit.get(suit)
    if (list) list.push(card)
    else bySuit.set(suit, [card])
  }

  const flushCards = [...bySuit.values()].find((list) => list.length >= 5)

  if (flushCards) {
    const flushValues = new Set(flushCards.map(rankValue))
    const sfHigh = straightHigh(flushValues)
    if (sfHigh !== null) {
      return ranking('straight-flush', [sfHigh], cardsForStraight(flushCards, sfHigh))
    }
  }

  const counts = new Map<number, Card[]>()
  for (const card of byValueDesc) {
    const value = rankValue(card)
    const list = counts.get(value)
    if (list) list.push(card)
    else counts.set(value, [card])
  }

  // Sort groups by size first, then by rank -- exactly the comparison order
  // used for kickers.
  const groups = [...counts.entries()]
    .map(([value, group]) => ({ value, group }))
    .sort((a, b) => b.group.length - a.group.length || b.value - a.value)

  const quad = groups.find((g) => g.group.length === 4)
  if (quad) {
    const kicker = byValueDesc.find((card) => rankValue(card) !== quad.value)
    return ranking(
      'quads',
      [quad.value, kicker ? rankValue(kicker) : 0],
      [...quad.group, ...(kicker ? [kicker] : [])],
    )
  }

  const trips = groups.filter((g) => g.group.length === 3)
  const pairs = groups.filter((g) => g.group.length === 2)

  if (trips.length > 0 && (trips.length > 1 || pairs.length > 0)) {
    const top = trips[0]!
    // A second set plays as the pair when it outranks every actual pair.
    const partner = trips[1] && (!pairs[0] || trips[1].value > pairs[0].value) ? trips[1] : pairs[0]!
    return ranking('full-house', [top.value, partner.value], [...top.group, ...partner.group.slice(0, 2)])
  }

  if (flushCards) {
    const best = flushCards.slice(0, 5)
    return ranking('flush', best.map(rankValue), best)
  }

  const allValues = new Set(byValueDesc.map(rankValue))
  const straight = straightHigh(allValues)
  if (straight !== null) {
    return ranking('straight', [straight], cardsForStraight(byValueDesc, straight))
  }

  if (trips.length === 1) {
    const top = trips[0]!
    const kickers = byValueDesc.filter((card) => rankValue(card) !== top.value).slice(0, 2)
    return ranking('trips', [top.value, ...kickers.map(rankValue)], [...top.group, ...kickers])
  }

  if (pairs.length >= 2) {
    const [high, low] = [pairs[0]!, pairs[1]!]
    const kicker = byValueDesc.find(
      (card) => rankValue(card) !== high.value && rankValue(card) !== low.value,
    )
    return ranking(
      'two-pair',
      [high.value, low.value, kicker ? rankValue(kicker) : 0],
      [...high.group, ...low.group, ...(kicker ? [kicker] : [])],
    )
  }

  if (pairs.length === 1) {
    const pair = pairs[0]!
    const kickers = byValueDesc.filter((card) => rankValue(card) !== pair.value).slice(0, 3)
    return ranking('pair', [pair.value, ...kickers.map(rankValue)], [...pair.group, ...kickers])
  }

  const best = byValueDesc.slice(0, 5)
  return ranking('high-card', best.map(rankValue), best)
}

/** Positive when `a` beats `b`, negative when `b` beats `a`, 0 for an exact tie. */
export function compareRankings(a: HandRanking, b: HandRanking): number {
  if (a.categoryRank !== b.categoryRank) return a.categoryRank - b.categoryRank
  const length = Math.max(a.kickers.length, b.kickers.length)
  for (let i = 0; i < length; i += 1) {
    const left = a.kickers[i] ?? 0
    const right = b.kickers[i] ?? 0
    if (left !== right) return left - right
  }
  return 0
}
