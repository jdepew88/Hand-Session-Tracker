import type { Cents } from '../money'
import { stakesLabel } from '../poker/factories'
import {
  sessionDurationMinutes,
  sessionOutcome,
  sessionResult,
  totalBuyIn,
  type SessionOutcome,
} from '../poker/sessionSummary'
import type { Expense, ExpenseCategory, ExpenseScope, ResultsSession } from './models'

/**
 * Performance figures over settled sessions.
 *
 * A session counts once it is cashed out. Its result is the one
 * `sessionResult` gives everywhere else in the app, and its duration is
 * `sessionDurationMinutes` -- nothing is recomputed here. Live sessions are
 * left out: chips on the table are not a result.
 */

export interface SessionResultRow {
  id: string
  startedAt: string
  endedAt: string
  location: string
  gameType: string
  smallBlind: Cents
  bigBlind: Cents
  tableSize: number
  totalBuyIn: Cents
  buyInCount: number
  cashOut: Cents
  result: Cents
  outcome: Exclude<SessionOutcome, 'live' | 'unsettled'>
  /** Null when the session's times are unusable. */
  durationMinutes: number | null
}

/** Settled sessions as result rows, newest first. */
export function settledRows(sessions: readonly ResultsSession[]): SessionResultRow[] {
  const rows: SessionResultRow[] = []
  for (const session of sessions) {
    const result = sessionResult(session)
    const outcome = sessionOutcome(session)
    if (session.endedAt === null || result === null || outcome === 'live' || outcome === 'unsettled') continue
    rows.push({
      id: session.id,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      location: session.location.trim() || 'Unnamed room',
      gameType: session.gameType,
      smallBlind: session.smallBlind,
      bigBlind: session.bigBlind,
      tableSize: session.tableSize,
      totalBuyIn: totalBuyIn(session),
      buyInCount: session.buyIns.length,
      cashOut: session.cashOut!,
      result,
      outcome,
      durationMinutes: sessionDurationMinutes(session),
    })
  }
  return rows.sort((a, b) => b.startedAt.localeCompare(a.startedAt))
}

/** Cents per hour, rounded to the cent; null with no time to divide by. */
export function hourlyRate(result: Cents, minutes: number): Cents | null {
  if (minutes <= 0) return null
  return Math.round((result * 60) / minutes)
}

export interface PerformanceStats {
  sessions: number
  /** Gross poker result: the sum of every session result. */
  gross: Cents
  /** Minutes across sessions with usable times. */
  minutes: number
  /** Result per hour over the sessions that have a duration. */
  hourly: Cents | null
  winning: number
  losing: number
  even: number
  /** Share of sessions that won (0..1); null with no sessions. */
  winRate: number | null
  average: Cents | null
  biggestWin: Cents | null
  biggestLoss: Cents | null
}

export function performanceStats(rows: readonly SessionResultRow[]): PerformanceStats {
  let gross = 0
  let minutes = 0
  let timedResult = 0
  let winning = 0
  let losing = 0
  let biggestWin: Cents | null = null
  let biggestLoss: Cents | null = null
  for (const row of rows) {
    gross += row.result
    if (row.durationMinutes !== null) {
      minutes += row.durationMinutes
      timedResult += row.result
    }
    if (row.result > 0) {
      winning += 1
      biggestWin = Math.max(biggestWin ?? 0, row.result)
    } else if (row.result < 0) {
      losing += 1
      biggestLoss = Math.min(biggestLoss ?? 0, row.result)
    }
  }
  const sessions = rows.length
  return {
    sessions,
    gross,
    minutes,
    hourly: hourlyRate(timedResult, minutes),
    winning,
    losing,
    even: sessions - winning - losing,
    winRate: sessions === 0 ? null : winning / sessions,
    average: sessions === 0 ? null : Math.round(gross / sessions),
    biggestWin,
    biggestLoss,
  }
}

/* ------------------------------------------------------------ expenses ---- */

export const EXPENSE_CATEGORY_INFO: Record<ExpenseCategory, { label: string; scope: ExpenseScope }> = {
  tips: { label: 'Dealer tips', scope: 'playing' },
  food: { label: 'Food', scope: 'trip' },
  parking: { label: 'Parking', scope: 'playing' },
  gas: { label: 'Gas', scope: 'trip' },
  mileage: { label: 'Mileage', scope: 'trip' },
  rideshare: { label: 'Rideshare', scope: 'trip' },
  hotel: { label: 'Hotel', scope: 'trip' },
  travel: { label: 'Airfare / travel', scope: 'trip' },
  tournament: { label: 'Tournament fees', scope: 'playing' },
  other: { label: 'Other', scope: 'trip' },
}

export const expenseTotal = (expenses: readonly Pick<Expense, 'amount'>[]): Cents =>
  expenses.reduce((sum, expense) => sum + expense.amount, 0)

export interface CategoryTotal {
  category: ExpenseCategory
  amount: Cents
  count: number
  /** Share of all expenses, 0..1. */
  share: number
}

/** Categories with spending, largest first. */
export function expensesByCategory(expenses: readonly Expense[]): CategoryTotal[] {
  const total = expenseTotal(expenses)
  const byCategory = new Map<ExpenseCategory, { amount: Cents; count: number }>()
  for (const expense of expenses) {
    const entry = byCategory.get(expense.category) ?? { amount: 0, count: 0 }
    entry.amount += expense.amount
    entry.count += 1
    byCategory.set(expense.category, entry)
  }
  return [...byCategory.entries()]
    .map(([category, { amount, count }]) => ({ category, amount, count, share: total > 0 ? amount / total : 0 }))
    .filter((entry) => entry.amount > 0)
    .sort((a, b) => b.amount - a.amount)
}

export function expensesByScope(expenses: readonly Expense[]): Record<ExpenseScope, Cents> {
  const totals: Record<ExpenseScope, Cents> = { playing: 0, trip: 0 }
  for (const expense of expenses) totals[expense.scope] += expense.amount
  return totals
}

export function expensesForSession(expenses: readonly Expense[], sessionId: string): Expense[] {
  return expenses.filter((expense) => expense.sessionId === sessionId)
}

/**
 * Whole percentages that add up to exactly 100 (largest remainder), so a list
 * of category shares never reads "33% + 33% + 33%".
 */
export function wholePercents(amounts: readonly number[]): number[] {
  const total = amounts.reduce((sum, amount) => sum + amount, 0)
  if (total <= 0) return amounts.map(() => 0)
  const exact = amounts.map((amount) => (amount * 100) / total)
  const floors = exact.map(Math.floor)
  let left = 100 - floors.reduce((sum, value) => sum + value, 0)
  const order = exact.map((value, index) => ({ index, rest: value - floors[index]! })).sort((a, b) => b.rest - a.rest)
  for (const { index } of order) {
    if (left <= 0) break
    floors[index]! += 1
    left -= 1
  }
  return floors
}

export interface TrueNet {
  /** Gross poker result. */
  gross: Cents
  playing: Cents
  trip: Cents
  /** playing + trip */
  expenses: Cents
  /** gross - expenses */
  net: Cents
}

/** Gross poker result minus poker expenses. Bankroll transactions play no part. */
export function trueNet(gross: Cents, expenses: readonly Expense[]): TrueNet {
  const { playing, trip } = expensesByScope(expenses)
  return { gross, playing, trip, expenses: playing + trip, net: gross - playing - trip }
}

/* ---------------------------------------------------------- breakdowns ---- */

export interface Breakdown {
  key: string
  label: string
  sessions: number
  result: Cents
  minutes: number
  hourly: Cents | null
  winning: number
}

function breakdown(
  rows: readonly SessionResultRow[],
  keyOf: (row: SessionResultRow) => string,
  labelOf: (row: SessionResultRow) => string,
): Breakdown[] {
  // A group is named by the spelling its sessions use most.
  const commonLabel = (group: SessionResultRow[]) => {
    const counts = new Map<string, number>()
    for (const row of group) counts.set(labelOf(row), (counts.get(labelOf(row)) ?? 0) + 1)
    return [...counts.entries()].reduce((best, entry) => (entry[1] > best[1] ? entry : best))[0]
  }
  const groups = new Map<string, SessionResultRow[]>()
  for (const row of rows) {
    const key = keyOf(row)
    groups.set(key, [...(groups.get(key) ?? []), row])
  }
  return [...groups.entries()].map(([key, group]) => {
    const stats = performanceStats(group)
    return {
      key,
      label: commonLabel(group),
      sessions: stats.sessions,
      result: stats.gross,
      minutes: stats.minutes,
      hourly: stats.hourly,
      winning: stats.winning,
    }
  })
}

export const stakesKey = (row: Pick<SessionResultRow, 'smallBlind' | 'bigBlind'>) => `${row.smallBlind}/${row.bigBlind}`

/** By location, best result first. */
export function resultsByLocation(rows: readonly SessionResultRow[]): Breakdown[] {
  return breakdown(rows, (row) => row.location.toLowerCase(), (row) => row.location).sort((a, b) => b.result - a.result)
}

/** By stakes, smallest game first. */
export function resultsByStakes(rows: readonly SessionResultRow[]): Breakdown[] {
  const groups = breakdown(rows, stakesKey, (row) => stakesLabel(row))
  const blinds = (key: string) => key.split('/').map(Number) as [number, number]
  return groups.sort((a, b) => blinds(a.key)[1] - blinds(b.key)[1] || blinds(a.key)[0] - blinds(b.key)[0])
}

/** By game, as the sessions name them; best result first. */
export function resultsByGame(rows: readonly SessionResultRow[]): Breakdown[] {
  return breakdown(rows, (row) => row.gameType, (row) => row.gameType).sort((a, b) => b.result - a.result)
}

/**
 * The stakes played for the most hours over the last 90 days (all time if
 * nothing is that recent). A fact about the record, not a suggestion.
 */
export function regularStakes(
  rows: readonly SessionResultRow[],
  now: number = Date.now(),
): Pick<SessionResultRow, 'smallBlind' | 'bigBlind'> | null {
  const since = now - 90 * 24 * 60 * 60_000
  const recent = rows.filter((row) => Date.parse(row.startedAt) >= since)
  const pool = recent.length > 0 ? recent : rows
  const minutes = new Map<string, { row: SessionResultRow; minutes: number }>()
  for (const row of pool) {
    const key = stakesKey(row)
    const entry = minutes.get(key) ?? { row, minutes: 0 }
    entry.minutes += row.durationMinutes ?? 0
    minutes.set(key, entry)
  }
  let best: { row: SessionResultRow; minutes: number } | null = null
  for (const entry of minutes.values()) if (!best || entry.minutes > best.minutes) best = entry
  return best ? { smallBlind: best.row.smallBlind, bigBlind: best.row.bigBlind } : null
}
