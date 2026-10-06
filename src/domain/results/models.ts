import type { Cents } from '../money'
import type { Session } from '../poker/models'

/**
 * The Results / bankroll model.
 *
 * Three kinds of money movement are kept apart on purpose, and nothing in this
 * folder ever folds one into another:
 *
 * - **Poker results**: what came off the table (cash-out minus buy-ins). Derived
 *   from sessions; never stored here.
 * - **Expenses**: money spent because of poker -- tips, parking, food, travel.
 *   They reduce the true net, never the poker result or the win rate.
 * - **Bankroll transactions**: money the player deliberately adds to or takes out
 *   of the poker bankroll. They move the balance only; they are not results.
 *
 * Ids are UUIDs and records carry `createdAt`/`updatedAt`, like sessions, so a
 * server-side store can take them over unchanged.
 */

/** What Results reads from a session. A stored `Session` satisfies it as is. */
export type ResultsSession = Pick<
  Session,
  | 'id'
  | 'startedAt'
  | 'endedAt'
  | 'location'
  | 'gameType'
  | 'smallBlind'
  | 'bigBlind'
  | 'tableSize'
  | 'buyIns'
  | 'cashOut'
>

export const EXPENSE_CATEGORIES = [
  'tips',
  'food',
  'parking',
  'gas',
  'mileage',
  'rideshare',
  'hotel',
  'travel',
  'tournament',
  'other',
] as const

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]

/**
 * `playing`: a cost of sitting down at all (dealer tips, casino parking,
 * tournament fees). `trip`: a cost of getting there and being there (food,
 * fuel, hotels, flights). Every category has a default; any expense can say
 * otherwise.
 */
export type ExpenseScope = 'playing' | 'trip'

export interface Expense {
  id: string
  category: ExpenseCategory
  /** Positive cents. */
  amount: Cents
  /** When it was spent (ISO). */
  date: string
  /** The session it belongs to, if any. */
  sessionId: string | null
  location: string
  note: string
  scope: ExpenseScope
  createdAt: string
  updatedAt: string
}

export type BankrollTransactionKind = 'deposit' | 'withdrawal'

/**
 * Money the player moves into or out of their poker bankroll. SessionTracker
 * holds no money; this is the player's own record of what they set aside.
 */
export interface BankrollTransaction {
  id: string
  kind: BankrollTransactionKind
  /** Positive cents; the kind gives the direction. */
  amount: Cents
  date: string
  note: string
  createdAt: string
  updatedAt: string
}

export interface ResultsData {
  sessions: readonly ResultsSession[]
  expenses: readonly Expense[]
  transactions: readonly BankrollTransaction[]
}
