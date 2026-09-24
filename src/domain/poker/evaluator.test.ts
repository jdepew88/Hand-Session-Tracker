import { describe, expect, it } from 'vitest'
import { compareRankings, evaluateHand } from './evaluator'

const evaluate = (cards: string) => evaluateHand(cards.split(' '))!

describe('hand evaluation', () => {
  it('identifies every category', () => {
    expect(evaluate('As Ks Qs Js Ts').category).toBe('straight-flush')
    expect(evaluate('9h 8h 7h 6h 5h 2c 3d').category).toBe('straight-flush')
    expect(evaluate('Kd Kc Kh Ks 2d').category).toBe('quads')
    expect(evaluate('Kd Kc Kh Qs Qd').category).toBe('full-house')
    expect(evaluate('Ad 9d 7d 4d 2d').category).toBe('flush')
    expect(evaluate('Ad Kc Qh Js Td').category).toBe('straight')
    expect(evaluate('Kd Kc Kh Qs 2d').category).toBe('trips')
    expect(evaluate('Kd Kc Qh Qs 2d').category).toBe('two-pair')
    expect(evaluate('Kd Kc 9h 5s 2d').category).toBe('pair')
    expect(evaluate('Kd Jc 9h 5s 2d').category).toBe('high-card')
  })

  it('reads the wheel as a five-high straight', () => {
    const wheel = evaluate('Ad 2c 3h 4s 5d')
    expect(wheel.category).toBe('straight')
    expect(wheel.kickers[0]).toBe(5)
    expect(compareRankings(wheel, evaluate('6d 2c 3h 4s 5d'))).toBeLessThan(0)
  })

  it('calls a ten-to-ace straight flush a royal', () => {
    expect(evaluate('As Ks Qs Js Ts').description).toBe('a royal flush')
  })

  it('picks the best five from seven', () => {
    const best = evaluate('As Ks Kd Kc Kh 2d 3c')
    expect(best.category).toBe('quads')
    expect(best.kickers).toEqual([13, 14])
    expect(best.cards).toHaveLength(5)
  })

  it('prefers the higher of two possible full houses', () => {
    const ranking = evaluate('Ks Kd Kc 9h 9s 2d 2c')
    expect(ranking.description).toBe('a full house, Kings full of Nines')
  })

  it('uses a second set as the pair in a full house', () => {
    const ranking = evaluate('Ks Kd Kc 9h 9d 9s 2c')
    expect(ranking.description).toBe('a full house, Kings full of Nines')
  })

  it('separates hands on kickers', () => {
    const better = evaluate('Ac Kd Kh 9s 5c')
    const worse = evaluate('Qc Kd Kh 9s 5c')
    expect(compareRankings(better, worse)).toBeGreaterThan(0)
  })

  it('reports a tie when the board plays', () => {
    const board = '7c 7d 7h 7s Ah'
    const heroA = evaluate(`2c 3d ${board}`)
    const heroB = evaluate(`4c 5d ${board}`)
    expect(compareRankings(heroA, heroB)).toBe(0)
    expect(heroA.description).toBe('four of a kind, Sevens')
  })

  it('ranks a flush above a straight and a straight above trips', () => {
    expect(compareRankings(evaluate('Ad 9d 7d 4d 2d'), evaluate('Ad Kc Qh Js Td'))).toBeGreaterThan(0)
    expect(compareRankings(evaluate('Ad Kc Qh Js Td'), evaluate('Kd Kc Kh Qs 2d'))).toBeGreaterThan(0)
  })

  it('describes the example hands from the spec', () => {
    const board = 'Kd 8s 3c 2h Qs'
    expect(evaluate(`As Ks ${board}`).description).toBe('a pair of Kings')
    expect(evaluate(`Kc Qd ${board}`).description).toBe('two pair, Kings and Queens')
    expect(
      compareRankings(evaluate(`Kc Qd ${board}`), evaluate(`As Ks ${board}`)),
    ).toBeGreaterThan(0)
  })

  it('returns null below five cards', () => {
    expect(evaluateHand(['As', 'Ks'])).toBeNull()
  })
})
