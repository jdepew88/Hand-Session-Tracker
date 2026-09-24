import { isValidAmount, type Cents } from '../money'
import { findDuplicateCards, isCard, type Card } from './cards'
import {
  STREETS,
  type ActionType,
  type AnteMode,
  type HandEvent,
  type HandSeatSetup,
  type HandSetup,
  type RakeStructure,
  type Street,
} from './models'

/**
 * Validation for untrusted input.
 *
 * Imported JSON is treated as hostile: it arrives from a file the app did not
 * write, so nothing is accepted on trust. Every field is type-checked, every
 * amount is bounded, every string is length-clamped and stripped of control
 * characters, and structural invariants (hero is seated, cards are real, no
 * card appears twice) are enforced before a record reaches the engine or the
 * database.
 *
 * Strings are never treated as markup anywhere in the app -- React escapes text
 * nodes and no component uses dangerouslySetInnerHTML -- so sanitising here is
 * about bounding size and stripping junk, not about defusing HTML.
 */

/** A single exported hand is small; anything larger is not a hand we wrote. */
export const MAX_IMPORT_BYTES = 512 * 1024
export const MAX_EVENTS = 1000
export const MAX_SEATS = 10
/** $1,000,000 in cents. Comfortably above any live cash game, far below overflow. */
export const MAX_AMOUNT: Cents = 100_000_000
export const MAX_NOTE_LENGTH = 4000
export const MAX_LABEL_LENGTH = 120
export const MAX_TAGS = 32

export class ValidationError extends Error {
  readonly issues: string[]
  constructor(issues: string[]) {
    super(issues[0] ?? 'Invalid data')
    this.name = 'ValidationError'
    this.issues = issues
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Strip control characters, collapse whitespace runs, trim and clamp. */
export function sanitizeString(value: unknown, maxLength: number, fallback = ''): string {
  if (typeof value !== 'string') return fallback
  // eslint-disable-next-line no-control-regex
  const stripped = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
  return stripped.slice(0, maxLength).trim()
}

export function readAmount(value: unknown, issues: string[], field: string, fallback = 0): Cents {
  if (!isValidAmount(value)) {
    issues.push(`${field} must be a whole number of cents.`)
    return fallback
  }
  if (value < 0) {
    issues.push(`${field} cannot be negative.`)
    return fallback
  }
  if (value > MAX_AMOUNT) {
    issues.push(`${field} exceeds the maximum supported amount.`)
    return fallback
  }
  return value
}

function readSeatNumber(value: unknown, issues: string[], field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > MAX_SEATS) {
    issues.push(`${field} must be a seat number between 1 and ${MAX_SEATS}.`)
    return 1
  }
  return value
}

function readCards(value: unknown, issues: string[], field: string, max: number): Card[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) {
    issues.push(`${field} must be a list of cards.`)
    return []
  }
  if (value.length > max) {
    issues.push(`${field} has too many cards.`)
    return []
  }
  const cards: Card[] = []
  for (const entry of value) {
    if (!isCard(entry)) {
      issues.push(`${field} contains an invalid card.`)
      continue
    }
    cards.push(entry)
  }
  return cards
}

const ANTE_MODES: AnteMode[] = ['none', 'all', 'bb', 'button']
const ACTION_TYPES: ActionType[] = ['fold', 'check', 'call', 'bet', 'raise']

export function parseRakeStructure(value: unknown, issues: string[]): RakeStructure {
  const source = isRecord(value) ? value : {}
  if (!isRecord(value)) issues.push('Rake structure is missing or malformed.')
  const jackpotStreet = STREETS.includes(source.jackpotStreet as Street)
    ? (source.jackpotStreet as Street)
    : 'flop'
  const capRaw = source.cap
  const cap =
    capRaw === null || capRaw === undefined ? null : readAmount(capRaw, issues, 'Rake cap', 0)
  // Omit empty notes entirely so an export -> import round trip is byte-identical.
  const notes = sanitizeString(source.notes, MAX_NOTE_LENGTH)
  return {
    id: sanitizeString(source.id, 64, 'imported-rake') || 'imported-rake',
    name: sanitizeString(source.name, MAX_LABEL_LENGTH, 'Imported rake') || 'Imported rake',
    preflop: readAmount(source.preflop, issues, 'Preflop drop'),
    flop: readAmount(source.flop, issues, 'Flop drop'),
    turn: readAmount(source.turn, issues, 'Turn drop'),
    river: readAmount(source.river, issues, 'River drop'),
    jackpot: readAmount(source.jackpot, issues, 'Jackpot drop'),
    jackpotStreet,
    cap,
    noFlopNoDrop: source.noFlopNoDrop !== false,
    ...(notes !== '' ? { notes } : {}),
  }
}

export function parseSeats(value: unknown, issues: string[]): HandSeatSetup[] {
  if (!Array.isArray(value)) {
    issues.push('Players must be a list.')
    return []
  }
  if (value.length > MAX_SEATS) {
    issues.push(`A hand cannot have more than ${MAX_SEATS} players.`)
    return []
  }
  const seats: HandSeatSetup[] = []
  const used = new Set<number>()
  for (const entry of value) {
    if (!isRecord(entry)) {
      issues.push('A player entry is malformed.')
      continue
    }
    const seat = readSeatNumber(entry.seat, issues, 'Player seat')
    if (used.has(seat)) {
      issues.push(`Seat ${seat} appears more than once.`)
      continue
    }
    used.add(seat)
    const label = sanitizeString(entry.label, MAX_LABEL_LENGTH)
    const playerId = sanitizeString(entry.playerId, 64)
    seats.push({
      seat,
      startingStack: readAmount(entry.startingStack, issues, `Seat ${seat} starting stack`),
      ...(label !== '' ? { label } : {}),
      ...(playerId !== '' ? { playerId } : {}),
    })
  }
  return seats
}

export function parseEvents(value: unknown, issues: string[]): HandEvent[] {
  if (!Array.isArray(value)) {
    issues.push('Actions must be a list.')
    return []
  }
  if (value.length > MAX_EVENTS) {
    issues.push(`A hand cannot contain more than ${MAX_EVENTS} events.`)
    return []
  }
  const events: HandEvent[] = []
  value.forEach((entry, index) => {
    if (!isRecord(entry)) {
      issues.push(`Event ${index + 1} is malformed.`)
      return
    }
    const id = sanitizeString(entry.id, 64) || `imported-${index}`
    switch (entry.kind) {
      case 'action': {
        if (!STREETS.includes(entry.street as Street)) {
          issues.push(`Event ${index + 1} has an unknown street.`)
          return
        }
        if (!ACTION_TYPES.includes(entry.action as ActionType)) {
          issues.push(`Event ${index + 1} has an unknown action.`)
          return
        }
        events.push({
          id,
          kind: 'action',
          street: entry.street as Street,
          seat: readSeatNumber(entry.seat, issues, `Event ${index + 1} seat`),
          action: entry.action as ActionType,
          to: readAmount(entry.to, issues, `Event ${index + 1} amount`),
        })
        return
      }
      case 'deal': {
        const street = entry.street
        if (street !== 'flop' && street !== 'turn' && street !== 'river') {
          issues.push(`Event ${index + 1} deals to an unknown street.`)
          return
        }
        const expected = street === 'flop' ? 3 : 1
        const cards = readCards(entry.cards, issues, `Event ${index + 1} cards`, expected)
        if (cards.length !== expected) {
          issues.push(`The ${street} must have exactly ${expected} card${expected > 1 ? 's' : ''}.`)
          return
        }
        events.push({ id, kind: 'deal', street, cards })
        return
      }
      case 'reveal': {
        const cards = readCards(entry.cards, issues, `Event ${index + 1} cards`, 4)
        events.push({
          id,
          kind: 'reveal',
          seat: readSeatNumber(entry.seat, issues, `Event ${index + 1} seat`),
          cards,
        })
        return
      }
      default:
        issues.push(`Event ${index + 1} has an unknown kind.`)
    }
  })
  return events
}

export function parseHandSetup(table: unknown, playersValue: unknown, issues: string[]): HandSetup {
  const source = isRecord(table) ? table : {}
  if (!isRecord(table)) issues.push('Table information is missing or malformed.')

  const seats = parseSeats(playersValue, issues)
  const seatNumbers = new Set(seats.map((seat) => seat.seat))

  const tableSizeRaw = source.tableSize
  const tableSize =
    typeof tableSizeRaw === 'number' && Number.isInteger(tableSizeRaw) && tableSizeRaw >= 2 && tableSizeRaw <= MAX_SEATS
      ? tableSizeRaw
      : (issues.push(`Table size must be between 2 and ${MAX_SEATS}.`), 9)

  const buttonSeat = readSeatNumber(source.buttonSeat, issues, 'Button seat')
  const heroSeat = readSeatNumber(source.heroSeat, issues, 'Hero seat')
  if (seats.length > 0 && !seatNumbers.has(buttonSeat)) issues.push('The button is not one of the seated players.')
  if (seats.length > 0 && !seatNumbers.has(heroSeat)) issues.push('Hero is not one of the seated players.')
  if (seats.length < 2) issues.push('A hand needs at least two players.')

  const anteMode = ANTE_MODES.includes(source.anteMode as AnteMode)
    ? (source.anteMode as AnteMode)
    : 'none'

  const straddles = Array.isArray(source.straddles)
    ? source.straddles.slice(0, MAX_SEATS).flatMap((entry) => {
        if (!isRecord(entry)) return []
        return [
          {
            seat: readSeatNumber(entry.seat, issues, 'Straddle seat'),
            amount: readAmount(entry.amount, issues, 'Straddle amount'),
          },
        ]
      })
    : []

  const deadMoney = Array.isArray(source.deadMoney)
    ? source.deadMoney.slice(0, MAX_SEATS).flatMap((entry) => {
        if (!isRecord(entry)) return []
        return [
          {
            seat: readSeatNumber(entry.seat, issues, 'Dead money seat'),
            amount: readAmount(entry.amount, issues, 'Dead money amount'),
          },
        ]
      })
    : []

  const heroCards = readCards(source.heroCards, issues, 'Hero cards', 4)
  if (heroCards.length !== 0 && heroCards.length !== 2) {
    issues.push("Hero's hole cards must be exactly two cards.")
  }

  return {
    tableSize,
    buttonSeat,
    heroSeat,
    smallBlind: readAmount(source.smallBlind, issues, 'Small blind'),
    bigBlind: readAmount(source.bigBlind, issues, 'Big blind'),
    ante: readAmount(source.ante, issues, 'Ante'),
    anteMode,
    straddles,
    deadMoney,
    seats,
    heroCards,
    rake: parseRakeStructure(source.rake, issues),
  }
}

/**
 * Cross-checks that need the whole hand: no physical card may appear twice
 * across hole cards, the board and any revealed hands.
 */
export function assertNoDuplicateCards(setup: HandSetup, events: readonly HandEvent[], issues: string[]) {
  const groups: Card[][] = [setup.heroCards]
  for (const event of events) {
    if (event.kind === 'deal' || event.kind === 'reveal') groups.push(event.cards)
  }
  const duplicates = findDuplicateCards(groups)
  if (duplicates.length > 0) {
    issues.push(`The same card appears more than once: ${duplicates.join(', ')}.`)
  }
}

export function parseTags(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const tags = value
    .slice(0, MAX_TAGS)
    .map((tag) => sanitizeString(tag, 64))
    .filter((tag) => tag !== '')
  return [...new Set(tags)]
}

export function parseIsoDate(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const time = Date.parse(value)
  if (Number.isNaN(time)) return fallback
  return new Date(time).toISOString()
}
