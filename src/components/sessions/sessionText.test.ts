import { describe, expect, it } from 'vitest'
import type { SessionSummary } from '../../domain/poker/sessionSummary'
import { formatMinutes, formatRelativeDay, spokenMinutes } from '../../utils/labels'
import { buyInText, gameLine, resultDisplay, sessionAccessibleSummary } from './sessionText'

const NOW = new Date(2026, 9, 6, 21, 0).getTime()

function summary(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: 'a',
    location: 'Commerce Casino',
    gameType: "No-Limit Hold'em",
    smallBlind: 200,
    bigBlind: 500,
    tableSize: 9,
    startedAt: new Date(2026, 9, 4, 19, 15).toISOString(),
    endedAt: new Date(2026, 9, 4, 23, 33).toISOString(),
    live: false,
    totalBuyIn: 50_000,
    buyInCount: 1,
    cashOut: 86_000,
    result: 36_000,
    outcome: 'win',
    durationMinutes: 258,
    handCount: 12,
    ...overrides,
  }
}

describe('durations', () => {
  it('formats and speaks minutes', () => {
    expect(formatMinutes(258)).toBe('4h 18m')
    expect(formatMinutes(45)).toBe('45m')
    expect(formatMinutes(null)).toBe('—')
    expect(spokenMinutes(258)).toBe('4 hours 18 minutes')
    expect(spokenMinutes(60)).toBe('1 hour')
    expect(spokenMinutes(1)).toBe('1 minute')
  })
})

describe('dates', () => {
  it('names today and yesterday, and dates anything older', () => {
    expect(formatRelativeDay(new Date(2026, 9, 6, 9, 0).toISOString(), NOW)).toBe('Today')
    expect(formatRelativeDay(new Date(2026, 9, 5, 23, 30).toISOString(), NOW)).toBe('Yesterday')
    const older = formatRelativeDay(new Date(2026, 9, 2, 18, 45).toISOString(), NOW)
    expect(older).not.toMatch(/Today|Yesterday|2026/)
    expect(formatRelativeDay(new Date(2025, 9, 2).toISOString(), NOW)).toMatch(/2025/)
  })
})

describe('result display', () => {
  it('shows wins, losses and break-even with a sign and a word', () => {
    expect(resultDisplay(summary())).toMatchObject({ figure: '+$360', caption: 'Profit', tone: 'gain', numeric: true })
    expect(resultDisplay(summary({ cashOut: 28_000, result: -22_000, outcome: 'loss' }))).toMatchObject({
      figure: '-$220',
      caption: 'Loss',
      tone: 'loss',
    })
    expect(resultDisplay(summary({ cashOut: 50_000, result: 0, outcome: 'even' }))).toMatchObject({
      figure: '$0',
      caption: 'Break-even',
      tone: 'even',
    })
  })

  it('never shows a number without a cash-out', () => {
    const live = resultDisplay(summary({ live: true, endedAt: null, cashOut: null, result: null, outcome: 'live' }))
    expect(live).toMatchObject({ figure: 'In progress', numeric: false })
    const unsettled = resultDisplay(summary({ cashOut: null, result: null, outcome: 'unsettled' }))
    expect(unsettled).toMatchObject({ figure: 'No cash-out', numeric: false })
  })
})

describe('session text', () => {
  it('writes the game line and buy-ins', () => {
    expect(gameLine(summary())).toBe('$2/$5 NLH · 9-handed')
    expect(buyInText(summary())).toBe('$500')
    expect(buyInText(summary({ totalBuyIn: 100_000, buyInCount: 2 }))).toBe('$1,000 · 2 buy-ins')
  })

  it('summarises a finished session in one sentence', () => {
    expect(sessionAccessibleSummary(summary(), NOW)).toBe(
      "Commerce Casino, $2/$5 No-Limit Hold'em, 9-handed, October 4, duration 4 hours 18 minutes, profit $360, bought in for $500, cashed out for $860, 12 hands recorded.",
    )
    expect(sessionAccessibleSummary(summary({ cashOut: 28_000, result: -22_000, outcome: 'loss' }), NOW)).toContain(
      'loss $220',
    )
  })

  it('summarises a live session without a result', () => {
    const text = sessionAccessibleSummary(
      summary({ live: true, endedAt: null, cashOut: null, result: null, outcome: 'live', durationMinutes: 134, handCount: 1 }),
      NOW,
    )
    expect(text).toBe(
      "Live session at Commerce Casino, $2/$5 No-Limit Hold'em, 9-handed, started October 4, running for 2 hours 14 minutes, in progress, bought in for $500, 1 hand recorded.",
    )
  })
})
