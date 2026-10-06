import type { BankrollTransaction, Expense } from '../domain/results/models'

/**
 * Where expenses and bankroll entries live.
 *
 * Same shape as the session repositories: Results talks to these interfaces,
 * never to a storage engine. For now the only implementation is in memory --
 * entries last until the page is reloaded. A D1-backed implementation of the
 * same methods replaces it when accounts arrive; the screens do not change.
 */

export interface ExpenseRepository {
  list(): Promise<Expense[]>
  save(expense: Expense): Promise<void>
  remove(id: string): Promise<void>
}

export interface BankrollRepository {
  list(): Promise<BankrollTransaction[]>
  save(transaction: BankrollTransaction): Promise<void>
  remove(id: string): Promise<void>
}

export interface ResultsRepositories {
  expenses: ExpenseRepository
  bankroll: BankrollRepository
  /** False while entries are only held in memory. */
  persistent: boolean
}

function memoryCollection<T extends { id: string }>(seed: readonly T[]) {
  let items = [...seed]
  return {
    list: async () => [...items],
    save: async (item: T) => {
      items = [item, ...items.filter((entry) => entry.id !== item.id)]
    },
    remove: async (id: string) => {
      items = items.filter((entry) => entry.id !== id)
    },
  }
}

export function memoryResultsRepositories(
  seed: { expenses?: readonly Expense[]; transactions?: readonly BankrollTransaction[] } = {},
): ResultsRepositories {
  return {
    expenses: memoryCollection(seed.expenses ?? []),
    bankroll: memoryCollection(seed.transactions ?? []),
    persistent: false,
  }
}
