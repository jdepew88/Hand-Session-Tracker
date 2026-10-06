import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { buildDemoResults } from '../demo/resultsDemo'
import type { BankrollTransaction, Expense, ResultsData } from '../domain/results/models'
import { memoryResultsRepositories, type ResultsRepositories } from '../storage/resultsRepositories'
import { ResultsContext, type ResultsBook, type ResultsEntries, type ResultsStoreValue } from './resultsContext'

const byNewest = <T extends { date: string }>(a: T, b: T) => b.date.localeCompare(a.date)

/**
 * Expenses and bankroll entries, the player's own and the demo's, kept apart.
 *
 * Mirrors `StoreProvider`: load once, write through the repository first, then
 * update what is on screen. The demo book is its own in-memory repository
 * seeded from `buildDemoResults`, so trying the forms in the demo never
 * touches the player's records.
 */
export function ResultsProvider({
  children,
  repositories,
}: {
  children: ReactNode
  repositories?: ResultsRepositories
}) {
  const [yoursRepositories] = useState(() => repositories ?? memoryResultsRepositories())
  const [demoSeed] = useState<ResultsData>(() => buildDemoResults())
  const [demoRepositories] = useState(() =>
    memoryResultsRepositories({ expenses: demoSeed.expenses, transactions: demoSeed.transactions }),
  )

  const [ready, setReady] = useState(false)
  const [yours, setYours] = useState<ResultsEntries>({ expenses: [], transactions: [] })
  const [demoEntries, setDemoEntries] = useState<ResultsEntries>({
    expenses: [...demoSeed.expenses].sort(byNewest),
    transactions: [...demoSeed.transactions].sort(byNewest),
  })

  const repositoriesFor = useCallback(
    (book: ResultsBook) => (book === 'yours' ? yoursRepositories : demoRepositories),
    [yoursRepositories, demoRepositories],
  )
  const setterFor = useCallback((book: ResultsBook) => (book === 'yours' ? setYours : setDemoEntries), [])

  const refresh = useCallback(
    async (book: ResultsBook) => {
      const store = repositoriesFor(book)
      const [expenses, transactions] = await Promise.all([store.expenses.list(), store.bankroll.list()])
      setterFor(book)({ expenses: expenses.sort(byNewest), transactions: transactions.sort(byNewest) })
    },
    [repositoriesFor, setterFor],
  )

  // Load the player's entries once, from whatever store backs them.
  useEffect(() => {
    void refresh('yours').finally(() => setReady(true))
  }, [refresh])

  const value = useMemo<ResultsStoreValue>(
    () => ({
      ready,
      persistent: yoursRepositories.persistent,
      yours,
      demo: { sessions: demoSeed.sessions, ...demoEntries },
      async saveExpense(book, expense: Expense) {
        await repositoriesFor(book).expenses.save(expense)
        await refresh(book)
      },
      async removeExpense(book, id) {
        await repositoriesFor(book).expenses.remove(id)
        await refresh(book)
      },
      async saveTransaction(book, transaction: BankrollTransaction) {
        await repositoriesFor(book).bankroll.save(transaction)
        await refresh(book)
      },
      async removeTransaction(book, id) {
        await repositoriesFor(book).bankroll.remove(id)
        await refresh(book)
      },
    }),
    [ready, yoursRepositories, yours, demoSeed, demoEntries, repositoriesFor, refresh],
  )

  return <ResultsContext value={value}>{children}</ResultsContext>
}
