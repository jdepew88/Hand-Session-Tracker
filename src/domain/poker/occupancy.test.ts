import { describe, expect, it } from 'vitest'
import { createHandSetup, createPlayer, createSession } from './factories'
import type { Session } from './models'
import {
  cannotMarkEmpty,
  newHandSeating,
  occupiedSeats,
  seatHero,
  seatStatus,
  setSeatStatus,
  withSeatOccupancy,
} from './occupancy'
import { replay } from './reducer'
import { describeTable, resizeTable, seatLabel, tableSummary } from './tableView'

function session(overrides: Partial<Session> = {}): Session {
  return {
    ...createSession({
      location: 'Commerce Casino',
      gameType: "No-Limit Hold'em",
      smallBlind: 200,
      bigBlind: 500,
      tableSize: 9,
      buyIn: 50_000,
      startingStack: 50_000,
    }),
    ...overrides,
  }
}

/** Empty the given seats, one at a time, through the public operation. */
function withEmpty(base: Session, ...seats: number[]): Session {
  return seats.reduce((current, seat) => setSeatStatus(current, seat, 'empty').session, base)
}

/** A session as stored before occupancy existed. */
function legacy(overrides: Partial<Session> = {}) {
  const { seatStatus: _dropped, ...rest } = session(overrides)
  void _dropped
  return rest
}

describe('seat occupancy', () => {
  it('starts every chair of a new session explicitly occupied', () => {
    expect(session().seatStatus).toEqual({
      1: 'occupied', 2: 'occupied', 3: 'occupied', 4: 'occupied', 5: 'occupied',
      6: 'occupied', 7: 'occupied', 8: 'occupied', 9: 'occupied',
    })
  })

  it('stores an empty seat explicitly and leaves the others alone', () => {
    const next = withEmpty(session(), 4)
    expect(next.seatStatus[4]).toBe('empty')
    expect(seatStatus(next, 3)).toBe('occupied')
    expect(occupiedSeats(next)).toEqual([1, 2, 3, 5, 6, 7, 8, 9])
  })

  it('treats a legacy session as every chair occupied and makes that explicit', () => {
    const old = legacy({ heroSeat: 3, buttonSeat: 9 })
    expect('seatStatus' in old).toBe(false)
    expect(occupiedSeats(old)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    const migrated = withSeatOccupancy(old)
    expect(Object.values(migrated.seatStatus)).toEqual(Array(9).fill('occupied'))
    expect(migrated).toMatchObject({ heroSeat: 3, buttonSeat: 9, tableSize: 9 })
  })

  it('marks a seat empty and seats a player there again', () => {
    const emptied = withEmpty(session(), 4)
    const reseated = setSeatStatus(emptied, 4, 'occupied').session
    expect(seatStatus(reseated, 4)).toBe('occupied')
    expect(occupiedSeats(reseated)).toHaveLength(9)
  })

  it("clears hero when hero's seat is marked empty, and only then", () => {
    const { session: next, cleared } = setSeatStatus(session({ heroSeat: 4 }), 4, 'empty')
    expect(next.heroSeat).toBeNull()
    expect(cleared).toEqual(['hero'])

    const other = setSeatStatus(session({ heroSeat: 3 }), 4, 'empty')
    expect(other.session.heroSeat).toBe(3)
    expect(other.cleared).toEqual([])
  })

  it('sits hero in an empty seat by occupying it', () => {
    const next = seatHero(withEmpty(session(), 5), 5)
    expect(next.heroSeat).toBe(5)
    expect(seatStatus(next, 5)).toBe('occupied')
  })

  it('never leaves fewer than two occupied seats', () => {
    const twoLeft = withEmpty(session(), 1, 2, 3, 4, 5, 6, 7)
    expect(occupiedSeats(twoLeft)).toEqual([8, 9])
    expect(cannotMarkEmpty(twoLeft, 8)).toMatch(/at least 2 players/)
    expect(() => setSeatStatus(twoLeft, 8, 'empty')).toThrow()
    expect(cannotMarkEmpty(twoLeft, 1)).toBeNull()
  })

  it('refuses seats that are not at the table', () => {
    expect(() => setSeatStatus(session(), 0, 'empty')).toThrow()
    expect(() => setSeatStatus(session(), 10, 'empty')).toThrow()
  })

  it('clears a stored hero on an empty seat when loading', () => {
    const inconsistent = { ...session({ heroSeat: 4 }), seatStatus: { 4: 'empty' as const } }
    expect(withSeatOccupancy(inconsistent).heroSeat).toBeNull()
  })
})

describe('the table with empty seats', () => {
  it('keeps physical seat numbers and gives empty seats no position', () => {
    const views = describeTable(withEmpty(session({ buttonSeat: 3 }), 4, 5), [])
    expect(views.map((view) => view.seat)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(views.map((view) => view.position)).toEqual([
      'HJ', 'CO', 'BTN', null, null, 'SB', 'BB', 'UTG', 'LJ',
    ])
    expect(views[3]).toMatchObject({ status: 'empty', isEmpty: true })
    expect(seatLabel(views[3]!)).toBe('Seat 4, empty')
  })

  it('keeps the button on an emptied seat as a dead button, without positions', () => {
    const next = setSeatStatus(session({ buttonSeat: 4 }), 4, 'empty').session
    expect(next.buttonSeat).toBe(4)
    const views = describeTable(next, [])
    expect(views.filter((view) => view.isButton).map((view) => view.seat)).toEqual([4])
    expect(views.every((view) => view.position === null)).toBe(true)
    expect(seatLabel(views[3]!)).toBe('Seat 4, empty, dead button')
    expect(tableSummary(views)).toBe(
      '9-seat table, 8 seats occupied. Your seat is not set. The dealer button is on seat 4, which is empty.',
    )
  })

  it('preserves occupancy of seats removed by shrinking the table', () => {
    const emptied = withEmpty(session(), 2, 8)
    const six = resizeTable(emptied, 6).session
    expect(occupiedSeats(six)).toEqual([1, 3, 4, 5, 6])
    expect(six.seatStatus[8]).toBe('empty')

    const nine = resizeTable(six, 9).session
    expect(occupiedSeats(nine)).toEqual([1, 3, 4, 5, 6, 7, 9])

    // A chair that was never at the table starts occupied.
    const ten = resizeTable(nine, 10).session
    expect(seatStatus(ten, 10)).toBe('occupied')
    expect(ten.seatStatus[10]).toBe('occupied')
  })
})

describe('new hand seating', () => {
  it('deals only occupied seats, keeping physical seat numbers', () => {
    const s = withEmpty(session({ heroSeat: 3, buttonSeat: 6 }), 2, 7)
    const seating = newHandSeating(s)
    expect(seating.seats.map((seat) => seat.seat)).toEqual([1, 3, 4, 5, 6, 8, 9])
    expect(seating).toMatchObject({ heroSeat: 3, buttonSeat: 6 })
  })

  it('keeps lineup details for the seats it deals', () => {
    const s = withEmpty(session({ heroSeat: 1, buttonSeat: 9 }), 2)
    const players = [
      { ...createPlayer(s.id, 2), nickname: 'Gone', currentStack: 10_000 },
      { ...createPlayer(s.id, 3), nickname: 'Reg', currentStack: 31_000 },
    ]
    const seats = newHandSeating(s, players).seats
    expect(seats.find((seat) => seat.seat === 2)).toBeUndefined()
    expect(seats.find((seat) => seat.seat === 3)).toMatchObject({ label: 'Reg', startingStack: 31_000 })
  })

  it('matches the old defaults for a fully occupied or legacy session', () => {
    for (const s of [session(), legacy()]) {
      const seating = newHandSeating(s)
      expect(seating.seats.map((seat) => seat.seat)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
      expect(seating).toMatchObject({ heroSeat: 1, buttonSeat: 9 })
    }
  })

  it('puts default hero and button on occupied seats', () => {
    const seating = newHandSeating(withEmpty(session(), 1, 9))
    expect(seating).toMatchObject({ heroSeat: 2, buttonSeat: 8 })
  })

  it('offers the nearest occupied seat before a dead button, so the blinds follow it', () => {
    const s = setSeatStatus(session({ buttonSeat: 4 }), 4, 'empty').session
    const seating = newHandSeating(s)
    expect(seating.buttonSeat).toBe(3)
    // Wraps round the table when the dead button is on seat 1.
    const wrap = setSeatStatus(session({ buttonSeat: 1 }), 1, 'empty').session
    expect(newHandSeating(wrap).buttonSeat).toBe(9)
  })

  it('produces a hand the engine replays with empty seats skipped', () => {
    const s = withEmpty(session({ heroSeat: 3, buttonSeat: 3 }), 4, 5)
    const setup = createHandSetup({ session: s, ...newHandSeating(s) })
    const state = replay(setup, [])
    expect(state.seatOrder).toEqual([1, 2, 3, 6, 7, 8, 9])
    expect(state.seats.has(4)).toBe(false)
    expect(state.forcedBets.map((bet) => [bet.kind, bet.seat])).toEqual([
      ['sb', 6],
      ['bb', 7],
    ])
    expect(state.actingSeat).toBe(8)
  })
})
