import { useState } from 'react'
import { formatCents } from '../../domain/money'
import type { Expense } from '../../domain/results/models'
import { wholePercents, type CategoryTotal, type TrueNet } from '../../domain/results/stats'
import { CategoryIcon } from './CategoryIcon'
import { categoryLabel, shortDate } from './resultsText'
import './results.css'

/**
 * The true cost of poker: spending by category as brass bars (length against
 * the largest category, share of the total printed), then the individual
 * expenses as receipt lines.
 */
export function ExpenseBreakdown({
  categories,
  expenses,
  net,
  now,
  sessionLabel,
  onAdd,
  onRemove,
}: {
  categories: CategoryTotal[]
  expenses: Expense[]
  net: TrueNet
  now: number
  /** "Commerce Casino, Oct 4" for an expense's session, if it has one. */
  sessionLabel: (sessionId: string) => string | null
  onAdd: () => void
  onRemove: (expense: Expense) => void
}) {
  const [showAll, setShowAll] = useState(false)
  const largest = categories[0]?.amount ?? 0
  const percents = wholePercents(categories.map((entry) => entry.amount))
  const shown = showAll ? expenses : expenses.slice(0, 6)

  return (
    <section aria-labelledby="expenses-heading" className="rs-panel p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="expenses-heading" className="label">
            True cost of poker
          </h2>
          {expenses.length > 0 && (
            <>
              <p className="text-2xl font-semibold tracking-tight text-bone-50 tabular">{formatCents(net.expenses)}</p>
              <p className="text-xs text-room-400 tabular">
                Playing {formatCents(net.playing)} · Trip {formatCents(net.trip)}
              </p>
            </>
          )}
        </div>
        <button type="button" onClick={onAdd} className="btn-primary h-11">
          Add expense
        </button>
      </div>

      {expenses.length === 0 ? (
        <div className="rs-well mt-4 px-4 py-6 text-center">
          <p className="font-semibold">No expenses recorded yet.</p>
          <p className="mx-auto mt-1 max-w-xs text-sm text-room-400">
            Tips, parking, food and travel come off your true net, not your poker result.
          </p>
        </div>
      ) : (
        <>
          <ul className="mt-4 space-y-3" aria-label="Expenses by category">
            {categories.map((entry, index) => (
              <li key={entry.category}>
                <div className="flex items-center gap-2.5 text-sm">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-room-850 text-brass-300">
                    <CategoryIcon category={entry.category} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-bone-50">{categoryLabel(entry.category)}</span>
                  <span className="font-semibold tabular">{formatCents(entry.amount)}</span>
                  <span className="w-10 text-right text-xs text-room-400 tabular">{percents[index]}%</span>
                </div>
                <svg aria-hidden="true" viewBox="0 0 100 4" preserveAspectRatio="none" className="mt-1.5 block h-1.5 w-full">
                  <rect className="rs-bar-track" width="100" height="4" rx="2" />
                  <rect className="rs-bar" width={largest > 0 ? (entry.amount / largest) * 100 : 0} height="4" rx="2" />
                </svg>
              </li>
            ))}
          </ul>

          <h3 className="label mt-6">Recent expenses</h3>
          <ul className="rs-receipt">
            {shown.map((expense) => {
              const context = [expense.sessionId ? sessionLabel(expense.sessionId) : null, expense.sessionId ? null : expense.location || null, expense.note || null]
                .filter(Boolean)
                .join(' · ')
              return (
                <li key={expense.id} className="flex items-center gap-2 py-2 text-sm">
                  <span className="w-14 shrink-0 text-xs text-room-400 tabular">{shortDate(expense.date, now)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-bone-50">{categoryLabel(expense.category)}</span>
                    {context && <span className="block truncate text-xs text-room-400">{context}</span>}
                  </span>
                  <span className="shrink-0 font-semibold tabular">{formatCents(expense.amount)}</span>
                  <button
                    type="button"
                    onClick={() => onRemove(expense)}
                    className="btn-ghost -mr-2 h-11 w-11 shrink-0 px-0"
                    aria-label={`Remove ${formatCents(expense.amount)} ${categoryLabel(expense.category).toLowerCase()} expense from ${shortDate(expense.date, now)}`}
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                </li>
              )
            })}
          </ul>
          {expenses.length > 6 && (
            <button type="button" onClick={() => setShowAll((value) => !value)} className="btn-ghost mt-1 w-full">
              {showAll ? 'Show fewer' : `Show all ${expenses.length} expenses`}
            </button>
          )}
        </>
      )}
    </section>
  )
}
