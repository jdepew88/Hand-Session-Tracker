/**
 * Position naming.
 *
 * Seats are the canonical identifier; a position is a *derived* label that
 * depends on the button and on how many players are actually dealt in. Nothing
 * in the engine keys off a position string -- they exist for display and for
 * the quick "I was in the CO" entry path.
 */

export type Position = string

export const TABLE_SIZES = [2, 6, 7, 8, 9, 10] as const
export type TableSize = number

/** Late-position labels, assigned from the button backwards. */
const LATE_LABELS = ['BTN', 'CO', 'HJ', 'LJ'] as const

/**
 * Labels for the non-blind seats of an `playerCount`-handed hand, ordered by
 * preflop action order (first to act ... button).
 *
 * The button always takes the last slot. `CO`, `HJ`, `LJ` fill backwards from
 * it, but never consume the first slot -- the earliest seat is always `UTG`
 * (unless there is only one non-blind seat, which is the button itself).
 * Anything left in between becomes UTG, UTG+1, UTG+2 ...
 */
function nonBlindLabels(count: number): Position[] {
  if (count <= 0) return []
  if (count === 1) return ['BTN']
  const labels = new Array<Position>(count)
  // Fill late labels from the end, leaving slot 0 for UTG.
  const lateCount = Math.min(LATE_LABELS.length, count - 1)
  for (let i = 0; i < lateCount; i += 1) labels[count - 1 - i] = LATE_LABELS[i]!
  // Remaining early slots.
  const earlySlots = count - lateCount
  for (let i = 0; i < earlySlots; i += 1) labels[i] = i === 0 ? 'UTG' : `UTG+${i}`
  return labels
}

/**
 * One full rotation of `seats`, starting immediately after `fromSeat` and
 * **ending at `fromSeat`**. That trailing element is deliberate: the seat a
 * rotation starts from is also the seat that acts last (the big blind preflop,
 * the button postflop). Callers that want it excluded filter it out.
 *
 * `seats` need not be contiguous -- empty chairs simply are not in the list.
 */
export function seatsClockwiseFrom(seats: readonly number[], fromSeat: number, inclusive = false): number[] {
  const ordered = [...seats].sort((a, b) => a - b)
  if (ordered.length === 0) return []
  const after = ordered.filter((s) => (inclusive ? s >= fromSeat : s > fromSeat))
  const before = ordered.filter((s) => (inclusive ? s < fromSeat : s <= fromSeat))
  return [...after, ...before]
}

/**
 * Map every dealt seat to its position label for this hand.
 *
 * Heads-up is the special case every poker app gets wrong: the button *is* the
 * small blind, posts first preflop and acts last postflop.
 */
export function derivePositions(occupiedSeats: readonly number[], buttonSeat: number): Map<number, Position> {
  const seats = [...occupiedSeats].sort((a, b) => a - b)
  const result = new Map<number, Position>()
  if (seats.length === 0) return result
  if (!seats.includes(buttonSeat)) return result

  if (seats.length === 1) {
    result.set(buttonSeat, 'BTN')
    return result
  }

  if (seats.length === 2) {
    const other = seats.find((s) => s !== buttonSeat)!
    result.set(buttonSeat, 'SB')
    result.set(other, 'BB')
    return result
  }

  // Rotation runs SB, BB, ... and ends on the button itself.
  const [sb, bb, ...nonBlindSeats] = seatsClockwiseFrom(seats, buttonSeat)
  if (sb !== undefined) result.set(sb, 'SB')
  if (bb !== undefined) result.set(bb, 'BB')

  const labels = nonBlindLabels(nonBlindSeats.length)
  nonBlindSeats.forEach((seat, index) => {
    const label = labels[index]
    if (label) result.set(seat, label)
  })
  return result
}

/** Every position label that exists at a table of this size, in action order. */
export function positionsForTableSize(tableSize: number): Position[] {
  const seats = Array.from({ length: tableSize }, (_, i) => i + 1)
  const map = derivePositions(seats, tableSize) // button on the last seat
  const order = preflopSeatOrder(seats, tableSize, [])
  return order.map((seat) => map.get(seat) ?? `Seat ${seat}`)
}

/**
 * Blind seats for a hand. Returns `undefined` entries when the table is too
 * small for that blind to exist.
 */
export function blindSeats(
  occupiedSeats: readonly number[],
  buttonSeat: number,
): { smallBlindSeat?: number; bigBlindSeat?: number } {
  const seats = [...occupiedSeats].sort((a, b) => a - b)
  if (seats.length < 2) return {}
  if (seats.length === 2) {
    const other = seats.find((s) => s !== buttonSeat)
    return { smallBlindSeat: buttonSeat, bigBlindSeat: other }
  }
  const after = seatsClockwiseFrom(seats, buttonSeat)
  return { smallBlindSeat: after[0], bigBlindSeat: after[1] }
}

/**
 * Preflop action order: first to act is the seat after the big blind, or after
 * the last straddle when one is posted.
 */
export function preflopSeatOrder(
  occupiedSeats: readonly number[],
  buttonSeat: number,
  straddleSeats: readonly number[] = [],
): number[] {
  const seats = [...occupiedSeats].sort((a, b) => a - b)
  if (seats.length === 0) return []
  if (seats.length === 1) return [...seats]
  const { bigBlindSeat } = blindSeats(seats, buttonSeat)
  const lastForced = straddleSeats.length > 0 ? straddleSeats[straddleSeats.length - 1]! : bigBlindSeat
  if (lastForced === undefined) return seats
  return seatsClockwiseFrom(seats, lastForced)
}

/**
 * Postflop action order: first live seat clockwise from the button, i.e. the
 * small blind at a full table and the big blind heads-up.
 */
export function postflopSeatOrder(occupiedSeats: readonly number[], buttonSeat: number): number[] {
  const seats = [...occupiedSeats].sort((a, b) => a - b)
  if (seats.length === 0) return []
  return seatsClockwiseFrom(seats, buttonSeat)
}
