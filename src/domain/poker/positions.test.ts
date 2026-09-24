import { describe, expect, it } from 'vitest'
import { blindSeats, derivePositions, positionsForTableSize, postflopSeatOrder, preflopSeatOrder } from './positions'

const seats = (n: number) => Array.from({ length: n }, (_, i) => i + 1)

describe('position labels', () => {
  it('names a full 9-handed table in action order', () => {
    expect(positionsForTableSize(9)).toEqual([
      'UTG', 'UTG+1', 'UTG+2', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB',
    ])
  })

  it('only uses positions that exist at shorter tables', () => {
    expect(positionsForTableSize(6)).toEqual(['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'])
    expect(positionsForTableSize(7)).toEqual(['UTG', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'])
    expect(positionsForTableSize(8)).toEqual(['UTG', 'UTG+1', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'])
    expect(positionsForTableSize(10)).toEqual([
      'UTG', 'UTG+1', 'UTG+2', 'UTG+3', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB',
    ])
  })

  it('never invents a position for a seat that is not dealt in', () => {
    const labels = positionsForTableSize(2)
    expect(labels).toEqual(['SB', 'BB'])
    expect(labels).not.toContain('UTG')
  })

  it('rotates labels with the button', () => {
    const withButtonOnNine = derivePositions(seats(9), 9)
    expect(withButtonOnNine.get(1)).toBe('SB')
    expect(withButtonOnNine.get(8)).toBe('CO')

    const withButtonOnFour = derivePositions(seats(9), 4)
    expect(withButtonOnFour.get(4)).toBe('BTN')
    expect(withButtonOnFour.get(5)).toBe('SB')
    expect(withButtonOnFour.get(6)).toBe('BB')
    expect(withButtonOnFour.get(7)).toBe('UTG')
    expect(withButtonOnFour.get(3)).toBe('CO')
  })

  it('handles a table with empty chairs', () => {
    const positions = derivePositions([2, 4, 6, 9], 9)
    expect(positions.get(9)).toBe('BTN')
    expect(positions.get(2)).toBe('SB')
    expect(positions.get(4)).toBe('BB')
    expect(positions.get(6)).toBe('UTG')
  })

  it('makes the button the small blind heads-up', () => {
    const positions = derivePositions([3, 7], 3)
    expect(positions.get(3)).toBe('SB')
    expect(positions.get(7)).toBe('BB')
    expect(blindSeats([3, 7], 3)).toEqual({ smallBlindSeat: 3, bigBlindSeat: 7 })
  })
})

describe('action order', () => {
  it('starts preflop under the gun and ends on the big blind', () => {
    expect(preflopSeatOrder(seats(9), 9)).toEqual([3, 4, 5, 6, 7, 8, 9, 1, 2])
  })

  it('starts postflop left of the button and ends on the button', () => {
    expect(postflopSeatOrder(seats(9), 9)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(postflopSeatOrder(seats(9), 4)).toEqual([5, 6, 7, 8, 9, 1, 2, 3, 4])
  })

  it('moves the preflop start behind a straddle', () => {
    expect(preflopSeatOrder(seats(9), 9, [3])).toEqual([4, 5, 6, 7, 8, 9, 1, 2, 3])
  })

  it('reverses heads-up order between preflop and postflop', () => {
    expect(preflopSeatOrder([1, 2], 1)).toEqual([1, 2])
    expect(postflopSeatOrder([1, 2], 1)).toEqual([2, 1])
  })
})
