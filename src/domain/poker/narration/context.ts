import type { HandSetup, PlayerProfile, PlayerTag, Session } from '../models'
import { PLAYER_TAGS } from '../models'
import { playerAliases, playerTags } from '../players'
import { derivePositions } from '../positions'
import { MAX_SEATS } from '../validation'
import { NARRATION_POSITIONS, type NarrationPosition } from './schema'

/**
 * The facts a narration parser may use, and nothing more.
 *
 * Built from the next hand's setup at the current table: the game, the
 * blinds, the seats dealt in, Hero's seat, the button as the table has it
 * now, and for each seat the label, aliases and quick tags the player added,
 * so "hoodie guy" and "the reg" can be recognised. Never notes, never other
 * sessions, never results or bankroll, never ids.
 *
 * The positions here are the table's CURRENT ones. A hand told afterwards may
 * have been dealt with the button elsewhere; the normaliser treats what the
 * narrator says about positions as the hand's own and only falls back to
 * these.
 */

export const NARRATION_CONTEXT_VERSION = 1

/** Longest narration accepted, in characters: a long hand is ~1,200. */
export const MAX_NARRATION_LENGTH = 4000

export interface NarrationSeat {
  seat: number
  hero: boolean
  /** The label the player gave this seat's player, if any. */
  label: string | null
  aliases: string[]
  tags: PlayerTag[]
  /** Stack in dollars, as the table has it. */
  stack: number
  /** Position at the table right now. */
  position: NarrationPosition | null
}

export interface NarrationContext {
  version: typeof NARRATION_CONTEXT_VERSION
  game: string
  /** Dollars. */
  smallBlind: number
  bigBlind: number
  tableSize: number
  heroSeat: number
  buttonSeat: number
  /** Only the seats dealt in. */
  seats: NarrationSeat[]
}

const toPosition = (value: string | undefined): NarrationPosition | null =>
  value && (NARRATION_POSITIONS as readonly string[]).includes(value) ? (value as NarrationPosition) : null

export function buildNarrationContext(
  session: Pick<Session, 'gameType'>,
  setup: HandSetup,
  players: readonly PlayerProfile[],
): NarrationContext {
  const dealt = setup.seats.map((seat) => seat.seat)
  const positions = derivePositions(dealt, setup.buttonSeat)
  const byId = new Map(players.map((player) => [player.id, player]))
  return {
    version: NARRATION_CONTEXT_VERSION,
    game: session.gameType,
    smallBlind: setup.smallBlind / 100,
    bigBlind: setup.bigBlind / 100,
    tableSize: setup.tableSize,
    heroSeat: setup.heroSeat,
    buttonSeat: setup.buttonSeat,
    seats: setup.seats.map((entry) => {
      const player = entry.playerId ? (byId.get(entry.playerId) ?? null) : null
      return {
        seat: entry.seat,
        hero: entry.seat === setup.heroSeat,
        label: entry.label?.trim() || null,
        aliases: playerAliases(player),
        tags: playerTags(player),
        stack: entry.startingStack / 100,
        position: toPosition(positions.get(entry.seat)),
      }
    }),
  }
}

/* ===================================================== reading a context */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const shortText = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max

/**
 * A context arriving at the server: checked as strictly as a parser
 * response, so nothing beyond the fields above can be smuggled to the model.
 */
export function readNarrationContext(value: unknown): NarrationContext | null {
  if (!isRecord(value)) return null
  const keys = ['version', 'game', 'smallBlind', 'bigBlind', 'tableSize', 'heroSeat', 'buttonSeat', 'seats']
  if (Object.keys(value).some((key) => !keys.includes(key))) return null
  if (value.version !== NARRATION_CONTEXT_VERSION || !shortText(value.game, 60)) return null
  const money = (amount: unknown) => typeof amount === 'number' && Number.isFinite(amount) && amount >= 0 && amount <= 1_000_000
  const seatNumber = (seat: unknown) => typeof seat === 'number' && Number.isInteger(seat) && seat >= 1 && seat <= MAX_SEATS
  if (!money(value.smallBlind) || !money(value.bigBlind) || !seatNumber(value.heroSeat) || !seatNumber(value.buttonSeat)) return null
  if (typeof value.tableSize !== 'number' || !Number.isInteger(value.tableSize) || value.tableSize < 2 || value.tableSize > MAX_SEATS) return null
  if (!Array.isArray(value.seats) || value.seats.length < 2 || value.seats.length > MAX_SEATS) return null
  const seats: NarrationSeat[] = []
  for (const entry of value.seats) {
    if (!isRecord(entry)) return null
    const seatKeys = ['seat', 'hero', 'label', 'aliases', 'tags', 'stack', 'position']
    if (Object.keys(entry).some((key) => !seatKeys.includes(key))) return null
    if (!seatNumber(entry.seat) || typeof entry.hero !== 'boolean' || !money(entry.stack)) return null
    if (entry.label !== null && !shortText(entry.label, 120)) return null
    if (!Array.isArray(entry.aliases) || entry.aliases.length > 8 || !entry.aliases.every((alias) => shortText(alias, 40))) return null
    if (!Array.isArray(entry.tags) || !entry.tags.every((tag) => (PLAYER_TAGS as readonly unknown[]).includes(tag))) return null
    if (entry.position !== null && toPosition(entry.position as string) === null) return null
    seats.push({
      seat: entry.seat as number,
      hero: entry.hero,
      label: entry.label as string | null,
      aliases: entry.aliases as string[],
      tags: entry.tags as PlayerTag[],
      stack: entry.stack as number,
      position: entry.position as NarrationPosition | null,
    })
  }
  if (new Set(seats.map((seat) => seat.seat)).size !== seats.length) return null
  if (!seats.some((seat) => seat.hero && seat.seat === value.heroSeat)) return null
  return {
    version: NARRATION_CONTEXT_VERSION,
    game: value.game,
    smallBlind: value.smallBlind as number,
    bigBlind: value.bigBlind as number,
    tableSize: value.tableSize,
    heroSeat: value.heroSeat as number,
    buttonSeat: value.buttonSeat as number,
    seats,
  }
}
