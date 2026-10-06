import { formatCents } from '../../domain/money'
import type { TrueNet } from '../../domain/results/stats'
import { TONE_CLASS, signed, toneOf } from './resultsText'
import './results.css'

/**
 * Gross poker result, minus expenses, equals true net -- written out as a
 * ledger sum, with a bar showing how much of the winnings the expenses used.
 * Informational: no judgement about the spending.
 */
export function TrueNetEquation({ net }: { net: TrueNet }) {
  const spentShare = net.gross > 0 ? Math.min(1, net.expenses / net.gross) : null

  return (
    <section aria-labelledby="true-net-heading" className="rs-panel flex flex-col p-4 sm:p-5">
      <h2 id="true-net-heading" className="label">
        Winnings vs. true net
      </h2>
      <p className="text-sm text-room-300">
        Winning at poker and making money from poker are related, but not the same.
      </p>

      <dl className="mt-4 text-sm tabular">
        <Line label="Poker winnings" sub="Cash-outs minus buy-ins" value={signed(net.gross)} tone={toneOf(net.gross)} />
        <Line label="Playing costs" sub="Tips, parking, fees" value={minus(net.playing)} />
        <Line label="Trip costs" sub="Food, travel, hotels" value={minus(net.trip)} />
        <div className="rs-total mt-2 flex items-baseline justify-between gap-3 pt-3">
          <dt className="text-xs font-bold uppercase tracking-[0.14em] text-bone-50">True net</dt>
          <dd className={`text-2xl font-semibold tracking-tight ${TONE_CLASS[toneOf(net.net)]}`}>{signed(net.net)}</dd>
        </div>
      </dl>

      {spentShare !== null && net.expenses > 0 && (
        <div className="mt-4">
          <svg aria-hidden="true" viewBox="0 0 100 8" preserveAspectRatio="none" className="block h-3 w-full">
            <defs>
              <pattern id="rs-hatch" width="3" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect className="rs-hatch-bg" width="3" height="8" />
                <line className="rs-hatch-line" x1="0" y1="0" x2="0" y2="8" />
              </pattern>
            </defs>
            <rect className="rs-bar-track" width="100" height="8" rx="2" />
            <rect className="rs-bar--gain" width={100 * (1 - spentShare)} height="8" rx="2" />
            <rect className="rs-bar--spent" x={100 * (1 - spentShare)} width={100 * spentShare} height="8" />
          </svg>
          <p className="mt-2 text-xs text-room-400">
            Expenses came to {Math.round((net.expenses / net.gross) * 100)}% of poker winnings.
          </p>
        </div>
      )}
    </section>
  )
}

const minus = (cents: number) => (cents === 0 ? '$0' : formatCents(-cents))

function Line({ label, sub, value, tone }: { label: string; sub: string; value: string; tone?: keyof typeof TONE_CLASS }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="min-w-0">
        <span className="text-bone-50">{label}</span>
        <span className="block text-xs text-room-400">{sub}</span>
      </dt>
      <dd className={`shrink-0 font-semibold ${tone ? TONE_CLASS[tone] : 'text-room-50'}`}>{value}</dd>
    </div>
  )
}
