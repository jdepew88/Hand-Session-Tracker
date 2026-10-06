import { formatCents } from '../../domain/money'
import type { BankrollTransaction } from '../../domain/results/models'
import { shortDate, transactionHeadline } from './resultsText'
import './results.css'

/**
 * Money moved into or out of the bankroll. Shown in brass and ivory, never in
 * result green/red: adding $2,000 is not winning $2,000.
 */
export function BankrollActivity({
  transactions,
  now,
  onRemove,
}: {
  transactions: readonly BankrollTransaction[]
  now: number
  onRemove: (transaction: BankrollTransaction) => void
}) {
  return (
    <section aria-labelledby="bankroll-activity-heading" className="rs-panel p-4 sm:p-5">
      <h2 id="bankroll-activity-heading" className="label">
        Bankroll activity
      </h2>
      <p className="text-xs text-room-400">Deposits and withdrawals. They move the bankroll, not your poker results.</p>
      {transactions.length === 0 ? (
        <p className="rs-well mt-3 px-4 py-5 text-center text-sm text-room-400">No deposits or withdrawals yet.</p>
      ) : (
        <ul className="rs-receipt mt-2">
          {transactions.map((transaction) => (
            <li key={transaction.id} className="flex items-center gap-3 py-2.5 text-sm">
              <span
                aria-hidden="true"
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border text-base leading-none ${
                  transaction.kind === 'deposit'
                    ? 'border-brass-400/50 text-brass-200'
                    : 'border-room-500 text-room-300'
                }`}
              >
                {transaction.kind === 'deposit' ? '+' : '−'}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-bone-50">{transactionHeadline(transaction)}</span>
                <span className="block truncate text-xs text-room-400">
                  {shortDate(transaction.date, now)}
                  {transaction.note && ` · ${transaction.note}`}
                </span>
              </span>
              <span className="shrink-0 font-semibold text-brass-200 tabular">
                {transaction.kind === 'deposit' ? '+' : '-'}
                {formatCents(transaction.amount)}
              </span>
              <button
                type="button"
                onClick={() => onRemove(transaction)}
                className="btn-ghost -mr-2 h-11 w-11 shrink-0 px-0"
                aria-label={`Remove: ${transactionHeadline(transaction)}, ${shortDate(transaction.date, now)}`}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
