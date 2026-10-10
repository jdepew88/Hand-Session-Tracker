import type { Rank, Suit } from '../cards'
import { isRank, isSuit } from './memory'
import type { CardMemory, HoleCardsMemory } from './model'

/**
 * Cards from the shorthand players write: "AsKd", "A♠ K♦", "AKs", "AKo",
 * "T82", "10c 8h 2c", "?h". A rank on its own leaves the suit unknown, and
 * "?" stands for a part that is not remembered. Typed by the player now, and
 * a building block for a future text or voice parser.
 */

const SYMBOLS: Record<string, Suit> = { '♠': 's', '♥': 'h', '♦': 'd', '♣': 'c' }

function normalise(text: string): string {
  return [...text.trim()]
    .map((char) => SYMBOLS[char] ?? char)
    .join('')
    .toLowerCase()
    .replace(/10/g, 't')
    .replace(/[\s,/-]+/g, '')
}

/** Read a run of cards. Null if the text is not cards at all. */
export function parseCardsShorthand(text: string): CardMemory[] | null {
  const source = normalise(text)
  if (source === '') return null
  const cards: CardMemory[] = []
  let index = 0
  while (index < source.length) {
    const rankChar = source[index]!.toUpperCase()
    let rank: Rank | null
    if (rankChar === '?' || rankChar === 'X') rank = null
    else if (isRank(rankChar)) rank = rankChar
    else return null
    index += 1
    let suit: Suit | null = null
    const next = source[index]
    if (next !== undefined && (isSuit(next) || next === '?')) {
      suit = next === '?' ? null : (next as Suit)
      index += 1
    }
    cards.push({ rank, suit })
  }
  return cards
}

/** Two hole cards, including "AKs" / "AKo" for suited and offsuit with the suits unknown. */
export function parseHoleShorthand(text: string): HoleCardsMemory | null {
  const source = normalise(text)
  const suitedForm = /^([akqjt2-9])([akqjt2-9])([so])$/.exec(source)
  if (suitedForm && suitedForm[1] !== suitedForm[2]) {
    return {
      cards: [
        { rank: suitedForm[1]!.toUpperCase() as Rank, suit: null },
        { rank: suitedForm[2]!.toUpperCase() as Rank, suit: null },
      ],
      suited: suitedForm[3] === 's',
    }
  }
  const cards = parseCardsShorthand(text)
  if (!cards || cards.length !== 2) return null
  return { cards: [cards[0]!, cards[1]!], suited: null }
}
