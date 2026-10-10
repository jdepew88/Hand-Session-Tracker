import type { PlayerProfile, PlayerTag, Session } from './models'
import { occupiedSeats } from './occupancy'
import { playerAliases, playerTags, seatedPlayer } from './players'
import { derivePositions, type Position } from './positions'
import { positionName } from './tableView'

/**
 * Who a phrase could mean -- the groundwork for turning "hoodie guy opened
 * the cutoff" into seats.
 *
 * Deterministic and explicit: a phrase matches a seat only through the
 * seat's number, its position, Hero, the player's label, an alias the player
 * added, or a quick tag. Notes are never searched. Nothing is ranked or
 * guessed: every candidate is returned with the reason it matched, and a
 * phrase that fits two people returns both, for the caller to ask about.
 */

export interface SeatReference {
  seat: number
  playerId: string | null
  isHero: boolean
  label: string | null
  aliases: string[]
  tags: PlayerTag[]
  /** "CO", or null before the button is placed. */
  position: Position | null
}

export type MatchReason = 'hero' | 'seat' | 'position' | 'label' | 'alias' | 'tag'

export interface ReferenceMatch {
  seat: number
  playerId: string | null
  via: MatchReason
}

/** Every occupied chair and what it can be called right now. */
export function tableReferences(
  session: Pick<Session, 'id' | 'tableSize' | 'heroSeat' | 'buttonSeat' | 'seatStatus'>,
  players: readonly PlayerProfile[],
): SeatReference[] {
  const seats = occupiedSeats(session)
  const positions =
    session.buttonSeat !== null && seats.includes(session.buttonSeat) ? derivePositions(seats, session.buttonSeat) : new Map()
  return seats.map((seat) => {
    const player = seatedPlayer(players, session, seat)
    const label = player?.nickname.trim() || null
    return {
      seat,
      playerId: player?.id ?? null,
      isHero: session.heroSeat === seat,
      label,
      aliases: playerAliases(player),
      tags: playerTags(player),
      position: positions.get(seat) ?? null,
    }
  })
}

const NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
}

/** Words that describe a person without identifying one: "the old guy" means "old". */
const FILLER = new Set(['the', 'a', 'an', 'that', 'this', 'guy', 'man', 'woman', 'lady', 'dude', 'player', 'fella', 'gentleman', 'girl'])

const HERO_WORDS = new Set(['hero', 'me', 'i', 'myself'])

export function normalisePhrase(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9+]+/g, ' ')
    .trim()
}

const words = (text: string) => normalisePhrase(text).split(' ').filter(Boolean)
const meaningful = (text: string) => words(text).filter((word) => !FILLER.has(word))

/** "Cutoff" -> ["cutoff", "cut off", "co"]. */
function positionNames(position: Position): string[] {
  const name = normalisePhrase(positionName(position))
  const short = normalisePhrase(position)
  const extra: Record<string, string[]> = {
    BTN: ['button', 'dealer', 'btn', 'on the button'],
    CO: ['cutoff', 'cut off'],
    SB: ['small blind', 'small'],
    BB: ['big blind'],
  }
  return [...new Set([name, short, short.replace(/\+/g, ' '), ...(extra[position] ?? [])])]
}

/** A seat number said as "seat 6", "seat six" or "s6". */
function seatNumber(phrase: string): number | null {
  const match = /^(?:seat|s)\s*(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)$/.exec(phrase)
  if (!match) return null
  const value = match[1]!
  return NUMBERS[value] ?? Number(value)
}

/** True when every meaningful word of the phrase is a word of the name: "hoodie" fits "Hoodie Guy". */
function namesMatch(phrase: string, name: string): boolean {
  const target = normalisePhrase(name)
  if (target === '') return false
  if (normalisePhrase(phrase) === target) return true
  const asked = meaningful(phrase)
  if (asked.length === 0) return false
  const have = new Set(words(name))
  return asked.every((word) => have.has(word))
}

/**
 * Seats a single phrase could refer to, each with the reason. A seat appears
 * once, under its most specific reason (Hero, seat number, label, alias,
 * position, then tag).
 */
export function resolveReference(references: readonly SeatReference[], phrase: string): ReferenceMatch[] {
  const text = normalisePhrase(phrase)
  if (text === '') return []
  const core = meaningful(phrase).join(' ')
  const number = seatNumber(text) ?? seatNumber(core)
  const matches: ReferenceMatch[] = []
  const add = (reference: SeatReference, via: MatchReason) => {
    if (!matches.some((match) => match.seat === reference.seat)) matches.push({ seat: reference.seat, playerId: reference.playerId, via })
  }

  for (const reference of references) if (reference.isHero && (HERO_WORDS.has(text) || HERO_WORDS.has(core))) add(reference, 'hero')
  for (const reference of references) if (number !== null && reference.seat === number) add(reference, 'seat')
  for (const reference of references) if (reference.label && namesMatch(phrase, reference.label)) add(reference, 'label')
  for (const reference of references) if (reference.aliases.some((alias) => namesMatch(phrase, alias))) add(reference, 'alias')
  for (const reference of references) {
    if (reference.position && positionNames(reference.position).some((name) => name === text || name === core)) add(reference, 'position')
  }
  const tagWords = meaningful(phrase)
  for (const reference of references) {
    const tags = new Set(reference.tags.map((tag) => tag.toLowerCase()))
    if (tagWords.length > 0 && tagWords.every((word) => tags.has(word))) add(reference, 'tag')
  }
  return matches.sort((a, b) => a.seat - b.seat)
}

/**
 * Seats every phrase agrees on: "the old guy" and "in the big blind" narrow
 * each other. Empty when they agree on nobody.
 */
export function resolveTogether(references: readonly SeatReference[], phrases: readonly string[]): ReferenceMatch[] {
  const lists = phrases.map((phrase) => resolveReference(references, phrase))
  if (lists.length === 0) return []
  return lists[0]!.filter((match) => lists.every((list) => list.some((other) => other.seat === match.seat)))
}
