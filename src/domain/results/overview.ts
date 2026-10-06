import type { Cents } from '../money'
import {
  bankrollChartPoints,
  bankrollSeries,
  changeSince,
  drawdownFromPeak,
  peakBankroll,
  startOfMonth,
  type BankrollPoint,
  type ChartPoint,
  type Peak,
  type PeriodChange,
} from './bankroll'
import { filterResults, type ResultsFilter } from './filters'
import type { Expense, ResultsData } from './models'
import {
  expensesByCategory,
  performanceStats,
  regularStakes,
  resultsByGame,
  resultsByLocation,
  resultsByStakes,
  settledRows,
  trueNet,
  type Breakdown,
  type CategoryTotal,
  type PerformanceStats,
  type SessionResultRow,
  type TrueNet,
} from './stats'

/**
 * Everything the Results screen shows, derived in one place from one data
 * set. The screen renders these figures; it does not calculate.
 */

export interface BankrollOverview {
  series: BankrollPoint[]
  points: ChartPoint[]
  balance: Cents
  peak: Peak | null
  drawdown: Cents
  month: PeriodChange
  thirtyDays: PeriodChange
  regularStakes: Pick<SessionResultRow, 'smallBlind' | 'bigBlind'> | null
  deposits: number
}

/** The bankroll is the whole record, whatever the filter says. */
export function bankrollOverview(data: ResultsData, now: number = Date.now()): BankrollOverview {
  const series = bankrollSeries(data)
  return {
    series,
    points: bankrollChartPoints(series),
    balance: series.length ? series[series.length - 1]!.balance : 0,
    peak: peakBankroll(series),
    drawdown: drawdownFromPeak(series),
    month: changeSince(series, startOfMonth(now) - 1),
    thirtyDays: changeSince(series, now - 30 * 24 * 60 * 60_000),
    regularStakes: regularStakes(settledRows(data.sessions), now),
    deposits: data.transactions.filter((transaction) => transaction.kind === 'deposit').length,
  }
}

export interface PerformanceOverview {
  rows: SessionResultRow[]
  stats: PerformanceStats
  net: TrueNet
  expenses: Expense[]
  categories: CategoryTotal[]
  byLocation: Breakdown[]
  byStakes: Breakdown[]
  byGame: Breakdown[]
  /** Expenses tied to each session, by session id. */
  sessionExpenses: Map<string, Cents>
}

export function performanceOverview(
  data: ResultsData,
  filter: ResultsFilter,
  now: number = Date.now(),
): PerformanceOverview {
  const filtered = filterResults(data, filter, now)
  const rows = settledRows(filtered.sessions)
  const stats = performanceStats(rows)
  const expenses = [...filtered.expenses].sort((a, b) => b.date.localeCompare(a.date))
  const sessionExpenses = new Map<string, Cents>()
  for (const expense of expenses) {
    if (expense.sessionId) sessionExpenses.set(expense.sessionId, (sessionExpenses.get(expense.sessionId) ?? 0) + expense.amount)
  }
  return {
    rows,
    stats,
    net: trueNet(stats.gross, expenses),
    expenses,
    categories: expensesByCategory(expenses),
    byLocation: resultsByLocation(rows),
    byStakes: resultsByStakes(rows),
    byGame: resultsByGame(rows),
    sessionExpenses,
  }
}
