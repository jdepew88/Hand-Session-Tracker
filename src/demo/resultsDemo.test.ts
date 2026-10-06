import { describe, expect, it } from 'vitest'
import { bankrollSeries } from '../domain/results/bankroll'
import { EXPENSE_CATEGORIES } from '../domain/results/models'
import { performanceStats, settledRows } from '../domain/results/stats'
import { buildDemoResults } from './resultsDemo'

const NOW = new Date(2026, 9, 6, 21, 0).getTime()

describe('demo results data', () => {
  const data = buildDemoResults(NOW)

  it('is all integer cents and all settled sessions', () => {
    const amounts = [
      ...data.sessions.flatMap((session) => [session.cashOut!, ...session.buyIns.map((buyIn) => buyIn.amount)]),
      ...data.expenses.map((expense) => expense.amount),
      ...data.transactions.map((transaction) => transaction.amount),
    ]
    for (const amount of amounts) expect(Number.isInteger(amount) && amount > 0).toBe(true)
    expect(settledRows(data.sessions)).toHaveLength(data.sessions.length)
  })

  it('looks like an ordinary winning record, not a highlight reel', () => {
    const stats = performanceStats(settledRows(data.sessions))
    expect(stats.winning).toBeGreaterThan(stats.losing)
    expect(stats.losing).toBeGreaterThan(8)
    expect(stats.even).toBeGreaterThanOrEqual(1)
    expect(stats.biggestWin!).toBeLessThanOrEqual(200_000)
    expect(stats.hourly!).toBeGreaterThan(0)
    expect(stats.hourly!).toBeLessThan(6_000)
  })

  it('covers several casinos, both supported games, deposits and withdrawals', () => {
    expect(new Set(data.sessions.map((session) => session.location)).size).toBeGreaterThanOrEqual(4)
    expect(new Set(data.sessions.map((session) => session.gameType))).toEqual(new Set(["No-Limit Hold'em", 'Pot-Limit Omaha']))
    expect(data.transactions.some((transaction) => transaction.kind === 'deposit')).toBe(true)
    expect(data.transactions.some((transaction) => transaction.kind === 'withdrawal')).toBe(true)
    for (const expense of data.expenses) expect(EXPENSE_CATEGORIES).toContain(expense.category)
  })

  it('only links expenses to demo sessions that exist, and never runs the bankroll below zero', () => {
    const ids = new Set(data.sessions.map((session) => session.id))
    for (const expense of data.expenses) if (expense.sessionId) expect(ids.has(expense.sessionId)).toBe(true)
    for (const point of bankrollSeries(data)) expect(point.balance).toBeGreaterThan(0)
  })

  it('places everything in the past', () => {
    for (const session of data.sessions) expect(Date.parse(session.endedAt!)).toBeLessThan(NOW)
    for (const expense of data.expenses) expect(Date.parse(expense.date)).toBeLessThan(NOW)
  })
})
