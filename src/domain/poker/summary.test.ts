import { beforeEach, describe, expect, it } from 'vitest'
import type { HandRecord, RakeStructure } from './models'
import { replay } from './reducer'
import { computeResult } from './showdown'
import { generateSummary } from './summary'
import { Hand, makeSetup, resetIds } from './testSupport'

beforeEach(resetIds)

const commerceStyleDrop: RakeStructure = {
  id: 'example',
  name: 'Example drop',
  preflop: 100,
  flop: 350,
  turn: 0,
  river: 100,
  jackpot: 100,
  jackpotStreet: 'flop',
  cap: null,
  noFlopNoDrop: true,
}

/**
 * The worked example from the product spec, played out for real through the
 * engine: 9-handed $5/$5, hero in the cutoff with A-K suited, losing $270 to
 * the hijack's two pair.
 */
function specExample() {
  const hand = new Hand(
    makeSetup({
      seats: 9,
      buttonSeat: 9,
      heroSeat: 8, // cutoff
      smallBlind: 500,
      bigBlind: 500,
      stacks: 50_000,
      heroCards: ['As', 'Ks'],
      rake: commerceStyleDrop,
    }),
  )

  // Preflop: UTG through LJ fold, HJ opens, hero 3-bets, BB and HJ call.
  for (const seat of [3, 4, 5, 6]) hand.act(seat, 'fold')
  hand.act(7, 'raise', 2000)
  hand.act(8, 'raise', 6500)
  hand.act(9, 'fold')
  hand.act(1, 'fold')
  hand.act(2, 'call')
  hand.act(7, 'call')

  hand.deal('flop', ['Kd', '8s', '3c'])
  hand.act(2, 'check').act(7, 'check').act(8, 'bet', 8000)
  hand.act(2, 'fold').act(7, 'call')

  hand.deal('turn', ['2h'])
  hand.act(7, 'check').act(8, 'check')

  hand.deal('river', ['Qs'])
  hand.act(7, 'bet', 12_500).act(8, 'call')
  hand.reveal(7, ['Kc', 'Qd'])

  const record: HandRecord = {
    id: 'hand-1',
    sessionId: 'session-1',
    handNumber: 1,
    createdAt: '2026-09-24T02:00:00.000Z',
    updatedAt: '2026-09-24T02:00:00.000Z',
    setup: hand.setup,
    events: hand.events,
    manualWinners: [],
    favorite: false,
    tags: [],
    notes: '',
    context: {
      location: 'Commerce Casino',
      gameType: "No-Limit Hold'em",
      stakesLabel: '$5/$5',
      tableSize: 9,
      heroPosition: 'CO',
    },
  }
  return { hand, record }
}

describe('the spec worked example', () => {
  it('reaches the pot sizes quoted in the spec', () => {
    const { hand } = specExample()

    const afterPreflop = replay(hand.setup, hand.events.slice(0, 11))
    expect(afterPreflop.pot).toBe(20_000) // $200

    const afterFlop = replay(hand.setup, hand.events.slice(0, 16))
    expect(afterFlop.pot).toBe(36_000) // $360

    expect(hand.state.pot).toBe(61_000) // $610
  })

  it('settles the result the spec describes', () => {
    const { hand } = specExample()
    const state = hand.state
    const result = computeResult(hand.setup, state)

    expect(result.winners).toEqual([7])
    expect(result.grossPot).toBe(61_000)
    expect(result.rake.total).toBe(650)
    expect(result.netPot).toBe(60_350)
    expect(result.heroResult).toBe(-27_000) // -$270
    expect(result.showdown.find((e) => e.seat === 7)!.ranking!.description).toBe(
      'two pair, Kings and Queens',
    )
  })

  it('leaves hero with the right stack', () => {
    const { hand } = specExample()
    const hero = hand.state.seats.get(8)!
    expect(hero.startingStack).toBe(50_000)
    expect(hero.committed).toBe(27_000)
    expect(hero.stack).toBe(23_000)
  })

  it('reads back as a hand history', () => {
    const { record } = specExample()
    const summary = generateSummary(record)

    expect(summary).toContain("Commerce Casino — $5/$5 NLHE")
    expect(summary).toContain('9-handed')
    expect(summary).toContain('Hero: CO — $500')
    expect(summary).toContain('Hero: A♠ K♠')
    expect(summary).toContain('HJ raises to $20.')
    expect(summary).toContain('Hero raises to $65.')
    expect(summary).toContain('BB calls $60.')
    expect(summary).toContain('HJ calls $45.')
    expect(summary).toContain('Pot: $200')
    expect(summary).toContain('Flop: K♦ 8♠ 3♣')
    expect(summary).toContain('Hero bets $80.')
    expect(summary).toContain('Pot: $360')
    expect(summary).toContain('Turn: 2♥')
    expect(summary).toContain('River: Q♠')
    expect(summary).toContain('HJ bets $125.')
    expect(summary).toContain('Hero calls $125.')
    expect(summary).toContain('Showdown')
    expect(summary).toContain('with two pair, Kings and Queens')
    expect(summary).toContain('Gross pot: $610')
    expect(summary).toContain('Drop: $6.50')
    expect(summary).toContain('Net pot: $603.50')
    expect(summary).toContain('Hero result: -$270')
  })
})

describe('summary edge cases', () => {
  it('marks an all-in', () => {
    const hand = new Hand(
      makeSetup({ seats: 3, buttonSeat: 3, heroSeat: 3, stacks: { 3: 4000 }, heroCards: ['As', 'Ad'] }),
    )
    hand.act(3, 'raise', 4000).act(1, 'fold').act(2, 'call')
    const record: HandRecord = {
      id: 'h', sessionId: 's', handNumber: 2,
      createdAt: '2026-09-24T02:00:00.000Z', updatedAt: '2026-09-24T02:00:00.000Z',
      setup: hand.setup, events: hand.events, manualWinners: [], favorite: false,
      tags: [], notes: '',
      context: { location: 'Local Room', gameType: "No-Limit Hold'em", stakesLabel: '$5/$5', tableSize: 3, heroPosition: 'BTN' },
    }
    expect(generateSummary(record)).toContain('and is all-in')
  })

  it('says so when the winner is unknown', () => {
    const hand = new Hand(makeSetup({ seats: 2, buttonSeat: 1, heroSeat: 1, heroCards: ['As', 'Ks'] }))
    hand.act(1, 'call').act(2, 'check')
    hand.deal('flop', ['Kd', '8s', '3c'])
    hand.act(2, 'check').act(1, 'check')
    hand.deal('turn', ['2h'])
    hand.act(2, 'check').act(1, 'check')
    hand.deal('river', ['Qs'])
    hand.act(2, 'check').act(1, 'check')

    const record: HandRecord = {
      id: 'h', sessionId: 's', handNumber: 3,
      createdAt: '2026-09-24T02:00:00.000Z', updatedAt: '2026-09-24T02:00:00.000Z',
      setup: hand.setup, events: hand.events, manualWinners: [], favorite: false,
      tags: [], notes: '',
      context: { location: 'Local Room', gameType: "No-Limit Hold'em", stakesLabel: '$5/$5', tableSize: 2, heroPosition: 'SB' },
    }
    expect(generateSummary(record)).toContain('Winner not determined')
  })
})
