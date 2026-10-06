import { createContext, useContext } from 'react'
import type { BankrollTransaction, Expense, ResultsData } from '../domain/results/models'

/** Which set of records Results is showing: the player's own, or the demo. */
export type ResultsBook = 'yours' | 'demo'

export interface ResultsEntries {
  expenses: Expense[]
  transactions: BankrollTransaction[]
}

export interface ResultsStoreValue {
  ready: boolean
  /** False while expenses and bankroll entries are only held in memory. */
  persistent: boolean
  /** The player's own expenses and bankroll entries. Their sessions come from the main store. */
  yours: ResultsEntries
  /** The complete demo record, sessions included. */
  demo: ResultsData
  saveExpense: (book: ResultsBook, expense: Expense) => Promise<void>
  removeExpense: (book: ResultsBook, id: string) => Promise<void>
  saveTransaction: (book: ResultsBook, transaction: BankrollTransaction) => Promise<void>
  removeTransaction: (book: ResultsBook, id: string) => Promise<void>
}

export const ResultsContext = createContext<ResultsStoreValue | null>(null)

export function useResultsStore(): ResultsStoreValue {
  const value = useContext(ResultsContext)
  if (!value) throw new Error('useResultsStore must be used inside <ResultsProvider>')
  return value
}
