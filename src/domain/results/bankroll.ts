import type { Cents } from '../money'
import type { BankrollTransactionKind, ExpenseCategory, ResultsData } from './models'
import { settledRows } from './stats'

/**
 * The bankroll as a ledger: every settled session result, every expense and
 * every deposit or withdrawal, in time order, summed. The balance is always
 * re-derived from the ledger; nothing keeps a running total.
 *
 * Deposits and withdrawals move the balance and nothing else: they never
 * reach poker profit, hourly rate or win rate, which come from sessions alone.
 */

export type LedgerEntry =
  | { kind: 'session'; id: string; at: string; amount: Cents; location: string }
  | { kind: 'expense'; id: string; at: string; amount: Cents; category: ExpenseCategory; sessionId: string | null }
  | { kind: BankrollTransactionKind; id: string; at: string; amount: Cents; note: string }

const KIND_ORDER: Record<LedgerEntry['kind'], number> = { deposit: 0, session: 1, expense: 2, withdrawal: 3 }

/** Oldest first. Sessions count when they end. Same-instant ties: money in, play, costs, money out. */
export function bankrollLedger(data: ResultsData): LedgerEntry[] {
  const entries: LedgerEntry[] = [
    ...settledRows(data.sessions).map((row) => ({
      kind: 'session' as const,
      id: row.id,
      at: row.endedAt,
      amount: row.result,
      location: row.location,
    })),
    ...data.expenses.map((expense) => ({
      kind: 'expense' as const,
      id: expense.id,
      at: expense.date,
      amount: -expense.amount,
      category: expense.category,
      sessionId: expense.sessionId,
    })),
    ...data.transactions.map((transaction) => ({
      kind: transaction.kind,
      id: transaction.id,
      at: transaction.date,
      amount: transaction.kind === 'deposit' ? transaction.amount : -transaction.amount,
      note: transaction.note,
    })),
  ]
  return entries
    .filter((entry) => !Number.isNaN(Date.parse(entry.at)))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind])
}

export interface BankrollPoint {
  entry: LedgerEntry
  /** Balance after this entry. */
  balance: Cents
}

export function bankrollSeries(data: ResultsData): BankrollPoint[] {
  let balance = 0
  return bankrollLedger(data).map((entry) => {
    balance += entry.amount
    return { entry, balance }
  })
}

export function bankrollBalance(data: ResultsData): Cents {
  return bankrollLedger(data).reduce((sum, entry) => sum + entry.amount, 0)
}

/** Balance as it stood at `time` (entries at or before it). */
export function balanceAt(series: readonly BankrollPoint[], time: number): Cents {
  let balance = 0
  for (const point of series) {
    if (Date.parse(point.entry.at) > time) break
    balance = point.balance
  }
  return balance
}

export interface Peak {
  amount: Cents
  at: string
}

/** The highest balance reached, and when it was first reached. */
export function peakBankroll(series: readonly BankrollPoint[]): Peak | null {
  let peak: Peak | null = null
  for (const point of series) if (!peak || point.balance > peak.amount) peak = { amount: point.balance, at: point.entry.at }
  return peak
}

/** Current balance minus the peak: zero at a new high, negative below it. */
export function drawdownFromPeak(series: readonly BankrollPoint[]): Cents {
  const peak = peakBankroll(series)
  if (!peak) return 0
  return Math.min(0, series[series.length - 1]!.balance - peak.amount)
}

export interface PeriodChange {
  /** Balance at the start of the period. */
  start: Cents
  /** Total change over the period. */
  change: Cents
  /** The same change, split by where it came from. */
  poker: Cents
  expenses: Cents
  deposits: Cents
  withdrawals: Cents
}

/** How the balance moved from `since` to now, and why. */
export function changeSince(series: readonly BankrollPoint[], since: number): PeriodChange {
  const result: PeriodChange = { start: balanceAt(series, since), change: 0, poker: 0, expenses: 0, deposits: 0, withdrawals: 0 }
  for (const { entry } of series) {
    if (Date.parse(entry.at) <= since) continue
    result.change += entry.amount
    if (entry.kind === 'session') result.poker += entry.amount
    else if (entry.kind === 'expense') result.expenses += entry.amount
    else if (entry.kind === 'deposit') result.deposits += entry.amount
    else result.withdrawals += entry.amount
  }
  return result
}

/** Local midnight at the start of the current month. */
export function startOfMonth(now: number = Date.now()): number {
  const date = new Date(now)
  return new Date(date.getFullYear(), date.getMonth(), 1).getTime()
}

/* --------------------------------------------------------------- chart ---- */

export interface ChartPoint {
  /** Local calendar day, "2026-10-04". */
  day: string
  /** Time of the day's last entry. */
  at: number
  /** Balance at the end of the day. */
  balance: Cents
  /** Change over the day. */
  change: Cents
  entries: LedgerEntry[]
}

const localDay = (time: number) => {
  const date = new Date(time)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/**
 * One point per day that had activity: a tip and a parking fee on the same
 * night as the session are one step on the curve, not three.
 */
export function bankrollChartPoints(series: readonly BankrollPoint[]): ChartPoint[] {
  const points: ChartPoint[] = []
  for (const { entry, balance } of series) {
    const time = Date.parse(entry.at)
    const day = localDay(time)
    const last = points[points.length - 1]
    if (last && last.day === day) {
      last.at = time
      last.balance = balance
      last.change += entry.amount
      last.entries.push(entry)
    } else {
      points.push({ day, at: time, balance, change: entry.amount, entries: [entry] })
    }
  }
  return points
}

export interface MonthBalance {
  /** "2026-10" */
  month: string
  /** Time of the month's last entry. */
  at: number
  balance: Cents
  change: Cents
}

/** End-of-month balances: the chart as a table. */
export function monthEndBalances(points: readonly ChartPoint[]): MonthBalance[] {
  const months: MonthBalance[] = []
  for (const point of points) {
    const month = point.day.slice(0, 7)
    const last = months[months.length - 1]
    if (last && last.month === month) {
      last.at = point.at
      last.balance = point.balance
      last.change += point.change
    } else {
      months.push({ month, at: point.at, balance: point.balance, change: point.change })
    }
  }
  return months
}
