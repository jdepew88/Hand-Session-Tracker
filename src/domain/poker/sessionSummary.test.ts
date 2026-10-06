import { describe, expect, it } from 'vitest'
import { createSession, newId } from './factories'
import type { Session } from './models'
import {
  sessionDurationMinutes,
  sessionOutcome,
  sessionResult,
  summarizeSession,
  totalBuyIn,
} from './sessionSummary'

const START = '2026-10-04T19:15:00.000Z'

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
    startedAt: START,
    ...overrides,
  }
}

const ended = (cashOut: number | null, extra: Partial<Session> = {}) =>
  session({ endedAt: '2026-10-04T23:33:00.000Z', cashOut, ...extra })

describe('session result', () => {
  it('is cash-out minus every buy-in, as the session page always computed it', () => {
    expect(sessionResult(ended(86_000))).toBe(36_000)
    expect(sessionResult(ended(28_000))).toBe(-22_000)
    expect(sessionResult(ended(50_000))).toBe(0)
  })

  it('counts rebuys and add-ons', () => {
    const rebought = ended(120_000, {
      buyIns: [
        { id: newId(), amount: 50_000, at: START },
        { id: newId(), amount: 30_000, at: START },
      ],
    })
    expect(totalBuyIn(rebought)).toBe(80_000)
    expect(sessionResult(rebought)).toBe(40_000)
  })

  it('does not exist until the session is cashed out', () => {
    expect(sessionResult(session())).toBeNull()
  })

  it('classifies the outcome', () => {
    expect(sessionOutcome(session())).toBe('live')
    expect(sessionOutcome(ended(86_000))).toBe('win')
    expect(sessionOutcome(ended(28_000))).toBe('loss')
    expect(sessionOutcome(ended(50_000))).toBe('even')
    expect(sessionOutcome(ended(null))).toBe('unsettled')
  })
})

describe('session duration', () => {
  it('measures a finished session from start to end', () => {
    expect(sessionDurationMinutes(ended(0))).toBe(4 * 60 + 18)
  })

  it('measures a live session up to now', () => {
    const now = Date.parse(START) + (2 * 60 + 14) * 60_000 + 30_000
    expect(sessionDurationMinutes(session(), now)).toBe(2 * 60 + 14)
  })

  it('gives up on unusable times rather than showing a negative', () => {
    expect(sessionDurationMinutes(session({ startedAt: 'not a date' }))).toBeNull()
    expect(sessionDurationMinutes(session({ endedAt: '2026-10-04T18:00:00.000Z' }))).toBeNull()
  })
})

describe('summarizeSession', () => {
  it('collects everything a journal entry needs', () => {
    const s = ended(86_000)
    const hands = [{ sessionId: s.id }, { sessionId: s.id }, { sessionId: 'another' }]
    expect(summarizeSession(s, hands)).toMatchObject({
      location: 'Commerce Casino',
      gameType: "No-Limit Hold'em",
      smallBlind: 200,
      bigBlind: 500,
      tableSize: 9,
      live: false,
      totalBuyIn: 50_000,
      buyInCount: 1,
      cashOut: 86_000,
      result: 36_000,
      outcome: 'win',
      durationMinutes: 258,
      handCount: 2,
    })
  })

  it('reports a live session without inventing a result', () => {
    const summary = summarizeSession(session(), [], Date.parse(START) + 60 * 60_000)
    expect(summary).toMatchObject({ live: true, cashOut: null, result: null, outcome: 'live', durationMinutes: 60 })
  })
})
