import { newId } from '../domain/poker/factories'
import type { BankrollTransaction, Expense, ExpenseCategory, ResultsData, ResultsSession } from '../domain/results/models'
import { EXPENSE_CATEGORY_INFO } from '../domain/results/stats'

/**
 * DEMO DATA -- not the user's sessions.
 *
 * A made-up six-month record for previewing Results: a winning but ordinary
 * $1/$3 -> $2/$5 player in Los Angeles with one Las Vegas trip. Values are
 * deliberately unremarkable. Everything here is in this one file so it can be
 * deleted when expenses and bankroll entries are stored for real.
 *
 * Dates are relative to `now`, so date filters always have something to show.
 */

const DAY = 24 * 60 * 60_000

type DemoGame = 'NLH' | 'PLO'

/** [days ago, start hour, minutes, location, game, small blind $, big blind $, buy-ins $, cash-out $] */
type DemoSessionRow = [number, number, number, string, DemoGame, number, number, number[], number]

const COMMERCE = 'Commerce Casino'
const BIKE = 'The Bicycle Casino'
const HUSTLER = 'Hustler Casino'
const GARDENS = 'The Gardens Casino'
const BELLAGIO = 'Bellagio, Las Vegas'

const SESSIONS: DemoSessionRow[] = [
  [168, 18, 300, COMMERCE, 'NLH', 1, 3, [400], 612],
  [165, 19, 240, COMMERCE, 'NLH', 1, 3, [400, 300], 350],
  [161, 17, 330, BIKE, 'NLH', 1, 3, [500], 905],
  [158, 20, 180, COMMERCE, 'NLH', 1, 3, [400], 400],
  [154, 18, 360, HUSTLER, 'NLH', 2, 5, [1000], 1420],
  [150, 19, 270, COMMERCE, 'NLH', 1, 3, [400], 155],
  [147, 18, 300, GARDENS, 'PLO', 1, 2, [400], 690],
  [143, 20, 240, COMMERCE, 'NLH', 2, 5, [1000, 500], 640],
  [140, 17, 420, COMMERCE, 'NLH', 1, 3, [500], 1210],
  [136, 19, 210, BIKE, 'NLH', 1, 3, [400], 318],
  [132, 18, 330, HUSTLER, 'NLH', 2, 5, [1000], 1885],
  [128, 19, 285, COMMERCE, 'NLH', 2, 5, [1000], 1060],
  [124, 18, 240, GARDENS, 'PLO', 1, 2, [400, 400], 412],
  [120, 17, 390, COMMERCE, 'NLH', 2, 5, [1000], 1745],
  [116, 20, 180, COMMERCE, 'NLH', 1, 3, [400], 512],
  [112, 18, 300, BIKE, 'NLH', 2, 5, [1000], 455],
  [108, 19, 345, HUSTLER, 'NLH', 2, 5, [1000], 1320],
  [104, 18, 255, COMMERCE, 'NLH', 2, 5, [1000, 1000], 1080],
  [99, 17, 360, COMMERCE, 'NLH', 2, 5, [1000], 1630],
  [95, 19, 240, GARDENS, 'PLO', 1, 2, [400], 755],
  [91, 18, 300, COMMERCE, 'NLH', 2, 5, [1000], 1005],
  [86, 20, 270, HUSTLER, 'NLH', 2, 5, [1000], 610],
  [80, 15, 360, BELLAGIO, 'NLH', 2, 5, [1000], 1740],
  [79, 20, 300, BELLAGIO, 'NLH', 5, 10, [2000], 3480],
  [78, 14, 240, BELLAGIO, 'NLH', 2, 5, [1000, 1000], 1270],
  [72, 18, 330, COMMERCE, 'NLH', 2, 5, [1000], 1515],
  [68, 19, 240, BIKE, 'NLH', 1, 3, [400], 260],
  [64, 17, 390, COMMERCE, 'NLH', 2, 5, [1000], 1890],
  [60, 18, 300, HUSTLER, 'NLH', 2, 5, [1000], 820],
  [55, 19, 270, COMMERCE, 'NLH', 2, 5, [1000, 500], 2210],
  [50, 18, 210, GARDENS, 'PLO', 1, 2, [400], 236],
  [45, 17, 360, COMMERCE, 'NLH', 2, 5, [1000], 1410],
  [40, 19, 300, HUSTLER, 'NLH', 2, 5, [1000], 455],
  [34, 18, 330, COMMERCE, 'NLH', 2, 5, [1000], 1675],
  [29, 20, 240, BIKE, 'NLH', 2, 5, [1000], 1290],
  [24, 18, 300, COMMERCE, 'NLH', 2, 5, [1000, 1000], 1160],
  [19, 17, 390, COMMERCE, 'NLH', 2, 5, [1000], 1960],
  [14, 19, 270, HUSTLER, 'NLH', 2, 5, [1000], 1335],
  [9, 18, 258, COMMERCE, 'NLH', 2, 5, [500], 860],
  [5, 19, 240, GARDENS, 'PLO', 1, 2, [400], 330],
  [2, 18, 300, COMMERCE, 'NLH', 2, 5, [1000], 1220],
]

const GAME_NAMES: Record<DemoGame, string> = { NLH: "No-Limit Hold'em", PLO: 'Pot-Limit Omaha' }

/** Valet at the rooms that charge for it. */
const PARKING: Partial<Record<string, number>> = { [BIKE]: 10, [HUSTLER]: 8 }

/** [days ago, category, $, location, note] -- the Las Vegas trip and a few one-offs. */
const EXTRA_EXPENSES: [number, ExpenseCategory, number, string, string][] = [
  [81, 'travel', 286, '', 'LAX to LAS, round trip'],
  [81, 'rideshare', 32, BELLAGIO, 'Airport to hotel'],
  [78, 'hotel', 389, BELLAGIO, 'Two nights'],
  [78, 'food', 142, BELLAGIO, 'Meals over the trip'],
  [77, 'rideshare', 34, BELLAGIO, 'Hotel to airport'],
  [133, 'tournament', 150, COMMERCE, 'Deepstack entry'],
  [70, 'mileage', 38, GARDENS, 'Round trip, 57 miles'],
  [26, 'other', 25, '', 'Card protector'],
]

/** [days ago, kind, $, note] */
const TRANSACTIONS: [number, BankrollTransaction['kind'], number, string][] = [
  [170, 'deposit', 8000, 'Starting bankroll'],
  [130, 'deposit', 2000, 'Added before moving up to $2/$5'],
  [75, 'withdrawal', 1000, 'Moved to liferoll after Las Vegas'],
  [21, 'withdrawal', 1500, 'Moved to liferoll'],
]

const cents = (dollars: number) => Math.round(dollars * 100)

/** Expenses spent during a session land a little after it starts. */
const during = (startedAt: number, offsetMinutes: number) => new Date(startedAt + offsetMinutes * 60_000).toISOString()

/** Local `hour` on the day `daysAgo` days before `now`. */
function at(now: number, daysAgo: number, hour: number): number {
  const date = new Date(now - daysAgo * DAY)
  date.setHours(hour, 0, 0, 0)
  return date.getTime()
}

export function buildDemoResults(now: number = Date.now()): ResultsData {
  const stamp = new Date(now).toISOString()
  const sessions: ResultsSession[] = []
  const expenses: Expense[] = []

  const expense = (
    category: ExpenseCategory,
    dollars: number,
    date: string,
    location: string,
    note: string,
    sessionId: string | null,
  ): Expense => ({
    id: newId(),
    category,
    amount: cents(dollars),
    date,
    sessionId,
    location,
    note,
    scope: EXPENSE_CATEGORY_INFO[category].scope,
    createdAt: stamp,
    updatedAt: stamp,
  })

  SESSIONS.forEach(([daysAgo, hour, minutes, location, game, sb, bb, buyIns, cashOut], index) => {
    const start = at(now, daysAgo, hour)
    const id = newId()
    sessions.push({
      id,
      startedAt: new Date(start).toISOString(),
      endedAt: new Date(start + minutes * 60_000).toISOString(),
      location,
      gameType: GAME_NAMES[game],
      smallBlind: cents(sb),
      bigBlind: cents(bb),
      tableSize: game === 'PLO' ? 6 : 9,
      buyIns: buyIns.map((amount, buyIn) => ({ id: newId(), amount: cents(amount), at: during(start, buyIn * 90) })),
      cashOut: cents(cashOut),
    })

    const won = cashOut > buyIns.reduce((sum, amount) => sum + amount, 0)
    // Dealer tips: a little per hour, more on a winning night.
    const tips = Math.round(((minutes / 60) * (bb >= 5 ? 3 : 2) + (won ? 6 : 0)) / 5) * 5
    expenses.push(expense('tips', tips, during(start, minutes), location, '', id))
    const parking = PARKING[location]
    if (parking) expenses.push(expense('parking', parking, during(start, 0), location, 'Valet', id))
    if (minutes >= 300 && location !== BELLAGIO) {
      expenses.push(expense('food', 16 + ((index * 7) % 13), during(start, 150), location, 'Dinner', id))
    }
    if (index % 5 === 2 && location !== BELLAGIO) {
      expenses.push(expense('gas', 42 + (index % 3) * 4, during(start, -30), '', 'Fill-up', null))
    }
  })

  for (const [daysAgo, category, dollars, location, note] of EXTRA_EXPENSES) {
    expenses.push(expense(category, dollars, new Date(at(now, daysAgo, 12)).toISOString(), location, note, null))
  }

  const transactions: BankrollTransaction[] = TRANSACTIONS.map(([daysAgo, kind, dollars, note]) => ({
    id: newId(),
    kind,
    amount: cents(dollars),
    date: new Date(at(now, daysAgo, 10)).toISOString(),
    note,
    createdAt: stamp,
    updatedAt: stamp,
  }))

  return { sessions, expenses, transactions }
}
