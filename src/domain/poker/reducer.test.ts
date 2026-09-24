import { beforeEach, describe, expect, it } from 'vitest'
import { amountToCall, minRaiseTo, validateAction } from './betting'
import { replay } from './reducer'
import { Hand, makeSetup, resetIds } from './testSupport'

beforeEach(resetIds)

describe('blinds and forced bets', () => {
  it('puts the blinds in the pot and takes them off the stacks', () => {
    const hand = new Hand(makeSetup({ seats: 6, buttonSeat: 6, smallBlind: 200, bigBlind: 500 }))
    const state = hand.state
    expect(state.seats.get(1)!.stack).toBe(49_800)
    expect(state.seats.get(1)!.streetCommitted).toBe(200)
    expect(state.seats.get(2)!.stack).toBe(49_500)
    expect(state.seats.get(2)!.streetCommitted).toBe(500)
    expect(state.pot).toBe(700)
    expect(state.currentBet).toBe(500)
  })

  it('opens the action under the gun and gives the big blind the last word', () => {
    const state = new Hand(makeSetup({ seats: 9, buttonSeat: 9 })).state
    expect(state.actingSeat).toBe(3)
    expect(state.seatsToAct.at(-1)).toBe(2)
  })

  it('collects antes into the pot without changing what anyone owes', () => {
    const hand = new Hand(makeSetup({ seats: 6, ante: 100, anteMode: 'all' }))
    const state = hand.state
    expect(state.pot).toBe(600 + 500 + 500) // six antes plus both blinds
    expect(amountToCall(state, 3)).toBe(500)
    expect(state.seats.get(3)!.stack).toBe(49_900)
    expect(state.seats.get(3)!.committed).toBe(100)
  })

  it('treats a straddle as the live bet and doubles the opening raise size', () => {
    const hand = new Hand(
      makeSetup({ seats: 6, buttonSeat: 6, bigBlind: 500, straddles: [{ seat: 3, amount: 1000 }] }),
    )
    const state = hand.state
    expect(state.currentBet).toBe(1000)
    expect(state.actingSeat).toBe(4)
    expect(state.seatsToAct.at(-1)).toBe(3)
    expect(minRaiseTo(state, 4)).toBe(2000)
  })

  it('caps a forced bet at the stack of a short player', () => {
    const hand = new Hand(makeSetup({ seats: 3, buttonSeat: 3, stacks: { 2: 300 }, bigBlind: 500 }))
    const state = hand.state
    expect(state.seats.get(2)!.stack).toBe(0)
    expect(state.seats.get(2)!.allIn).toBe(true)
    expect(state.seats.get(2)!.committed).toBe(300)
  })
})

describe('bet sizing representation', () => {
  it('stores raises as a total street contribution, not an increment', () => {
    const hand = new Hand(makeSetup({ seats: 6, buttonSeat: 6 }))
    hand.act(3, 'raise', 1500)
    hand.act(4, 'raise', 5000)

    const state = hand.state
    expect(state.seats.get(3)!.streetCommitted).toBe(1500)
    expect(state.seats.get(4)!.streetCommitted).toBe(5000)
    expect(state.seats.get(4)!.stack).toBe(45_000)
    expect(state.currentBet).toBe(5000)
    // Seat 3 owes the difference, not the whole 5000.
    expect(amountToCall(state, 3)).toBe(3500)
  })

  it('tracks the minimum raise across several raises', () => {
    const hand = new Hand(makeSetup({ seats: 6, buttonSeat: 6, bigBlind: 500 }))
    expect(minRaiseTo(hand.state, 3)).toBe(1000)

    hand.act(3, 'raise', 1500) // increment 1000
    expect(minRaiseTo(hand.state, 4)).toBe(2500)

    hand.act(4, 'raise', 4500) // increment 3000
    expect(minRaiseTo(hand.state, 5)).toBe(7500)
    expect(hand.state.minRaiseIncrement).toBe(3000)
  })

  it('never lets a player wager more than their stack', () => {
    const hand = new Hand(makeSetup({ seats: 3, buttonSeat: 3, stacks: { 3: 2000 } }))
    hand.act(3, 'raise', 99_999)
    const seat = hand.state.seats.get(3)!
    expect(seat.stack).toBe(0)
    expect(seat.committed).toBe(2000)
    expect(seat.allIn).toBe(true)
  })

  it('rejects a check into a bet and a wager beyond the stack', () => {
    const hand = new Hand(makeSetup({ seats: 6, buttonSeat: 6, stacks: { 3: 2000 } }))
    const state = hand.state
    const check = validateAction(state, {
      id: 'x', kind: 'action', street: 'preflop', seat: 3, action: 'check', to: 0,
    })
    expect(check.errors.length).toBeGreaterThan(0)

    const overbet = validateAction(state, {
      id: 'y', kind: 'action', street: 'preflop', seat: 3, action: 'raise', to: 9_000,
    })
    expect(overbet.errors).toContain('A player cannot wager more than their stack.')
  })
})

describe('street completion', () => {
  it('ends the hand as soon as everyone folds to one player', () => {
    const hand = new Hand(makeSetup({ seats: 6, buttonSeat: 6 }))
    hand.act(3, 'raise', 1500)
    for (const seat of [4, 5, 6, 1, 2]) hand.act(seat, 'fold')

    const state = hand.state
    expect(state.status).toBe('complete')
    expect(state.endedBy).toBe('fold')
    expect(state.activeSeats).toEqual([3])
  })

  it('returns the uncalled portion of a winning bet', () => {
    const hand = new Hand(makeSetup({ seats: 6, buttonSeat: 6, bigBlind: 500 }))
    hand.act(3, 'raise', 1500)
    for (const seat of [4, 5, 6, 1, 2]) hand.act(seat, 'fold')

    const state = hand.state
    // Seat 3 risked 1500 but only the big blind's 500 could ever be called.
    expect(state.seats.get(3)!.committed).toBe(500)
    expect(state.seats.get(3)!.stack).toBe(49_500)
    // Both blinds stay in the pot; only the unmatched 1000 goes back.
    expect(state.pot).toBe(1500)
  })

  it('closes preflop when the big blind checks their option', () => {
    const hand = new Hand(makeSetup({ seats: 6, buttonSeat: 6 }))
    for (const seat of [3, 4, 5, 6]) hand.act(seat, 'call')
    hand.act(1, 'call')
    expect(hand.state.actingSeat).toBe(2)

    hand.act(2, 'check')
    const state = hand.state
    expect(state.actingSeat).toBeNull()
    expect(state.street).toBe('preflop')
    expect(state.pot).toBe(3000)
  })

  it('reopens the action when someone raises behind', () => {
    const hand = new Hand(makeSetup({ seats: 6, buttonSeat: 6 }))
    hand.act(3, 'call')
    hand.act(4, 'call')
    hand.act(5, 'raise', 2500)
    // Both limpers owe another decision.
    expect(hand.state.seatsToAct).toEqual([6, 1, 2, 3, 4])
    expect(hand.state.actingSeat).toBe(6)
  })

  it('moves to the flop only when the cards arrive', () => {
    const hand = new Hand(makeSetup({ seats: 3, buttonSeat: 3 }))
    hand.act(3, 'call').act(1, 'call').act(2, 'check')
    expect(hand.state.street).toBe('preflop')
    expect(hand.state.actingSeat).toBeNull()

    hand.deal('flop', ['Kd', '8s', '3c'])
    const state = hand.state
    expect(state.street).toBe('flop')
    expect(state.board).toEqual(['Kd', '8s', '3c'])
    expect(state.currentBet).toBe(0)
    expect(state.seats.get(1)!.streetCommitted).toBe(0)
    expect(state.seats.get(1)!.committed).toBe(500)
    // Postflop the small blind acts first.
    expect(state.actingSeat).toBe(1)
  })

  it('carries pot, stacks and contributions through turn and river', () => {
    const hand = new Hand(makeSetup({ seats: 3, buttonSeat: 3, stacks: 50_000 }))
    hand.act(3, 'call').act(1, 'call').act(2, 'check')
    hand.deal('flop', ['Kd', '8s', '3c'])
    hand.act(1, 'check').act(2, 'check').act(3, 'bet', 1000)
    hand.act(1, 'fold').act(2, 'call')
    expect(hand.state.pot).toBe(1500 + 2000)

    hand.deal('turn', ['2h'])
    expect(hand.state.street).toBe('turn')
    expect(hand.state.actingSeat).toBe(2)
    hand.act(2, 'check').act(3, 'check')

    hand.deal('river', ['Qs'])
    expect(hand.state.street).toBe('river')
    hand.act(2, 'bet', 2500).act(3, 'call')

    const state = hand.state
    expect(state.status).toBe('showdown')
    expect(state.pot).toBe(3500 + 5000)
    expect(state.seats.get(2)!.committed).toBe(4000)
    expect(state.seats.get(3)!.committed).toBe(4000)
    expect(state.seats.get(2)!.stack).toBe(46_000)
  })

  it('skips betting once the remaining players are all-in', () => {
    const hand = new Hand(makeSetup({ seats: 3, buttonSeat: 3, stacks: { 1: 4000, 2: 4000, 3: 50_000 } }))
    hand.act(3, 'raise', 4000)
    hand.act(1, 'call')
    hand.act(2, 'call')

    expect(hand.state.actingSeat).toBeNull()
    hand.deal('flop', ['Kd', '8s', '3c'])
    // Nobody has chips behind, so no action is requested.
    expect(hand.state.actingSeat).toBeNull()
    hand.deal('turn', ['2h'])
    expect(hand.state.actingSeat).toBeNull()
    hand.deal('river', ['Qs'])
    expect(hand.state.status).toBe('showdown')
    expect(hand.state.pot).toBe(12_000)
  })

  it('still asks a live player to answer an unmatched all-in', () => {
    const hand = new Hand(makeSetup({ seats: 3, buttonSeat: 3, stacks: { 3: 3000 } }))
    hand.act(3, 'raise', 3000)
    hand.act(1, 'fold')
    expect(hand.state.actingSeat).toBe(2)
    expect(amountToCall(hand.state, 2)).toBe(2500)
  })
})

describe('stack accounting', () => {
  it('matches the worked example: $500 stack, $34 committed, $466 behind', () => {
    const hand = new Hand(makeSetup({ seats: 6, buttonSeat: 6, heroSeat: 3, stacks: 50_000 }))
    hand.act(3, 'raise', 1500)
    hand.act(4, 'call')
    for (const seat of [5, 6, 1]) hand.act(seat, 'fold')
    hand.act(2, 'call')
    hand.deal('flop', ['Kd', '8s', '3c'])
    hand.act(2, 'check').act(3, 'bet', 1900).act(4, 'fold').act(2, 'fold')

    // 15 preflop + 19 on the flop = 34 committed, but 19 of that was uncalled.
    const beforeFolds = replay(hand.setup, hand.events.slice(0, -2))
    expect(beforeFolds.seats.get(3)!.committed).toBe(3400)
    expect(beforeFolds.seats.get(3)!.stack).toBe(46_600)
  })

  it('keeps every seat balanced: starting stack = stack + committed', () => {
    const hand = new Hand(makeSetup({ seats: 6, buttonSeat: 6, ante: 100, anteMode: 'all' }))
    hand.act(3, 'raise', 1500).act(4, 'call').act(5, 'fold').act(6, 'fold').act(1, 'fold').act(2, 'call')
    hand.deal('flop', ['Kd', '8s', '3c'])
    hand.act(2, 'bet', 2000).act(3, 'raise', 6000).act(4, 'fold').act(2, 'call')

    const state = hand.state
    for (const seat of state.seatOrder) {
      const player = state.seats.get(seat)!
      expect(player.stack + player.committed).toBe(player.startingStack)
    }
    const totalCommitted = state.seatOrder.reduce(
      (sum, seat) => sum + state.seats.get(seat)!.committed,
      0,
    )
    expect(state.pot).toBe(totalCommitted)
  })
})

describe('replay and undo', () => {
  it('produces identical state from the same event log', () => {
    const hand = new Hand(makeSetup({ seats: 6, buttonSeat: 6 }))
    hand.act(3, 'raise', 1500).act(4, 'call').act(5, 'fold').act(6, 'fold').act(1, 'fold').act(2, 'call')
    hand.deal('flop', ['Kd', '8s', '3c'])
    hand.act(2, 'bet', 2000).act(3, 'call').act(4, 'fold')

    const first = replay(hand.setup, hand.events)
    const second = replay(hand.setup, [...hand.events])
    expect(second.pot).toBe(first.pot)
    expect([...second.seats.values()].map((s) => s.stack)).toEqual(
      [...first.seats.values()].map((s) => s.stack),
    )
  })

  it('undo restores the exact previous state', () => {
    const hand = new Hand(makeSetup({ seats: 6, buttonSeat: 6 }))
    hand.act(3, 'raise', 1500)
    const before = hand.state
    hand.act(4, 'raise', 5000)
    expect(hand.state.pot).not.toBe(before.pot)

    hand.undo()
    const after = hand.state
    expect(after.pot).toBe(before.pot)
    expect(after.currentBet).toBe(before.currentBet)
    expect(after.actingSeat).toBe(before.actingSeat)
    expect(after.minRaiseIncrement).toBe(before.minRaiseIncrement)
    expect(after.seats.get(4)!.stack).toBe(before.seats.get(4)!.stack)
  })

  it('recovers correctly when an earlier action is corrected', () => {
    const hand = new Hand(makeSetup({ seats: 6, buttonSeat: 6 }))
    hand.act(3, 'raise', 1500).act(4, 'call').act(5, 'fold')

    // The opener actually made it 2000, not 1500.
    const corrected = hand.events.map((event) =>
      event.kind === 'action' && event.seat === 3 ? { ...event, to: 2000 } : event,
    )
    const state = replay(hand.setup, corrected)
    expect(state.seats.get(3)!.committed).toBe(2000)
    expect(state.seats.get(4)!.committed).toBe(2000)
    expect(state.pot).toBe(2000 + 2000 + 500 + 500)
  })
})

describe('dead money and missed blinds', () => {
  it('adds dead money to the pot without reducing what the player owes', () => {
    const hand = new Hand(makeSetup({ seats: 6, buttonSeat: 6, deadMoney: [{ seat: 4, amount: 500 }] }))
    const state = hand.state
    expect(state.pot).toBe(1500)
    expect(state.seats.get(4)!.committed).toBe(500)
    expect(state.seats.get(4)!.streetCommitted).toBe(0)
    expect(amountToCall(state, 4)).toBe(500)
  })
})
