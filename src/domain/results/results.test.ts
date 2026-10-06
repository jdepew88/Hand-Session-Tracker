import { describe, expect, it } from 'vitest'
import { newId } from '../poker/factories'
import {
  balanceAt,
  bankrollBalance,
  bankrollChartPoints,
  bankrollLedger,
  bankrollSeries,
  changeSince,
  drawdownFromPeak,
  monthEndBalances,
  peakBankroll,
} from './bankroll'
import { ALL_RESULTS, dateWindow, filterOptions, filterResults, isFiltered } from './filters'
import type { BankrollTransaction, Expense, ExpenseCategory, ResultsData, ResultsSession } from './models'
import { bankrollOverview, performanceOverview } from './overview'
import {
  EXPENSE_CATEGORY_INFO,
  expensesByCategory,
  expensesByScope,
  expenseTotal,
  hourlyRate,
  performanceStats,
  regularStakes,
  resultsByGame,
  resultsByLocation,
  resultsByStakes,
  settledRows,
  trueNet,
  wholePercents,
} from './stats'

const NOW = new Date(2026, 9, 6, 21, 0).getTime()
const HOUR = 60 * 60_000
const DAY = 24 * HOUR

/** A session that started `daysAgo` days before NOW at 7 pm and ran `minutes`. */
function session(
  daysAgo: number,
  buyIns: number[],
  cashOut: number | null,
  extra: Partial<ResultsSession> & { minutes?: number } = {},
): ResultsSession {
  const { minutes = 240, ...rest } = extra
  const start = new Date(2026, 9, 6 - daysAgo, 19, 0).getTime()
  return {
    id: newId(),
    startedAt: new Date(start).toISOString(),
    endedAt: new Date(start + minutes * 60_000).toISOString(),
    location: 'Commerce Casino',
    gameType: "No-Limit Hold'em",
    smallBlind: 200,
    bigBlind: 500,
    tableSize: 9,
    buyIns: buyIns.map((amount) => ({ id: newId(), amount, at: new Date(start).toISOString() })),
    cashOut,
    ...rest,
  }
}

function expense(daysAgo: number, category: ExpenseCategory, amount: number, extra: Partial<Expense> = {}): Expense {
  const date = new Date(2026, 9, 6 - daysAgo, 12).toISOString()
  return {
    id: newId(),
    category,
    amount,
    date,
    sessionId: null,
    location: '',
    note: '',
    scope: EXPENSE_CATEGORY_INFO[category].scope,
    createdAt: date,
    updatedAt: date,
    ...extra,
  }
}

function transaction(daysAgo: number, kind: BankrollTransaction['kind'], amount: number): BankrollTransaction {
  const date = new Date(2026, 9, 6 - daysAgo, 10).toISOString()
  return { id: newId(), kind, amount, date, note: '', createdAt: date, updatedAt: date }
}

describe('poker profit', () => {
  const win = session(10, [50_000], 86_000, { minutes: 258 })
  const loss = session(8, [50_000, 30_000], 58_000, { minutes: 180 })
  const even = session(6, [50_000], 50_000, { minutes: 120 })
  const live = { ...session(0, [50_000], null), endedAt: null }
  const rows = settledRows([win, loss, even, live])

  it('uses each settled session’s cash-out minus every buy-in, newest first, and leaves live sessions out', () => {
    expect(rows.map((row) => row.result)).toEqual([0, -22_000, 36_000])
    expect(rows.map((row) => row.outcome)).toEqual(['even', 'loss', 'win'])
    expect(rows[1]).toMatchObject({ totalBuyIn: 80_000, buyInCount: 2, cashOut: 58_000 })
  })

  it('sums profit, hours and hourly from the same rows', () => {
    const stats = performanceStats(rows)
    expect(stats).toMatchObject({
      sessions: 3,
      gross: 14_000,
      minutes: 258 + 180 + 120,
      winning: 1,
      losing: 1,
      even: 1,
      average: Math.round(14_000 / 3),
      biggestWin: 36_000,
      biggestLoss: -22_000,
    })
    expect(stats.winRate).toBeCloseTo(1 / 3)
    // $140 over 9.3 hours.
    expect(stats.hourly).toBe(Math.round((14_000 * 60) / 558))
  })

  it('keeps hourly in whole cents and refuses to divide by no time', () => {
    expect(hourlyRate(10_000, 180)).toBe(3_333)
    expect(hourlyRate(-10_000, 180)).toBe(-3_333)
    expect(hourlyRate(10_000, 0)).toBeNull()
  })

  it('leaves untimed sessions out of hourly but not out of profit', () => {
    const broken = session(3, [50_000], 60_000, { startedAt: 'garbage' })
    const stats = performanceStats(settledRows([win, broken]))
    expect(stats.gross).toBe(46_000)
    expect(stats.minutes).toBe(258)
    expect(stats.hourly).toBe(hourlyRate(36_000, 258))
  })

  it('has nothing to say about an empty record', () => {
    expect(performanceStats([])).toMatchObject({ sessions: 0, gross: 0, hourly: null, winRate: null, average: null, biggestWin: null, biggestLoss: null })
  })
})

describe('expenses and true net', () => {
  const expenses = [
    expense(3, 'tips', 2_500),
    expense(3, 'parking', 1_800),
    expense(2, 'food', 2_400),
    expense(1, 'hotel', 18_900),
    expense(1, 'tips', 2_000),
  ]

  it('totals each category, largest first, with its share', () => {
    expect(expenseTotal(expenses)).toBe(27_600)
    const categories = expensesByCategory(expenses)
    expect(categories.map((entry) => [entry.category, entry.amount, entry.count])).toEqual([
      ['hotel', 18_900, 1],
      ['tips', 4_500, 2],
      ['food', 2_400, 1],
      ['parking', 1_800, 1],
    ])
    expect(categories.reduce((sum, entry) => sum + entry.share, 0)).toBeCloseTo(1)
  })

  it('splits playing costs from trip costs, and an expense can override its category', () => {
    expect(expensesByScope(expenses)).toEqual({ playing: 6_300, trip: 21_300 })
    expect(expensesByScope([expense(1, 'food', 1_000, { scope: 'playing' })])).toEqual({ playing: 1_000, trip: 0 })
  })

  it('takes expenses off the gross result to give the true net', () => {
    expect(trueNet(842_000, expenses)).toEqual({ gross: 842_000, playing: 6_300, trip: 21_300, expenses: 27_600, net: 814_400 })
    expect(trueNet(-5_000, expenses).net).toBe(-32_600)
    expect(trueNet(10_000, []).net).toBe(10_000)
  })

  it('rounds shares to whole percentages that add up to 100', () => {
    expect(wholePercents([1, 1, 1])).toEqual([34, 33, 33])
    expect(wholePercents([18_900, 4_500, 2_400, 1_800]).reduce((sum, value) => sum + value)).toBe(100)
    expect(wholePercents([0, 0])).toEqual([0, 0])
  })
})

describe('bankroll', () => {
  const win = session(20, [50_000], 86_000)
  const loss = session(5, [50_000], 30_000)
  const data: ResultsData = {
    sessions: [win, loss],
    expenses: [expense(20, 'tips', 2_000, { sessionId: win.id }), expense(5, 'parking', 1_000)],
    transactions: [transaction(30, 'deposit', 1_000_000), transaction(10, 'withdrawal', 100_000)],
  }

  it('adds deposits, results and withdrawals, and takes off expenses', () => {
    // 10,000 + 360 - 20 - 1,000 - 200 - 10
    expect(bankrollBalance(data)).toBe(1_000_000 + 36_000 - 2_000 - 100_000 - 20_000 - 1_000)
  })

  it('keeps deposits and withdrawals out of poker profit, hourly and win rate', () => {
    const withMoves = performanceOverview(data, ALL_RESULTS, NOW)
    const without = performanceOverview({ ...data, transactions: [] }, ALL_RESULTS, NOW)
    expect(withMoves.stats).toEqual(without.stats)
    expect(withMoves.net).toEqual(without.net)
    expect(withMoves.stats.gross).toBe(16_000)
  })

  it('orders the ledger in time and labels every line', () => {
    expect(bankrollLedger(data).map((entry) => [entry.kind, entry.amount])).toEqual([
      ['deposit', 1_000_000],
      ['expense', -2_000],
      ['session', 36_000],
      ['withdrawal', -100_000],
      ['expense', -1_000],
      ['session', -20_000],
    ])
  })

  it('tracks the peak and the drawdown from it', () => {
    const series = bankrollSeries(data)
    expect(peakBankroll(series)).toEqual({ amount: 1_034_000, at: win.endedAt })
    expect(drawdownFromPeak(series)).toBe(913_000 - 1_034_000)
    expect(drawdownFromPeak(bankrollSeries({ ...data, sessions: [win], expenses: [], transactions: [] }))).toBe(0)
    expect(peakBankroll([])).toBeNull()
  })

  it('reports how the balance moved over a period, and why', () => {
    const series = bankrollSeries(data)
    expect(balanceAt(series, NOW - 15 * DAY)).toBe(1_034_000)
    expect(changeSince(series, NOW - 15 * DAY)).toEqual({
      start: 1_034_000,
      change: -121_000,
      poker: -20_000,
      expenses: -1_000,
      deposits: 0,
      withdrawals: -100_000,
    })
  })

  it('turns the ledger into one chart point per day', () => {
    const points = bankrollChartPoints(bankrollSeries(data))
    expect(points.map((point) => [point.balance, point.change, point.entries.length])).toEqual([
      [1_000_000, 1_000_000, 1],
      [1_034_000, 34_000, 2],
      [934_000, -100_000, 1],
      [913_000, -21_000, 2],
    ])
    expect(points[1]!.day).toBe('2026-09-16')
    expect(monthEndBalances(points).map((month) => [month.month, month.balance, month.change])).toEqual([
      ['2026-09', 934_000, 934_000],
      ['2026-10', 913_000, -21_000],
    ])
  })

  it('summarises the bankroll for the hero', () => {
    const overview = bankrollOverview(data, NOW)
    expect(overview).toMatchObject({ balance: 913_000, drawdown: -121_000, deposits: 1 })
    expect(overview.month.change).toBe(-21_000)
    expect(overview.thirtyDays.change).toBe(913_000 - 1_000_000)
    expect(overview.regularStakes).toEqual({ smallBlind: 200, bigBlind: 500 })
  })

  it('starts from zero when no starting bankroll has been entered', () => {
    expect(bankrollBalance({ sessions: [win], expenses: [], transactions: [] })).toBe(36_000)
  })
})

describe('breakdowns', () => {
  const rows = settledRows([
    session(30, [30_000], 51_000, { smallBlind: 100, bigBlind: 300, location: 'The Bicycle Casino', minutes: 300 }),
    session(20, [50_000], 90_000, { minutes: 240 }),
    session(10, [50_000], 30_000, { minutes: 120 }),
    session(5, [40_000], 50_000, { gameType: 'Pot-Limit Omaha', smallBlind: 100, bigBlind: 200, location: 'commerce casino ', minutes: 180 }),
  ])

  it('groups by casino, ignoring case and stray spaces', () => {
    expect(resultsByLocation(rows).map((group) => [group.label, group.sessions, group.result])).toEqual([
      ['Commerce Casino', 3, 30_000],
      ['The Bicycle Casino', 1, 21_000],
    ])
  })

  it('groups by stakes, smallest first, with hourly', () => {
    expect(resultsByStakes(rows).map((group) => [group.label, group.result, group.hourly])).toEqual([
      ['$1/$2', 10_000, hourlyRate(10_000, 180)],
      ['$1/$3', 21_000, hourlyRate(21_000, 300)],
      ['$2/$5', 20_000, hourlyRate(20_000, 360)],
    ])
  })

  it('groups by the games actually played', () => {
    expect(resultsByGame(rows).map((group) => group.label)).toEqual(["No-Limit Hold'em", 'Pot-Limit Omaha'])
  })

  it('names the stakes played most in the last 90 days as the regular stake', () => {
    expect(regularStakes(rows, NOW)).toEqual({ smallBlind: 200, bigBlind: 500 })
  })
})

describe('filters', () => {
  const commerce = session(3, [50_000], 60_000)
  const bike = session(40, [30_000], 20_000, { location: 'The Bicycle Casino', smallBlind: 100, bigBlind: 300 })
  const plo = session(200, [40_000], 45_000, { gameType: 'Pot-Limit Omaha', smallBlind: 100, bigBlind: 200 })
  const data: ResultsData = {
    sessions: [commerce, bike, plo],
    expenses: [
      expense(3, 'tips', 2_000, { sessionId: commerce.id }),
      expense(40, 'parking', 1_000, { location: 'The Bicycle Casino' }),
      expense(41, 'gas', 4_500),
    ],
    transactions: [transaction(300, 'deposit', 500_000)],
  }

  it('builds date windows from the presets', () => {
    expect(dateWindow(ALL_RESULTS, NOW)).toEqual({ start: null, end: null })
    expect(dateWindow({ ...ALL_RESULTS, preset: 'month' }, NOW).start).toBe(new Date(2026, 9, 1).getTime())
    expect(dateWindow({ ...ALL_RESULTS, preset: 'year' }, NOW).start).toBe(new Date(2026, 0, 1).getTime())
    expect(dateWindow({ ...ALL_RESULTS, preset: '30d' }, NOW).start).toBe(NOW - 30 * DAY)
    const custom = dateWindow({ ...ALL_RESULTS, preset: 'custom', from: '2026-08-01', to: '2026-08-31' }, NOW)
    expect(custom).toEqual({ start: new Date(2026, 7, 1).getTime(), end: new Date(2026, 8, 1).getTime() - 1 })
  })

  it('filters sessions and expenses by date, but never the bankroll entries', () => {
    const recent = filterResults(data, { ...ALL_RESULTS, preset: '30d' }, NOW)
    expect(recent.sessions).toEqual([commerce])
    expect(recent.expenses.map((entry) => entry.category)).toEqual(['tips'])
    expect(recent.transactions).toBe(data.transactions)
  })

  it('filters by casino, matching an expense by its session or its own location', () => {
    const bikeOnly = filterResults(data, { ...ALL_RESULTS, location: 'the bicycle casino' }, NOW)
    expect(bikeOnly.sessions).toEqual([bike])
    expect(bikeOnly.expenses.map((entry) => entry.category)).toEqual(['parking'])
  })

  it('filters by game and stakes, dropping expenses that belong to no session', () => {
    expect(filterResults(data, { ...ALL_RESULTS, game: 'Pot-Limit Omaha' }, NOW).sessions).toEqual([plo])
    const stakes = filterResults(data, { ...ALL_RESULTS, stakes: '200/500' }, NOW)
    expect(stakes.sessions).toEqual([commerce])
    expect(stakes.expenses.map((entry) => entry.category)).toEqual(['tips'])
  })

  it('offers only casinos, games and stakes that are in the record', () => {
    const options = filterOptions(data)
    expect(options.locations.map((option) => option.label)).toEqual(['Commerce Casino', 'The Bicycle Casino'])
    expect(options.games.map((option) => option.value)).toEqual(["No-Limit Hold'em", 'Pot-Limit Omaha'])
    expect(options.stakes.map((option) => option.label)).toEqual(['$1/$2', '$1/$3', '$2/$5'])
  })

  it('knows when a filter is on', () => {
    expect(isFiltered(ALL_RESULTS)).toBe(false)
    expect(isFiltered({ ...ALL_RESULTS, stakes: '200/500' })).toBe(true)
  })

  it('recomputes the figures for the filtered view', () => {
    const overview = performanceOverview(data, { ...ALL_RESULTS, preset: '90d' }, NOW)
    expect(overview.stats.sessions).toBe(2)
    expect(overview.stats.gross).toBe(10_000 - 10_000)
    expect(overview.net.expenses).toBe(7_500)
    expect(overview.sessionExpenses.get(commerce.id)).toBe(2_000)
  })
})
