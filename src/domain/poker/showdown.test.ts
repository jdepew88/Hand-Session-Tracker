import { beforeEach, describe, expect, it } from 'vitest'
import type { RakeStructure } from './models'
import { canAutoResolve, computeResult } from './showdown'
import { Hand, makeSetup, resetIds } from './testSupport'

beforeEach(resetIds)

const drop: RakeStructure = {
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

function headsUpToShowdown(heroCards: string[], villainCards: string[], board: string[]) {
  const hand = new Hand(
    makeSetup({ seats: 2, buttonSeat: 1, heroSeat: 1, stacks: 50_000, heroCards }),
  )
  hand.act(1, 'call').act(2, 'check')
  hand.deal('flop', board.slice(0, 3))
  hand.act(2, 'check').act(1, 'check')
  hand.deal('turn', [board[3]!])
  hand.act(2, 'check').act(1, 'check')
  hand.deal('river', [board[4]!])
  hand.act(2, 'check').act(1, 'check')
  hand.reveal(2, villainCards)
  return hand
}

describe('awarding the pot', () => {
  it('gives the whole pot to the last player standing', () => {
    const hand = new Hand(makeSetup({ seats: 6, buttonSeat: 6, heroSeat: 3 }))
    hand.act(3, 'raise', 1500)
    for (const seat of [4, 5, 6, 1, 2]) hand.act(seat, 'fold')

    const result = computeResult(hand.setup, hand.state)
    expect(result.winners).toEqual([3])
    expect(result.grossPot).toBe(1500)
    expect(result.heroResult).toBe(1000)
    expect(result.finalStacks.find((s) => s.seat === 3)!.stack).toBe(51_000)
  })

  it('picks the better hand at showdown', () => {
    const hand = headsUpToShowdown(
      ['As', 'Ks'],
      ['Kc', 'Qd'],
      ['Kd', '8s', '3c', '2h', 'Qs'],
    )
    const result = computeResult(hand.setup, hand.state)
    expect(result.winners).toEqual([2])
    expect(result.showdown.find((e) => e.seat === 2)!.ranking!.description).toBe(
      'two pair, Kings and Queens',
    )
    expect(result.heroResult).toBe(-500)
  })

  it('splits a pot when the hands tie', () => {
    const hand = headsUpToShowdown(
      ['As', 'Kd'],
      ['Ah', 'Kc'],
      ['Ks', '8s', '3c', '2h', 'Qd'],
    )
    const result = computeResult(hand.setup, hand.state)
    expect(result.winners).toEqual([1, 2])
    expect(result.awards.reduce((sum, a) => sum + a.amount, 0)).toBe(result.netPot)
    expect(result.heroResult).toBe(0)
  })

  it('splits when the board plays', () => {
    const hand = headsUpToShowdown(
      ['2c', '3d'],
      ['4c', '5d'],
      ['7c', '7d', '7h', '7s', 'Ah'],
    )
    const result = computeResult(hand.setup, hand.state)
    expect(result.winners).toEqual([1, 2])
    expect(result.heroResult).toBe(0)
  })

  it('pays a short stack only from the pot they could win', () => {
    const hand = new Hand(
      makeSetup({
        seats: 3,
        buttonSeat: 3,
        heroSeat: 3,
        stacks: { 1: 2000, 2: 10_000, 3: 10_000 },
        heroCards: ['As', 'Ad'],
      }),
    )
    hand.act(3, 'raise', 10_000)
    hand.act(1, 'call') // all-in for 2000
    hand.act(2, 'call') // all-in for 10_000
    hand.deal('flop', ['Kd', '8s', '3c'])
    hand.deal('turn', ['2h'])
    hand.deal('river', ['Qc'])
    hand.reveal(1, ['Kh', 'Ks']) // best hand, but only 2000 in
    hand.reveal(2, ['8h', '8d'])

    const state = hand.state
    expect(state.pots).toHaveLength(2)

    const result = computeResult(hand.setup, state)
    const shortStackWon = result.awards.filter((a) => a.seat === 1).reduce((s, a) => s + a.amount, 0)
    const sidePotWinner = result.awards.filter((a) => a.seat === 2).reduce((s, a) => s + a.amount, 0)
    expect(shortStackWon).toBe(6000) // main pot only
    expect(sidePotWinner).toBe(16_000) // side pot, set of eights beats aces
    expect(result.heroResult).toBe(-10_000)
  })

  it('subtracts the drop from what the winner is pushed', () => {
    const hand = new Hand(makeSetup({ seats: 2, buttonSeat: 1, heroSeat: 1, rake: drop }))
    hand.act(1, 'call').act(2, 'check')
    hand.deal('flop', ['Kd', '8s', '3c'])
    hand.act(2, 'bet', 1000).act(1, 'fold')

    const result = computeResult(hand.setup, hand.state)
    expect(result.grossPot).toBe(1000)
    expect(result.rake.total).toBe(550)
    expect(result.netPot).toBe(450)
    expect(result.awards.reduce((sum, a) => sum + a.amount, 0)).toBe(450)
    expect(result.heroResult).toBe(-500)
  })

  it('reports an undetermined winner when opponent cards are unknown', () => {
    const hand = new Hand(
      makeSetup({ seats: 2, buttonSeat: 1, heroSeat: 1, heroCards: ['As', 'Ks'] }),
    )
    hand.act(1, 'call').act(2, 'check')
    hand.deal('flop', ['Kd', '8s', '3c'])
    hand.act(2, 'check').act(1, 'check')
    hand.deal('turn', ['2h'])
    hand.act(2, 'check').act(1, 'check')
    hand.deal('river', ['Qs'])
    hand.act(2, 'check').act(1, 'check')

    expect(canAutoResolve(hand.state)).toBe(false)
    const result = computeResult(hand.setup, hand.state)
    expect(result.undetermined).toBe(true)
    expect(result.winners).toEqual([])

    const manual = computeResult(hand.setup, hand.state, [2])
    expect(manual.winners).toEqual([2])
    expect(manual.manual).toBe(true)
    expect(manual.heroResult).toBe(-500)
  })

  it('keeps every chip accounted for', () => {
    const hand = headsUpToShowdown(['As', 'Ks'], ['Kc', 'Qd'], ['Kd', '8s', '3c', '2h', 'Qs'])
    const state = hand.state
    const result = computeResult(hand.setup, state)
    const awarded = result.awards.reduce((sum, a) => sum + a.amount, 0)
    expect(awarded + result.rake.total).toBe(result.grossPot)

    const finalTotal = result.finalStacks.reduce((sum, s) => sum + s.stack, 0)
    const startingTotal = state.seatOrder.reduce(
      (sum, seat) => sum + state.seats.get(seat)!.startingStack,
      0,
    )
    expect(finalTotal).toBe(startingTotal - result.rake.total)
  })
})
