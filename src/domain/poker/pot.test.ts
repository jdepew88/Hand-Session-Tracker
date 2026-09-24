import { describe, expect, it } from 'vitest'
import { applyRakeToPots, buildPots, splitAmount, totalPot } from './pot'

const contributions = (entries: Record<number, number>) =>
  new Map(Object.entries(entries).map(([seat, amount]) => [Number(seat), amount]))

describe('pot construction', () => {
  it('builds a single pot when everyone matched', () => {
    const pots = buildPots(contributions({ 1: 1000, 2: 1000, 3: 1000 }), new Set())
    expect(pots).toEqual([{ index: 0, amount: 3000, eligibleSeats: [1, 2, 3] }])
  })

  it('keeps folded money in the pot but not its owner in the running', () => {
    const pots = buildPots(contributions({ 1: 1000, 2: 1000, 3: 400 }), new Set([3]))
    expect(totalPot(pots)).toBe(2400)
    expect(pots).toHaveLength(1)
    expect(pots[0]!.eligibleSeats).toEqual([1, 2])
  })

  it('creates a side pot when a short stack is all-in', () => {
    const pots = buildPots(contributions({ 1: 2000, 2: 5000, 3: 5000 }), new Set())
    expect(pots).toEqual([
      { index: 0, amount: 6000, eligibleSeats: [1, 2, 3] },
      { index: 1, amount: 6000, eligibleSeats: [2, 3] },
    ])
    expect(totalPot(pots)).toBe(12_000)
  })

  it('layers three all-ins of different sizes', () => {
    const pots = buildPots(contributions({ 1: 1000, 2: 3000, 3: 8000 }), new Set())
    expect(pots).toEqual([
      { index: 0, amount: 3000, eligibleSeats: [1, 2, 3] },
      { index: 1, amount: 4000, eligibleSeats: [2, 3] },
      { index: 2, amount: 5000, eligibleSeats: [3] },
    ])
    expect(totalPot(pots)).toBe(12_000)
  })

  it('does not manufacture a side pot from a folded short stack', () => {
    const pots = buildPots(contributions({ 1: 500, 2: 5000, 3: 5000 }), new Set([1]))
    expect(pots).toHaveLength(1)
    expect(pots[0]!.amount).toBe(10_500)
    expect(pots[0]!.eligibleSeats).toEqual([2, 3])
  })
})

describe('rake and splitting', () => {
  it('takes the drop from the main pot first', () => {
    const pots = buildPots(contributions({ 1: 2000, 2: 5000, 3: 5000 }), new Set())
    const raked = applyRakeToPots(pots, 600)
    expect(raked[0]!.amount).toBe(5400)
    expect(raked[1]!.amount).toBe(6000)
    expect(totalPot(raked)).toBe(11_400)
  })

  it('splits evenly and gives the odd chip to the first seat after the button', () => {
    const split = splitAmount(1001, [3, 5], [5, 3, 1])
    expect(split.get(5)).toBe(501)
    expect(split.get(3)).toBe(500)
  })

  it('splits a three-way pot without losing chips', () => {
    const split = splitAmount(1000, [1, 2, 3], [1, 2, 3])
    expect([...split.values()].reduce((a, b) => a + b, 0)).toBe(1000)
  })
})
