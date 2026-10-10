import { beforeEach, describe, expect, it } from 'vitest'
import { checkAround, foldTo } from './liveShortcuts'
import { replay } from './reducer'
import { Hand, makeSetup, resetIds } from './testSupport'

beforeEach(resetIds)

// Six-handed, button on 6: SB 1, BB 2, UTG 3, HJ 4, CO 5, BTN 6. Hero on the button.
const setup = () => makeSetup({ seats: 6, buttonSeat: 6, heroSeat: 6 })

describe('Live Track shortcuts', () => {
  it('folds everyone in front of Hero, and the engine then puts the action on Hero', () => {
    const hand = new Hand(setup())
    const folds = foldTo(hand.setup, hand.events, 6)!
    expect(folds.map((event) => [event.seat, event.action])).toEqual([
      [3, 'fold'],
      [4, 'fold'],
      [5, 'fold'],
    ])
    const state = replay(hand.setup, [...hand.events, ...folds])
    expect(state.actingSeat).toBe(6)
    expect(state.activeSeats).toEqual([1, 2, 6])
  })

  it('does not apply once Hero is the one to act, or when Hero is not owed an action', () => {
    const hand = new Hand(setup())
    hand.act(3, 'fold').act(4, 'fold').act(5, 'fold')
    expect(foldTo(hand.setup, hand.events, 6)).toBeNull()
    hand.act(6, 'fold')
    expect(foldTo(hand.setup, hand.events, 6)).toBeNull()
  })

  it('checks a street around, and only when nobody faces a bet', () => {
    const hand = new Hand(setup())
    hand.act(3, 'fold').act(4, 'fold').act(5, 'fold').act(6, 'call').act(1, 'call')
    // Preflop the big blind may check its option: that closes the street.
    expect(checkAround(hand.setup, hand.events)!.map((event) => event.seat)).toEqual([2])
    hand.act(2, 'check').deal('flop', ['Kd', '8s', '3c'])
    const checks = checkAround(hand.setup, hand.events)!
    expect(checks.map((event) => event.seat)).toEqual([1, 2, 6])
    const after = replay(hand.setup, [...hand.events, ...checks])
    expect(after.actingSeat).toBeNull()
    expect(after.pot).toBe(1_500)

    hand.act(1, 'bet', 1_000)
    expect(checkAround(hand.setup, hand.events)).toBeNull()
  })
})
