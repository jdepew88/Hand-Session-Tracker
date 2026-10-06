import { defaultSeats } from './factories'
import type { HandSeatSetup, PlayerProfile, SeatOccupancy, SeatStatus, Session } from './models'
import { seatsClockwiseFrom } from './positions'

/**
 * Seat occupancy between hands.
 *
 * Table size is the number of physical chairs; occupancy says which of them
 * have a player in. Seat numbers never change with occupancy: an empty seat 4
 * is still seat 4, and positions are derived over the occupied seats only, the
 * same way the engine derives them over the seats dealt into a hand.
 */

type OccupancyFields = Pick<Session, 'tableSize' | 'heroSeat' | 'buttonSeat'> & {
  /** Absent on sessions saved before occupancy was stored. */
  seatStatus?: SeatOccupancy
}

/** A seat with no stored status is occupied, which is what older sessions meant. */
export function seatStatus(session: Pick<OccupancyFields, 'seatStatus'>, seat: number): SeatStatus {
  return session.seatStatus?.[seat] ?? 'occupied'
}

export function isSeatOccupied(session: Pick<OccupancyFields, 'seatStatus'>, seat: number): boolean {
  return seatStatus(session, seat) !== 'empty'
}

/** Occupied chairs at the current table size, in seat order. */
export function occupiedSeats(session: Pick<OccupancyFields, 'tableSize' | 'seatStatus'>): number[] {
  return Array.from({ length: session.tableSize }, (_, index) => index + 1).filter((seat) =>
    isSeatOccupied(session, seat),
  )
}

/**
 * Give a stored session an explicit status for every chair.
 *
 * Sessions saved before occupancy existed have no `seatStatus`; every chair was
 * dealt into new hands, so every chair comes back occupied. Entries for seats
 * beyond the table are kept. A hero recorded on an empty seat (which the app
 * never writes) is cleared, since hero must be sitting somewhere.
 */
export function withSeatOccupancy<T extends OccupancyFields>(session: T): T & { seatStatus: SeatOccupancy } {
  const seatStatusMap: SeatOccupancy = { ...session.seatStatus }
  for (let seat = 1; seat <= session.tableSize; seat += 1) seatStatusMap[seat] = seatStatus(session, seat)
  const heroSeat = session.heroSeat !== null && !isSeatOccupied(session, session.heroSeat) ? null : session.heroSeat
  return { ...session, heroSeat, seatStatus: seatStatusMap }
}

/** The fewest occupied seats a table can be left with: a hand needs two players. */
export const MIN_OCCUPIED_SEATS = 2

/** Why a seat cannot be marked empty, or null when it can. */
export function cannotMarkEmpty(session: Pick<OccupancyFields, 'tableSize' | 'seatStatus'>, seat: number): string | null {
  if (!isSeatOccupied(session, seat)) return null
  return occupiedSeats(session).length <= MIN_OCCUPIED_SEATS
    ? `A hand needs at least ${MIN_OCCUPIED_SEATS} players, so ${MIN_OCCUPIED_SEATS} seats stay occupied.`
    : null
}

/**
 * Mark one chair occupied or empty.
 *
 * Emptying hero's seat clears the hero seat. The button is left where it is:
 * it marks a physical chair, and a button on an empty chair is a dead button.
 * Lineup entries are not touched, so a name noted for the seat is still there
 * if someone sits back down.
 */
export function setSeatStatus<T extends OccupancyFields>(
  session: T,
  seat: number,
  status: SeatStatus,
): { session: T & { seatStatus: SeatOccupancy }; cleared: 'hero'[] } {
  if (!Number.isInteger(seat) || seat < 1 || seat > session.tableSize) {
    throw new Error(`Seat ${seat} is not at this ${session.tableSize}-seat table.`)
  }
  const current = withSeatOccupancy(session)
  if (status === 'empty') {
    const reason = cannotMarkEmpty(current, seat)
    if (reason) throw new Error(reason)
  }
  const clearsHero = status === 'empty' && current.heroSeat === seat
  return {
    session: {
      ...current,
      heroSeat: clearsHero ? null : current.heroSeat,
      seatStatus: { ...current.seatStatus, [seat]: status },
    },
    cleared: clearsHero ? ['hero'] : [],
  }
}

/** Sit hero in a chair. An empty chair becomes occupied: hero is sitting in it. */
export function seatHero<T extends OccupancyFields>(session: T, seat: number): T & { seatStatus: SeatOccupancy } {
  const { session: occupied } = setSeatStatus(session, seat, 'occupied')
  return { ...occupied, heroSeat: seat }
}

/**
 * Seats, button and hero for a newly initialised hand.
 *
 * Only occupied chairs are dealt in. The recorder still shows all of this for
 * confirmation before the hand starts, so these are defaults, but they must be
 * valid: the engine requires the button and hero to be dealt in.
 *
 * - Hero: the session's hero seat, else the first occupied seat.
 * - Button: the session's button seat when someone sits there. With no button
 *   it is the last occupied seat (the old default was the last chair). With a
 *   dead button it is the nearest occupied seat before it, which puts the
 *   blinds on the players after the dead button; the engine has no dead-button
 *   model, so the recorder offers this for the user to confirm.
 * - Fewer than two occupied seats (only possible by shrinking the table) deals
 *   every chair in, as before occupancy existed.
 */
export function newHandSeating(
  session: Pick<Session, 'tableSize' | 'heroSeat' | 'buttonSeat' | 'startingStack'> & { seatStatus?: SeatOccupancy },
  players: readonly PlayerProfile[] = [],
): { seats: HandSeatSetup[]; buttonSeat: number; heroSeat: number } {
  const occupied = occupiedSeats(session)
  const dealt = occupied.length >= MIN_OCCUPIED_SEATS ? occupied : Array.from({ length: session.tableSize }, (_, i) => i + 1)
  const seats = defaultSeats(session.tableSize, session.startingStack, players).filter((entry) =>
    dealt.includes(entry.seat),
  )

  const heroSeat = session.heroSeat !== null && dealt.includes(session.heroSeat) ? session.heroSeat : dealt[0]!

  let buttonSeat: number
  if (session.buttonSeat !== null && dealt.includes(session.buttonSeat)) buttonSeat = session.buttonSeat
  else if (session.buttonSeat !== null && session.buttonSeat <= session.tableSize) {
    // Clockwise from the dead button, ending on it; the last dealt seat in that
    // rotation is the nearest one before it.
    const rotation = seatsClockwiseFrom([...dealt, session.buttonSeat], session.buttonSeat)
    buttonSeat = rotation.filter((seat) => dealt.includes(seat)).at(-1)!
  } else buttonSeat = dealt.at(-1)!

  return { seats, buttonSeat, heroSeat }
}
