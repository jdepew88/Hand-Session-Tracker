import { formatCents } from '../../domain/money'
import { stakesLabel } from '../../domain/poker/factories'
import type { BankrollOverview } from '../../domain/results/overview'
import { ChipColumns } from '../table/ChipStack'
import { BankrollChart } from './BankrollChart'
import { bankrollChartSummary, rackHeights, shortDate, signed } from './resultsText'
import './results.css'

/**
 * 401G: the poker bankroll.
 *
 * The balance is the authority; the chip rack beside it is a quiet picture of
 * how close it sits to its peak. Below it, the curve and four plain facts --
 * no advice about what the bankroll should be.
 */
export function BankrollHero({
  bankroll,
  now,
  onAddFunds,
  onWithdraw,
}: {
  bankroll: BankrollOverview
  now: number
  onAddFunds: () => void
  onWithdraw: () => void
}) {
  const { balance, month, thirtyDays, peak, drawdown, points } = bankroll
  const monthPercent = month.start > 0 && month.change !== 0 ? (month.change / month.start) * 100 : null
  const heights = rackHeights(balance, peak?.amount ?? 0)

  return (
    <section aria-labelledby="bankroll-heading" className="rs-hero p-4 sm:p-6">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] lg:gap-8">
        <div className="flex flex-col">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="flex flex-wrap items-center gap-2">
                <span className="rs-badge text-sm">401G</span>
              </p>
              <h2 id="bankroll-heading" className="mt-2 text-sm font-medium text-brass-200">
                Your poker bankroll
              </h2>
            </div>
            {heights.length > 0 && (
              <span aria-hidden="true" className="rs-rack mt-1 shrink-0">
                <ChipColumns heights={heights} seed={1} />
              </span>
            )}
          </div>

          <p className="rs-emboss mt-3 text-[2.6rem] font-semibold leading-none tabular sm:text-5xl">
            {formatCents(balance)}
          </p>
          <p className="mt-2 text-sm text-room-300 tabular">
            <span className="font-semibold text-bone-50">{signed(month.change)}</span> this month
            {monthPercent !== null && (
              <span className="text-room-400">
                {' '}
                · {monthPercent > 0 ? '+' : ''}
                {monthPercent.toFixed(1)}%
              </span>
            )}
          </p>
          {(month.deposits !== 0 || month.withdrawals !== 0 || month.expenses !== 0) && (
            <p className="mt-0.5 text-xs text-room-400 tabular">
              Poker {signed(month.poker)}
              {month.expenses !== 0 && <> · Expenses {signed(month.expenses)}</>}
              {month.deposits !== 0 && <> · Added {formatCents(month.deposits)}</>}
              {month.withdrawals !== 0 && <> · Withdrawn {formatCents(-month.withdrawals)}</>}
            </p>
          )}

          <div className="mt-5 grid grid-cols-2 gap-2">
            <button type="button" onClick={onAddFunds} className="btn-secondary h-11 px-2">
              Add funds
            </button>
            <button type="button" onClick={onWithdraw} className="btn-secondary h-11 px-2">
              Withdraw funds
            </button>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-room-400">
            Keep your bankroll separate from your liferoll.
            {bankroll.deposits === 0 && (
              <> Add your starting bankroll so this balance reflects the money you set aside for poker.</>
            )}
          </p>
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          {points.length > 1 ? (
            <div className="rs-well p-2 sm:p-3">
              <BankrollChart points={points} summary={bankrollChartSummary(points, now)} now={now} />
            </div>
          ) : (
            <p className="rs-well p-4 text-sm text-room-400">
              The bankroll curve appears once there is more than one day of activity.
            </p>
          )}

          <dl className="rs-well grid grid-cols-2 gap-x-4 gap-y-3 p-3 text-sm sm:grid-cols-4">
            <HealthStat
              label="Regular stake"
              value={bankroll.regularStakes ? stakesLabel(bankroll.regularStakes) : '—'}
              note={bankroll.regularStakes ? 'Most hours, 90 days' : undefined}
            />
            <HealthStat label="30 days" value={signed(thirtyDays.change)} note="Bankroll change" />
            <HealthStat
              label="Peak"
              value={peak ? formatCents(peak.amount) : '—'}
              note={peak ? shortDate(peak.at, now) : undefined}
            />
            <HealthStat
              label="From peak"
              value={drawdown === 0 ? 'At peak' : signed(drawdown)}
              note={drawdown === 0 ? undefined : 'Drawdown'}
            />
          </dl>
        </div>
      </div>
    </section>
  )
}

function HealthStat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.68rem] uppercase tracking-wide text-room-400">{label}</dt>
      <dd className="font-semibold text-bone-50 tabular">{value}</dd>
      {note && <dd className="text-[0.7rem] text-room-400">{note}</dd>}
    </div>
  )
}
