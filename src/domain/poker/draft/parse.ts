import { STREETS, type Street } from '../models'
import { MAX_EVENTS, MAX_SEATS, readAmount, sanitizeString } from '../validation'
import { isRank, isSuit } from './memory'
import {
  BOARD_SLOTS,
  DRAFT_ACTION_KINDS,
  DRAFT_VERSION,
  SHOWDOWN_STATUSES,
  SIZED_ACTIONS,
  type CardMemory,
  type DraftAction,
  type DraftActionKind,
  type DraftStreet,
  type FlopSuits,
  type HandDraft,
  type HoleCardsMemory,
  type ShowdownMemory,
  type ShowdownStatus,
} from './model'

/**
 * Reading a draft from untrusted JSON: an imported file, or a draft restored
 * from the browser. Same rules as the rest of import -- every field is
 * type-checked, every amount bounded, every list capped, every id cleaned --
 * and any problem is reported rather than silently dropped. Whether the hand
 * could have happened is `checkDraft`'s job, run afterwards.
 */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function readSeat(value: unknown, issues: string[], field: string): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > MAX_SEATS) {
    issues.push(`${field} must be a seat number between 1 and ${MAX_SEATS}.`)
    return null
  }
  return value
}

function readCard(value: unknown, issues: string[], field: string): CardMemory {
  if (!isRecord(value)) {
    issues.push(`${field} is malformed.`)
    return { rank: null, suit: null }
  }
  const rank = value.rank === null || value.rank === undefined ? null : value.rank
  const suit = value.suit === null || value.suit === undefined ? null : value.suit
  if (rank !== null && !isRank(rank)) issues.push(`${field} has an unknown rank.`)
  if (suit !== null && !isSuit(suit)) issues.push(`${field} has an unknown suit.`)
  return { rank: isRank(rank) ? rank : null, suit: isSuit(suit) ? suit : null }
}

function readHole(value: unknown, issues: string[], field: string): HoleCardsMemory {
  const source = isRecord(value) ? value : {}
  if (!isRecord(value)) issues.push(`${field} are malformed.`)
  const cards = Array.isArray(source.cards) ? source.cards : []
  if (cards.length !== 2) issues.push(`${field} must have two card slots.`)
  const suited = source.suited === true ? true : source.suited === false ? false : null
  return {
    cards: [readCard(cards[0] ?? {}, issues, `${field} (first card)`), readCard(cards[1] ?? {}, issues, `${field} (second card)`)],
    suited,
  }
}

function readSuits(value: unknown, issues: string[]): FlopSuits | null {
  if (value === null || value === undefined) return null
  if (!isRecord(value)) {
    issues.push('Flop suits are malformed.')
    return null
  }
  const suit = isSuit(value.suit) ? value.suit : null
  switch (value.kind) {
    case 'rainbow':
      return { kind: 'rainbow' }
    case 'two-tone':
      return { kind: 'two-tone', suit }
    case 'monotone':
      return { kind: 'monotone', suit }
    default:
      issues.push('Flop suits have an unknown pattern.')
      return null
  }
}

function readSeatList(value: unknown, issues: string[], field: string): number[] {
  if (!Array.isArray(value)) {
    issues.push(`${field} must be a list of seats.`)
    return []
  }
  if (value.length > MAX_SEATS) {
    issues.push(`${field} has too many seats.`)
    return []
  }
  return [...new Set(value.map((entry) => readSeat(entry, issues, field)).filter((seat): seat is number => seat !== null))]
}

export function parseDraft(value: unknown, issues: string[]): HandDraft | null {
  if (!isRecord(value)) {
    issues.push('The reconstructed hand is malformed.')
    return null
  }
  if (value.version !== DRAFT_VERSION) {
    issues.push(`Unsupported reconstructed hand version ${String(value.version)}.`)
    return null
  }

  const participants = readSeatList(value.participants, issues, 'Players in the hand')
  const hero = readHole(value.hero, issues, "Hero's cards")

  const streetsRaw = Array.isArray(value.streets) ? value.streets : []
  if (!Array.isArray(value.streets)) issues.push('Streets must be a list.')
  if (streetsRaw.length > STREETS.length) issues.push('A hand has at most four streets.')
  let actionCount = 0
  const streets: DraftStreet[] = streetsRaw.slice(0, STREETS.length).flatMap((entry, index) => {
    if (!isRecord(entry) || !STREETS.includes(entry.street as Street)) {
      issues.push(`Street ${index + 1} is malformed.`)
      return []
    }
    const street = entry.street as Street
    const cardsRaw = Array.isArray(entry.cards) ? entry.cards : []
    if (cardsRaw.length !== BOARD_SLOTS[street]) issues.push(`The ${street} must have ${BOARD_SLOTS[street]} card slots.`)
    const cards = cardsRaw.slice(0, BOARD_SLOTS[street]).map((card, slot) => readCard(card, issues, `${street} card ${slot + 1}`))
    const actionsRaw = Array.isArray(entry.actions) ? entry.actions : []
    actionCount += actionsRaw.length
    const actions: DraftAction[] = actionsRaw.slice(0, MAX_EVENTS).flatMap((raw, position) => {
      const field = `${street} action ${position + 1}`
      if (!isRecord(raw) || !DRAFT_ACTION_KINDS.includes(raw.action as DraftActionKind)) {
        issues.push(`${field} is malformed.`)
        return []
      }
      const seat = readSeat(raw.seat, issues, `${field} seat`)
      if (seat === null) return []
      const kind = raw.action as DraftActionKind
      const amount =
        SIZED_ACTIONS.includes(kind) && raw.amount !== null && raw.amount !== undefined
          ? readAmount(raw.amount, issues, `${field} amount`)
          : null
      return [{ id: sanitizeString(raw.id, 64) || `imported-${street}-${position}`, seat, action: kind, amount }]
    })
    return [{ street, cards, suits: street === 'flop' ? readSuits(entry.suits, issues) : null, actions }]
  })
  if (actionCount > MAX_EVENTS) issues.push(`A hand cannot contain more than ${MAX_EVENTS} actions.`)

  const showdownRaw = Array.isArray(value.showdown) ? value.showdown : []
  const showdown: ShowdownMemory[] = showdownRaw.slice(0, MAX_SEATS).flatMap((entry, index) => {
    if (!isRecord(entry) || !SHOWDOWN_STATUSES.includes(entry.status as ShowdownStatus)) {
      issues.push(`Showdown entry ${index + 1} is malformed.`)
      return []
    }
    const seat = readSeat(entry.seat, issues, `Showdown entry ${index + 1} seat`)
    if (seat === null) return []
    const status = entry.status as ShowdownStatus
    return [{ seat, status, cards: status === 'shown' ? readHole(entry.cards, issues, `Seat ${seat}'s cards`) : null }]
  })

  const winners = value.winners === null || value.winners === undefined ? null : readSeatList(value.winners, issues, 'Winners')
  const pot = value.pot === null || value.pot === undefined ? null : readAmount(value.pot, issues, 'Pot')

  return {
    version: DRAFT_VERSION,
    participants,
    hero,
    streets,
    showdown,
    winners: winners && winners.length > 0 ? winners : null,
    pot,
  }
}
