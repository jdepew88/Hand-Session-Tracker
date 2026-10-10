import type { Cents } from '../money'
import { PLAYER_TAGS, type PlayerArchetype, type PlayerProfile, type PlayerTag, type SeatOccupancy, type Session } from './models'
import { isSeatOccupied, setSeatStatus } from './occupancy'

/**
 * People at the table, as distinct from the chairs they sit in.
 *
 * A profile belongs to one person for one session. It sits in a seat while
 * they are there; when the seat is emptied the person leaves (`seat: null`)
 * and keeps their label, tags and notes in the session's history, so the next
 * person in that chair starts clean. Moving a player carries everything with
 * them. None of this touches saved hands, which keep their own snapshot.
 */

export const MAX_ALIASES = 8
export const MAX_ALIAS_LENGTH = 40
export const MAX_PLAYER_LABEL = 120
export const MAX_PLAYER_NOTES = 4000

/** How the old single "style" maps onto tags, for profiles saved before tags. */
const LEGACY_TAGS: Partial<Record<PlayerArchetype, PlayerTag[]>> = {
  'Tight Passive': ['Tight', 'Passive'],
  'Tight Aggressive': ['Tight', 'Aggressive'],
  'Loose Passive': ['Loose', 'Passive'],
  'Loose Aggressive': ['Loose', 'Aggressive'],
  'Calling Station': ['Loose', 'Passive'],
  Nit: ['Tight'],
  Maniac: ['Loose', 'Aggressive'],
  Regular: ['Reg'],
  Recreational: ['Rec'],
}

const isTag = (value: unknown): value is PlayerTag => (PLAYER_TAGS as readonly unknown[]).includes(value)

/** The player's tags, in the fixed order. Older profiles read theirs from the style they had. */
export function playerTags(player: Pick<PlayerProfile, 'tags' | 'archetype'> | null | undefined): PlayerTag[] {
  if (!player) return []
  const tags = Array.isArray(player.tags) ? player.tags.filter(isTag) : (LEGACY_TAGS[player.archetype] ?? [])
  return PLAYER_TAGS.filter((tag) => tags.includes(tag))
}

/**
 * A style from before tags that has no tag equivalent ("Old Man Coffee", a
 * custom style), so it can still be shown rather than silently dropped.
 */
export function legacyStyle(player: Pick<PlayerProfile, 'tags' | 'archetype' | 'customArchetype'>): string | null {
  if (Array.isArray(player.tags)) return null
  if (player.archetype === 'Unknown' || LEGACY_TAGS[player.archetype]) return null
  if (player.archetype === 'Custom') return player.customArchetype.trim() || null
  return player.archetype
}

export const playerAliases = (player: Pick<PlayerProfile, 'aliases'> | null | undefined): string[] =>
  Array.isArray(player?.aliases) ? player.aliases : []

/** "hoodie, sunglasses guy" -> ["hoodie", "sunglasses guy"]: trimmed, de-duplicated, capped. */
export function parseAliases(text: string): string[] {
  const seen = new Set<string>()
  const aliases: string[] = []
  for (const part of text.split(/[,\n;]/)) {
    const alias = part.replace(/\s+/g, ' ').trim().slice(0, MAX_ALIAS_LENGTH)
    const key = alias.toLowerCase()
    if (alias === '' || seen.has(key)) continue
    seen.add(key)
    aliases.push(alias)
    if (aliases.length === MAX_ALIASES) break
  }
  return aliases
}

/** Anything noted about the person, beyond their seat and stack. */
export function hasIdentity(player: PlayerProfile): boolean {
  return (
    player.nickname.trim() !== '' ||
    playerTags(player).length > 0 ||
    player.notes.trim() !== '' ||
    playerAliases(player).length > 0
  )
}

/** The player sitting in this chair now. Nobody sits in an empty chair. */
export function seatedPlayer(
  players: readonly PlayerProfile[],
  session: Pick<Session, 'id' | 'tableSize'> & { seatStatus?: SeatOccupancy },
  seat: number,
): PlayerProfile | null {
  if (seat < 1 || seat > session.tableSize || !isSeatOccupied(session, seat)) return null
  return players.find((player) => player.sessionId === session.id && player.seat === seat) ?? null
}

/**
 * People who were at this table earlier in the session and are not sitting
 * now, with something noted about them. Includes profiles from before players
 * could leave, still pointing at a chair that has since been emptied.
 */
export function playersWhoLeft(
  players: readonly PlayerProfile[],
  session: Pick<Session, 'id' | 'tableSize'> & { seatStatus?: SeatOccupancy },
): PlayerProfile[] {
  return players
    .filter((player) => player.sessionId === session.id)
    .filter((player) => player.seat === null || seatedPlayer(players, session, player.seat)?.id !== player.id)
    .filter(hasIdentity)
    .sort((a, b) => (b.leftAt ?? b.updatedAt).localeCompare(a.leftAt ?? a.updatedAt))
}

export interface PlayerDetails {
  nickname: string
  tags: readonly PlayerTag[]
  notes: string
  aliases: readonly string[]
  /** A stack to record now, or undefined to leave it as it is. */
  stack?: Cents
}

/** Apply edits from the seat panel. The notes timestamp moves only when the notes change. */
export function withPlayerDetails(player: PlayerProfile, details: PlayerDetails, now: string): PlayerProfile {
  const notes = details.notes.slice(0, MAX_PLAYER_NOTES)
  return {
    ...player,
    nickname: details.nickname.replace(/\s+/g, ' ').trim().slice(0, MAX_PLAYER_LABEL),
    tags: PLAYER_TAGS.filter((tag) => details.tags.includes(tag)),
    notes,
    aliases: parseAliases(details.aliases.join(',')),
    notesUpdatedAt: notes.trim() !== player.notes.trim() ? (notes.trim() === '' ? null : now) : (player.notesUpdatedAt ?? null),
    currentStack: details.stack !== undefined ? details.stack : player.currentStack,
  }
}

/** The person gets up and leaves. Their profile stays with the session. */
export const leaveTable = (player: PlayerProfile, now: string): PlayerProfile => ({ ...player, seat: null, leftAt: now })

/** Someone (back) in a chair. */
export const takeSeat = (player: PlayerProfile, seat: number): PlayerProfile => ({ ...player, seat, leftAt: null })

export class SeatingError extends Error {}

/**
 * Move a seated player to an empty chair. Their profile -- label, tags,
 * notes, stack -- goes with them; the chair they leave is empty, and Hero's
 * seat follows Hero. The dealer button stays where it is: it marks a chair.
 */
export function movePlayer<T extends Session>(
  session: T,
  players: readonly PlayerProfile[],
  fromSeat: number,
  toSeat: number,
): { session: T & { seatStatus: SeatOccupancy }; moved: PlayerProfile | null } {
  if (toSeat < 1 || toSeat > session.tableSize) throw new SeatingError(`Seat ${toSeat} is not at this table.`)
  if (isSeatOccupied(session, toSeat)) throw new SeatingError(`Seat ${toSeat} is taken.`)
  if (!isSeatOccupied(session, fromSeat)) throw new SeatingError(`Nobody is sitting in seat ${fromSeat}.`)
  const player = seatedPlayer(players, session, fromSeat)
  const occupied = setSeatStatus(session, toSeat, 'occupied').session
  const vacated = setSeatStatus({ ...occupied, heroSeat: null }, fromSeat, 'empty').session
  return {
    session: { ...vacated, heroSeat: session.heroSeat === fromSeat ? toSeat : session.heroSeat },
    moved: player ? takeSeat(player, toSeat) : null,
  }
}

/** Seats the given profiles say they are in that a new player in `seat` must not inherit. */
export function staleOccupants(players: readonly PlayerProfile[], sessionId: string, seat: number): PlayerProfile[] {
  return players.filter((player) => player.sessionId === sessionId && player.seat === seat)
}
