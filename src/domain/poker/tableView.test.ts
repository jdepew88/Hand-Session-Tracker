import { describe, expect, it } from 'vitest'
import { createPlayer, createSession } from './factories'
import { TABLE_SIZES } from './positions'
import { describeTable, positionName, resizeTable, seatLabel, tableSummary } from './tableView'

function session(overrides: Partial<ReturnType<typeof createSession>> = {}) {
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

describe('describeTable', () => {
  it('shows one seat per chair, numbered from 1', () => {
    for (const size of TABLE_SIZES) {
      const views = describeTable(session({ tableSize: size }), [])
      expect(views.map((view) => view.seat)).toEqual(Array.from({ length: size }, (_, i) => i + 1))
    }
  })

  it('leaves positions unset until the button is placed', () => {
    const views = describeTable(session({ buttonSeat: null }), [])
    expect(views.every((view) => view.position === null)).toBe(true)
    expect(views.some((view) => view.isButton)).toBe(false)
  })

  it('assigns BTN, SB and BB from the button and rotates when it moves', () => {
    const onNine = describeTable(session({ buttonSeat: 9 }), [])
    expect(onNine[8]!.position).toBe('BTN')
    expect(onNine[0]!.position).toBe('SB')
    expect(onNine[1]!.position).toBe('BB')
    expect(onNine[2]!.position).toBe('UTG')

    const onFour = describeTable(session({ buttonSeat: 4 }), [])
    // Seats 1-9 with the button on seat 4.
    expect(onFour.map((view) => view.position)).toEqual([
      'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'UTG+2',
    ])
  })

  it('has exactly one button and at most one hero', () => {
    const views = describeTable(session({ buttonSeat: 3, heroSeat: 7 }), [])
    expect(views.filter((view) => view.isButton).map((view) => view.seat)).toEqual([3])
    expect(views.filter((view) => view.isHero).map((view) => view.seat)).toEqual([7])
  })

  it('treats the heads-up button as the small blind', () => {
    const views = describeTable(session({ tableSize: 2, buttonSeat: 2 }), [])
    expect(views.map((view) => view.position)).toEqual(['BB', 'SB'])
  })

  it('ignores a stored button or hero seat that no longer exists', () => {
    const views = describeTable(session({ tableSize: 6, buttonSeat: 9, heroSeat: 8 }), [])
    expect(views.some((view) => view.isButton || view.isHero || view.position)).toBe(false)
  })

  it('separates seats with player details from seats without', () => {
    const s = session()
    const named = { ...createPlayer(s.id, 2), nickname: '  Grey Hoodie ' }
    const stacked = { ...createPlayer(s.id, 3), currentStack: 124_000 }
    // A seat saved from the lineup form with nothing but the session default.
    const blank = { ...createPlayer(s.id, 4), startingStack: s.startingStack }
    const otherSession = { ...createPlayer('another-session', 5), nickname: 'Elsewhere' }
    const views = describeTable(s, [named, stacked, blank, otherSession])

    expect(views[1]).toMatchObject({ nickname: 'Grey Hoodie', hasDetails: true, stackIsDefault: true, stack: 50_000 })
    expect(views[2]).toMatchObject({ nickname: '', hasDetails: true, stackIsDefault: false, stack: 124_000 })
    expect(views[3]).toMatchObject({ hasDetails: false, stack: 50_000 })
    expect(views[4]).toMatchObject({ hasDetails: false, player: null })
  })
})

describe('resizeTable', () => {
  it('keeps hero and button seats that still exist', () => {
    const { session: next, cleared } = resizeTable(session({ heroSeat: 3, buttonSeat: 6 }), 6)
    expect(next).toMatchObject({ tableSize: 6, heroSeat: 3, buttonSeat: 6 })
    expect(cleared).toEqual([])
  })

  it('clears hero and button seats that were removed', () => {
    const { session: next, cleared } = resizeTable(session({ heroSeat: 8, buttonSeat: 9 }), 6)
    expect(next).toMatchObject({ tableSize: 6, heroSeat: null, buttonSeat: null })
    expect(cleared).toEqual(['hero', 'button'])
  })

  it('refuses a table size the app does not support', () => {
    expect(() => resizeTable(session(), 5)).toThrow()
    expect(() => resizeTable(session(), 11)).toThrow()
  })
})

describe('labels', () => {
  it('spells out positions', () => {
    expect(positionName('BTN')).toBe('Button')
    expect(positionName('UTG+2')).toBe('Under the gun plus 2')
    expect(positionName('CO')).toBe('Cutoff')
  })

  it('describes a seat in one line', () => {
    const s = session({ buttonSeat: 8, heroSeat: 8 })
    const hero = { ...createPlayer(s.id, 8), currentStack: 74_000 }
    const [view] = describeTable(s, [hero]).filter((entry) => entry.seat === 8)
    expect(seatLabel(view!)).toBe('Seat 8, Button, you, stack $740')
  })

  it('summarises the table', () => {
    expect(tableSummary(describeTable(session({ buttonSeat: 9, heroSeat: 3 }), []))).toBe(
      '9-seat table. You are in seat 3, under the gun. The dealer button is on seat 9.',
    )
    expect(tableSummary(describeTable(session(), []))).toBe(
      '9-seat table. Your seat is not set. The dealer button is not placed.',
    )
  })
})
