import { formatCents, type Cents } from '../money'
import type { PlayerProfile, SeatOccupancy, SeatStatus, Session } from './models'
import { occupiedSeats, seatStatus, withSeatOccupancy } from './occupancy'
import { TABLE_SIZES, derivePositions, type Position } from './positions'

/**
 * The live table, as the session describes it between hands.
 *
 * Everything here is derived from the session (table size, seat occupancy,
 * hero seat, button seat) and its lineup. Positions come from
 * `derivePositions` over the occupied chairs -- the seats the recorder deals
 * into a new hand -- so the table screen can never show a position the
 * recorder would disagree with. Empty chairs keep their seat number and get no
 * position.
 */

export interface TableSeatView {
  seat: number
  status: SeatStatus
  isEmpty: boolean
  /**
   * Null until the button has been placed, on empty seats, and everywhere
   * while the button is on an empty seat (a dead button, which the engine
   * cannot derive positions for).
   */
  position: Position | null
  isHero: boolean
  isButton: boolean
  player: PlayerProfile | null
  nickname: string
  /** The stack a new hand would deal this seat, resolved like `defaultSeats`. */
  stack: Cents
  /** True when the stack is only the session's default buy-in. */
  stackIsDefault: boolean
  /** A name or a seat-specific stack has been recorded. */
  hasDetails: boolean
}

export function seatNumbers(tableSize: number): number[] {
  return Array.from({ length: tableSize }, (_, index) => index + 1)
}

export function isSupportedTableSize(size: number): boolean {
  return (TABLE_SIZES as readonly number[]).includes(size)
}

export function describeTable(
  session: Pick<Session, 'id' | 'tableSize' | 'heroSeat' | 'buttonSeat' | 'startingStack'> & {
    seatStatus?: SeatOccupancy
  },
  players: readonly PlayerProfile[],
): TableSeatView[] {
  const seats = seatNumbers(session.tableSize)
  const buttonSeat =
    session.buttonSeat !== null && seats.includes(session.buttonSeat) ? session.buttonSeat : null
  // derivePositions returns nothing when the button is not on a dealt seat.
  const positions =
    buttonSeat === null ? new Map<number, Position>() : derivePositions(occupiedSeats(session), buttonSeat)
  const lineup = players.filter((player) => player.sessionId === session.id)

  return seats.map((seat) => {
    const player = lineup.find((candidate) => candidate.seat === seat) ?? null
    const nickname = player?.nickname.trim() ?? ''
    const ownStack =
      player?.currentStack ??
      (player?.startingStack !== null && player?.startingStack !== undefined && player.startingStack !== session.startingStack
        ? player.startingStack
        : null)
    const stack = player?.currentStack ?? player?.startingStack ?? session.startingStack

    const status = seatStatus(session, seat)
    return {
      seat,
      status,
      isEmpty: status === 'empty',
      position: positions.get(seat) ?? null,
      isHero: session.heroSeat === seat && status !== 'empty',
      isButton: buttonSeat === seat,
      player,
      nickname,
      stack,
      stackIsDefault: ownStack === null,
      hasDetails: nickname !== '' || ownStack !== null,
    }
  })
}

/**
 * Change the number of chairs. Hero and button seats that no longer exist are
 * cleared rather than moved: guessing where someone now sits would be worse
 * than asking. Lineup entries and seat occupancy for removed chairs are left
 * in storage, so going back to the larger size brings them back; chairs that
 * were never at the table start occupied.
 */
export function resizeTable<
  T extends Pick<Session, 'tableSize' | 'heroSeat' | 'buttonSeat'> & { seatStatus?: SeatOccupancy },
>(session: T, tableSize: number): { session: T & { seatStatus: SeatOccupancy }; cleared: ('hero' | 'button')[] } {
  if (!isSupportedTableSize(tableSize)) throw new Error(`Unsupported table size: ${tableSize}`)
  const cleared: ('hero' | 'button')[] = []
  const fits = (seat: number | null) => seat === null || seat <= tableSize
  if (!fits(session.heroSeat)) cleared.push('hero')
  if (!fits(session.buttonSeat)) cleared.push('button')
  return {
    session: withSeatOccupancy({
      ...session,
      tableSize,
      heroSeat: fits(session.heroSeat) ? session.heroSeat : null,
      buttonSeat: fits(session.buttonSeat) ? session.buttonSeat : null,
    }),
    cleared,
  }
}

const POSITION_NAMES: Record<string, string> = {
  BTN: 'Button',
  SB: 'Small blind',
  BB: 'Big blind',
  UTG: 'Under the gun',
  LJ: 'Lojack',
  HJ: 'Hijack',
  CO: 'Cutoff',
}

/** Spelled-out position, for screen readers and anywhere an abbreviation is unclear. */
export function positionName(position: Position): string {
  const named = POSITION_NAMES[position]
  if (named) return named
  const early = /^UTG\+(\d+)$/.exec(position)
  return early ? `Under the gun plus ${early[1]}` : position
}

/** "Seat 8, Button, you, Grey Hoodie, stack $740"; "Seat 4, empty" */
export function seatLabel(view: TableSeatView): string {
  const parts = [`Seat ${view.seat}`]
  if (view.isEmpty) {
    parts.push('empty')
    if (view.isButton) parts.push('dead button')
    return parts.join(', ')
  }
  if (view.position) parts.push(positionName(view.position))
  if (view.isHero) parts.push('you')
  if (view.isButton && view.position !== 'BTN') parts.push('dealer button')
  if (view.nickname) parts.push(view.nickname)
  parts.push(view.hasDetails ? `stack ${formatCents(view.stack)}` : 'no player details')
  return parts.join(', ')
}

/** One-paragraph description of the whole table for assistive technology. */
export function tableSummary(views: readonly TableSeatView[]): string {
  const hero = views.find((view) => view.isHero)
  const button = views.find((view) => view.isButton)
  const occupied = views.filter((view) => !view.isEmpty).length
  const sentences = [
    occupied === views.length
      ? `${views.length}-seat table.`
      : `${views.length}-seat table, ${occupied} seats occupied.`,
  ]
  sentences.push(
    hero
      ? `You are in seat ${hero.seat}${hero.position ? `, ${positionName(hero.position).toLowerCase()}` : ''}.`
      : 'Your seat is not set.',
  )
  sentences.push(
    !button
      ? 'The dealer button is not placed.'
      : button.isEmpty
        ? `The dealer button is on seat ${button.seat}, which is empty.`
        : `The dealer button is on seat ${button.seat}.`,
  )
  return sentences.join(' ')
}
