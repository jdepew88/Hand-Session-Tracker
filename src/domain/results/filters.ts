import { stakesLabel } from '../poker/factories'
import type { ResultsData, ResultsSession } from './models'

/**
 * The Results filter: a date window plus casino, game and stakes.
 *
 * Sessions are matched on when they started. Expenses are matched on their
 * own date; for casino, game or stakes they must belong to a matching session
 * (or, for casino, name that casino themselves) -- an expense with no session
 * cannot be said to belong to "$2/$5", so it is left out of that view.
 *
 * Bankroll transactions are never filtered: the bankroll is one pot of money,
 * not one per casino.
 */

export type DatePreset = 'all' | 'year' | '90d' | '30d' | 'month' | 'custom'

export const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: 'year', label: 'This year' },
  { value: '90d', label: 'Last 90 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'month', label: 'This month' },
  { value: 'custom', label: 'Custom' },
]

export interface ResultsFilter {
  preset: DatePreset
  /** Custom range, "2026-07-01", inclusive. */
  from: string | null
  to: string | null
  /** Lower-cased location, or null for every casino. */
  location: string | null
  game: string | null
  /** "200/500" (cents), or null for all stakes. */
  stakes: string | null
}

export const ALL_RESULTS: ResultsFilter = { preset: 'all', from: null, to: null, location: null, game: null, stakes: null }

const DAY = 24 * 60 * 60_000

/** "2026-07-01" as local midnight; null if it is not a date. */
function parseDay(value: string | null): number | null {
  if (!value) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const time = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getTime()
  return Number.isNaN(time) ? null : time
}

/** Inclusive millisecond window; null ends are open. */
export function dateWindow(filter: ResultsFilter, now: number = Date.now()): { start: number | null; end: number | null } {
  const today = new Date(now)
  switch (filter.preset) {
    case 'all':
      return { start: null, end: null }
    case 'year':
      return { start: new Date(today.getFullYear(), 0, 1).getTime(), end: null }
    case 'month':
      return { start: new Date(today.getFullYear(), today.getMonth(), 1).getTime(), end: null }
    case '90d':
      return { start: now - 90 * DAY, end: null }
    case '30d':
      return { start: now - 30 * DAY, end: null }
    case 'custom': {
      const start = parseDay(filter.from)
      const toDay = parseDay(filter.to)
      // The end day is included in full.
      const end = toDay === null ? null : new Date(toDay).setDate(new Date(toDay).getDate() + 1) - 1
      return { start, end }
    }
  }
}

const inWindow = (iso: string, window: { start: number | null; end: number | null }) => {
  const time = Date.parse(iso)
  if (Number.isNaN(time)) return false
  return (window.start === null || time >= window.start) && (window.end === null || time <= window.end)
}

export const sessionStakesKey = (session: Pick<ResultsSession, 'smallBlind' | 'bigBlind'>) =>
  `${session.smallBlind}/${session.bigBlind}`

const locationKey = (location: string) => location.trim().toLowerCase()

export function isFiltered(filter: ResultsFilter): boolean {
  return filter.preset !== 'all' || filter.location !== null || filter.game !== null || filter.stakes !== null
}

export function filterResults(data: ResultsData, filter: ResultsFilter, now: number = Date.now()): ResultsData {
  const window = dateWindow(filter, now)
  const sessionMatches = (session: ResultsSession) =>
    (filter.location === null || locationKey(session.location) === filter.location) &&
    (filter.game === null || session.gameType === filter.game) &&
    (filter.stakes === null || sessionStakesKey(session) === filter.stakes)

  const sessions = data.sessions.filter((session) => inWindow(session.startedAt, window) && sessionMatches(session))
  const byId = new Map(data.sessions.map((session) => [session.id, session]))

  const expenses = data.expenses.filter((expense) => {
    if (!inWindow(expense.date, window)) return false
    const session = expense.sessionId ? byId.get(expense.sessionId) : undefined
    if (filter.game !== null || filter.stakes !== null) return session !== undefined && sessionMatches(session)
    if (filter.location !== null) {
      return session ? locationKey(session.location) === filter.location : locationKey(expense.location) === filter.location
    }
    return true
  })

  return { sessions, expenses, transactions: data.transactions }
}

export interface FilterOption {
  value: string
  label: string
}

/** The casinos, games and stakes that appear in the data -- nothing invented. */
export function filterOptions(data: ResultsData): { locations: FilterOption[]; games: FilterOption[]; stakes: FilterOption[] } {
  const locations = new Map<string, string>()
  const games = new Set<string>()
  const stakes = new Map<string, ResultsSession>()
  for (const session of data.sessions) {
    const name = session.location.trim()
    if (name && !locations.has(locationKey(name))) locations.set(locationKey(name), name)
    games.add(session.gameType)
    stakes.set(sessionStakesKey(session), session)
  }
  return {
    locations: [...locations.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    games: [...games].sort().map((game) => ({ value: game, label: game })),
    stakes: [...stakes.entries()]
      .sort(([, a], [, b]) => a.bigBlind - b.bigBlind || a.smallBlind - b.smallBlind)
      .map(([value, session]) => ({ value, label: stakesLabel(session) })),
  }
}
