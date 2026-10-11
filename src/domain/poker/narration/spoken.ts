import type { Rank, Suit } from '../cards'
import { parseCardsShorthand } from '../draft/shorthand'
import type { NarrationCard, NarrationPosition } from './schema'

/**
 * The deterministic part of reading poker talk: money, pot fractions, seat
 * numbers, position words and spoken cards. These have one right answer, so
 * they are plain code rather than a language model's opinion. The normaliser
 * uses them to check what a parser claims ("jack ten of hearts" really is
 * J♥ T♥) and the on-device practice parser is built from them.
 *
 * Every reader is strict: a phrase it does not fully understand returns null
 * rather than a partial guess.
 */

/* ============================================================== money */

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, hundred: 100,
}

/** "$17", "17", "17 dollars", "$1,250", "1.5k", "2k". Dollars, or null. */
export function parseMoney(phrase: string): number | null {
  const text = phrase.trim().toLowerCase().replace(/,(?=\d{3}\b)/g, '')
  const match = /^\$?\s*(\d+(?:\.\d{1,2})?)\s*(k)?\s*(?:dollars?|bucks?)?$/.exec(text)
  if (!match) return null
  const value = Number(match[1]) * (match[2] ? 1000 : 1)
  return Number.isFinite(value) && value > 0 ? value : null
}

/** Dollars to cents, exactly. */
export const dollarsToCents = (dollars: number) => Math.round(dollars * 100)

/* ======================================================== pot fractions */

const FRACTIONS: [RegExp, number][] = [
  [/^(?:half|1\/2|½|a half)(?: (?:of )?(?:the )?pot)?$/, 0.5],
  [/^(?:two thirds?|2\/3|⅔)(?: (?:of )?(?:the )?pot)?$/, 0.67],
  [/^(?:a third|one third|third|1\/3|⅓)(?: (?:of )?(?:the )?pot)?$/, 0.33],
  [/^(?:three quarters?|3\/4|¾)(?: (?:of )?(?:the )?pot)?$/, 0.75],
  [/^(?:a quarter|quarter|1\/4|¼)(?: (?:of )?(?:the )?pot)?$/, 0.25],
  [/^(?:pot|full pot|the pot|pot sized?)$/, 1],
]

/**
 * "half pot", "two thirds", "2/3", "⅔", "pot", "1.2x pot", "1.2x". A fraction
 * of the pot, or null. Two thirds is kept as 0.67: the pot is rarely known
 * to the cent anyway.
 */
export function parsePotRatio(phrase: string): number | null {
  const text = phrase.trim().toLowerCase().replace(/-/g, ' ').replace(/\s+/g, ' ')
  for (const [pattern, ratio] of FRACTIONS) if (pattern.test(text)) return ratio
  const times = /^(\d+(?:\.\d+)?)\s*(?:x|times)(?: (?:the )?pot)?$/.exec(text)
  if (times) {
    const ratio = Number(times[1])
    return ratio > 0 && ratio <= 10 ? ratio : null
  }
  const percent = /^(\d{1,3})\s*(?:%|percent)(?: (?:of )?(?:the )?pot)?$/.exec(text)
  if (percent) return Number(percent[1]) / 100
  return null
}

/** "2/3 pot", "1.2x pot", "half pot", for display. */
export function ratioText(ratio: number): string {
  const named: Record<string, string> = { '0.25': '1/4', '0.33': '1/3', '0.5': '1/2', '0.67': '2/3', '0.75': '3/4', '1': 'full' }
  const name = named[String(ratio)]
  if (name === 'full') return 'pot'
  return name ? `${name} pot` : `${ratio}x pot`
}

/* ============================================================== seats */

/** "seat six", "seat 6", "s6". */
export function parseSeatNumber(phrase: string): number | null {
  const match = /^(?:seat|s)\s*(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)$/.exec(phrase.trim().toLowerCase())
  if (!match) return null
  const value = NUMBER_WORDS[match[1]!] ?? Number(match[1])
  return value >= 1 && value <= 10 ? value : null
}

const POSITION_WORDS: [RegExp, NarrationPosition][] = [
  [/^(?:the )?(?:button|btn|bu|dealer|on the button)$/, 'BTN'],
  [/^(?:the )?(?:cut ?off|co|cutoff)$/, 'CO'],
  [/^(?:the )?(?:hi ?jack|hj)$/, 'HJ'],
  [/^(?:the )?(?:lo ?jack|lj)$/, 'LJ'],
  [/^(?:the )?(?:small blind|sb|small)$/, 'SB'],
  [/^(?:the )?(?:big blind|bb)$/, 'BB'],
  [/^(?:under the gun|utg|first to act|first in)$/, 'UTG'],
  [/^(?:under the gun plus one|utg ?\+ ?1|utg1|utg plus one|utg plus 1)$/, 'UTG+1'],
  [/^(?:under the gun plus two|utg ?\+ ?2|utg2|utg plus two|utg plus 2)$/, 'UTG+2'],
  [/^(?:under the gun plus three|utg ?\+ ?3|utg3|utg plus three|utg plus 3)$/, 'UTG+3'],
]

/** "cutoff", "CO", "the button", "big blind", "UTG+1". */
export function parsePosition(phrase: string): NarrationPosition | null {
  const text = phrase.trim().toLowerCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ')
  for (const [pattern, position] of POSITION_WORDS) if (pattern.test(text)) return position
  return null
}

/* ============================================================== cards */

const RANK_WORDS: Record<string, Rank> = {
  ace: 'A', aces: 'A', king: 'K', kings: 'K', queen: 'Q', queens: 'Q', jack: 'J', jacks: 'J',
  ten: 'T', tens: 'T', nine: '9', nines: '9', eight: '8', eights: '8', seven: '7', sevens: '7',
  six: '6', sixes: '6', five: '5', fives: '5', four: '4', fours: '4', three: '3', threes: '3',
  trey: '3', treys: '3', two: '2', twos: '2', deuce: '2', deuces: '2',
}

const PLURAL_RANKS = new Set(Object.keys(RANK_WORDS).filter((word) => word.endsWith('s')))

const SUIT_WORDS: Record<string, Suit> = {
  spade: 's', spades: 's', heart: 'h', hearts: 'h', diamond: 'd', diamonds: 'd', club: 'c', clubs: 'c',
}

const SYMBOLS: Record<string, string> = { '♠': ' spades ', '♥': ' hearts ', '♦': ' diamonds ', '♣': ' clubs ' }

/** Words that carry no card information: "I have", "the flop came". */
const CARD_FILLER = new Set([
  'the', 'a', 'an', 'was', 'is', 'came', 'comes', 'come', 'with', 'and', 'i', 'have', 'had', 'hold', 'holding', 'held',
  'flop', 'turn', 'river', 'board', 'on', 'it', 'its', 'some', 'pocket', 'pair', 'of', 'card', 'cards', 'my', 'he', 'she',
  'has', 'show', 'shows', 'showed', 'shown', 'got', 'dealt', 'hand', 'in', 'off', 'then', 'out', 'ran', 'falls', 'fell', 'as',
])

const BLANK_WORDS = new Set(['brick', 'blank', 'rag', 'bricked', 'nothing'])

export interface SpokenCards {
  cards: NarrationCard[]
  suited: boolean | null
  pattern: 'rainbow' | 'two-tone' | 'monotone' | null
  patternSuit: Suit | null
  /** "brick", "some low club": a description standing in for a card. */
  description: string | null
}

const shorthandToken = /^(?:(?:10|[akqjt2-9x?])[shdc?]?)+$/

/**
 * Cards as people say them: "jack ten of hearts", "ace king suited", "pocket
 * tens", "red queens", "ace king queen all spades", "ten eight two two
 * clubs", "A72 rainbow", "nine of clubs", "king clubs", "brick", "some low
 * club", "AsKd", "T82". Null when any word is not understood.
 *
 * `slots` is how many cards are expected (2 for a hand, 3 for a flop, 1 for
 * a turn or river); it is what tells "ten eight two, two clubs" (a suit
 * pattern) from "two of clubs" (a card).
 */
export function parseSpokenCards(phrase: string, slots: number): SpokenCards | null {
  let source = phrase.toLowerCase()
  for (const [symbol, word] of Object.entries(SYMBOLS)) source = source.split(symbol).join(word)
  source = source.replace(/[’']/g, '').replace(/[,.;:!]/g, ' ').replace(/-/g, ' ')
  const tokens = source.split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return null

  const result: SpokenCards = { cards: [], suited: null, pattern: null, patternSuit: null, description: null }
  /** Index of the first card not yet given a suit by "of hearts" / "all spades". */
  let unsuitedFrom = 0
  let colour: 'red' | 'black' | null = null
  let low = false

  const assignSuit = (suit: Suit) => {
    for (let index = unsuitedFrom; index < result.cards.length; index += 1) {
      if (result.cards[index]!.suit === null) result.cards[index] = { ...result.cards[index]!, suit }
    }
    unsuitedFrom = result.cards.length
  }

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!
    const next = tokens[index + 1]

    if (BLANK_WORDS.has(token)) {
      result.cards.push({ rank: null, suit: null })
      result.description = token
      continue
    }
    if (token === 'low' || token === 'high' || token === 'small' || token === 'big') {
      low = true
      continue
    }
    if (token === 'red' || token === 'black') {
      colour = token
      continue
    }
    if (token === 'suited' || token === 'sooted') {
      result.suited = true
      continue
    }
    if (token === 'offsuit' || token === 'offsuited' || (token === 'off' && next === 'suit')) {
      result.suited = false
      if (token === 'off') index += 1
      continue
    }
    if (token === 'rainbow') {
      result.pattern = 'rainbow'
      continue
    }
    if (token === 'monotone') {
      result.pattern = 'monotone'
      continue
    }
    if ((token === 'two' && next === 'tone') || token === 'twotone') {
      result.pattern = 'two-tone'
      if (token === 'two') index += 1
      continue
    }
    // "two clubs" / "three spades" / "all spades" after the cards are named: a suit pattern.
    if ((token === 'two' || token === 'three' || token === 'all') && next && SUIT_WORDS[next] && result.cards.length >= slots && slots === 3) {
      const suit = SUIT_WORDS[next]!
      if (token === 'two') {
        result.pattern = 'two-tone'
        result.patternSuit = suit
      } else {
        result.pattern = 'monotone'
        result.patternSuit = suit
        assignSuit(suit)
      }
      index += 1
      continue
    }
    if (token === 'all' && next && SUIT_WORDS[next]) {
      assignSuit(SUIT_WORDS[next]!)
      if (slots === 3 && result.cards.length === 3) {
        result.pattern = 'monotone'
        result.patternSuit = SUIT_WORDS[next]!
      }
      index += 1
      continue
    }
    if (SUIT_WORDS[token]) {
      const suit = SUIT_WORDS[token]
      if (low || result.cards.length === unsuitedFrom) {
        // "some low club": a card of that suit, rank not said.
        result.cards.push({ rank: null, suit })
        if (low) result.description = phrase.trim()
        unsuitedFrom = result.cards.length
        low = false
        continue
      }
      assignSuit(suit)
      continue
    }
    if (RANK_WORDS[token]) {
      const rank = RANK_WORDS[token]
      // "tens", "pocket tens", "red queens": a pair.
      if (PLURAL_RANKS.has(token) && slots === 2 && result.cards.length === 0) {
        if (colour === 'red') result.cards.push({ rank, suit: 'h' }, { rank, suit: 'd' })
        else if (colour === 'black') result.cards.push({ rank, suit: 's' }, { rank, suit: 'c' })
        else result.cards.push({ rank, suit: null }, { rank, suit: null })
        unsuitedFrom = result.cards.length
        colour = null
        continue
      }
      result.cards.push({ rank, suit: null })
      continue
    }
    if (CARD_FILLER.has(token)) continue
    if (token === 'x' || token === '?' || token === 'unknown') {
      result.cards.push({ rank: null, suit: null })
      continue
    }
    // Compact notation: "AK", "AKs", "AKo", "T82", "AsKd", "10c".
    const compact = /^(.*?)([so])?$/.exec(token)!
    if (shorthandToken.test(token) || (compact[2] && shorthandToken.test(compact[1]!) && compact[1]!.length === 2)) {
      const body = compact[2] && compact[1]!.length === 2 && !/[shdc]/.test(compact[1]!) ? compact[1]! : token
      const cards = parseCardsShorthand(body)
      if (!cards) return null
      result.cards.push(...cards)
      if (body !== token) result.suited = compact[2] === 's'
      continue
    }
    return null
  }

  if (colour !== null || low) return null
  if (result.cards.length === 0 && result.pattern === null) return null
  if (result.cards.length > slots) return null
  return result
}

/** Rank and suit pairs as compact text, for comparing two readings. */
export const cardsKey = (cards: readonly NarrationCard[]) => cards.map((card) => `${card.rank ?? '?'}${card.suit ?? '?'}`).join(' ')
