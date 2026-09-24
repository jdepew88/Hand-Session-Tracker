import { describe, expect, it } from 'vitest'
import type { RakeStructure } from './models'
import { computeRake } from './rake'

const structure: RakeStructure = {
  id: 'test',
  name: 'Test drop',
  preflop: 100,
  flop: 350,
  turn: 0,
  river: 100,
  jackpot: 100,
  jackpotStreet: 'flop',
  cap: null,
  noFlopNoDrop: true,
}

describe('street-based drop', () => {
  it('takes nothing when the hand ends before a flop', () => {
    expect(computeRake(structure, 'preflop', 10_000).total).toBe(0)
  })

  it('takes the preflop and flop drop once a flop comes', () => {
    const rake = computeRake(structure, 'flop', 50_000)
    expect(rake.rake).toBe(450)
    expect(rake.jackpot).toBe(100)
    expect(rake.total).toBe(550)
  })

  it('does not add anything on a turn with no turn drop', () => {
    expect(computeRake(structure, 'turn', 50_000).total).toBe(550)
  })

  it('adds the river drop when the hand reaches the river', () => {
    const rake = computeRake(structure, 'river', 50_000)
    expect(rake.rake).toBe(550)
    expect(rake.jackpot).toBe(100)
    expect(rake.total).toBe(650)
  })

  it('reports a per-street breakdown', () => {
    const rake = computeRake(structure, 'river', 50_000)
    expect(rake.lines).toEqual([
      { street: 'preflop', rake: 100, jackpot: 0 },
      { street: 'flop', rake: 350, jackpot: 100 },
      { street: 'river', rake: 100, jackpot: 0 },
    ])
  })

  it('drops preflop when the room has no no-flop-no-drop rule', () => {
    const always = { ...structure, noFlopNoDrop: false }
    expect(computeRake(always, 'preflop', 10_000).total).toBe(100)
  })

  it('applies the cap to rake but not to the jackpot', () => {
    const capped = { ...structure, cap: 300 }
    const rake = computeRake(capped, 'river', 50_000)
    expect(rake.rake).toBe(300)
    expect(rake.jackpot).toBe(100)
    expect(rake.total).toBe(400)
  })

  it('never takes more than is in the pot', () => {
    const rake = computeRake(structure, 'river', 300)
    expect(rake.total).toBe(300)
    expect(rake.rake).toBe(300)
    expect(rake.jackpot).toBe(0)
  })

  it('takes nothing from an empty pot', () => {
    expect(computeRake(structure, 'river', 0).total).toBe(0)
  })
})
