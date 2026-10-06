import { formatCents } from '../../domain/money'
import type { PerformanceStats, TrueNet } from '../../domain/results/stats'
import { TONE_CLASS, hoursText, perHour, percentText, signed, toneOf } from './resultsText'
import './results.css'

/**
 * Three lead figures -- poker profit, hourly, true net -- on raised plates,
 * then a ledger line of supporting facts. Every figure carries its sign and a
 * label; colour only reinforces it.
 */
export function PerformanceSnapshot({ stats, net }: { stats: PerformanceStats; net: TrueNet }) {
  return (
    <section aria-labelledby="performance-heading" className="rs-panel p-4 sm:p-5">
      <h2 id="performance-heading" className="label">
        Performance
      </h2>
      <div className="grid gap-2.5 min-[360px]:grid-cols-2 lg:grid-cols-3">
        <Lead
          className="min-[360px]:col-span-2 lg:col-span-1"
          label="Poker profit"
          value={signed(stats.gross)}
          tone={toneOf(stats.gross)}
          note={`${stats.sessions} session${stats.sessions === 1 ? '' : 's'}, before expenses`}
          large
        />
        <Lead
          label="Hourly"
          value={perHour(stats.hourly)}
          tone={stats.hourly === null ? 'even' : toneOf(stats.hourly)}
          note={`Over ${hoursText(stats.minutes)}`}
        />
        <Lead label="True net" value={signed(net.net)} tone={toneOf(net.net)} note="After expenses" />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-room-700/70 pt-4 sm:grid-cols-3 lg:grid-cols-6">
        <Fact label="Hours played" value={hoursText(stats.minutes)} />
        <Fact label="Sessions" value={String(stats.sessions)} />
        <Fact
          label="Winning sessions"
          value={percentText(stats.winRate)}
          note={stats.sessions ? `${stats.winning} of ${stats.sessions}` : undefined}
        />
        <Fact label="Average session" value={stats.average === null ? '—' : signed(stats.average)} />
        <Fact label="Biggest win" value={stats.biggestWin === null ? '—' : signed(stats.biggestWin)} />
        <Fact label="Biggest loss" value={stats.biggestLoss === null ? '—' : formatCents(stats.biggestLoss)} />
      </dl>
    </section>
  )
}

function Lead({
  label,
  value,
  note,
  tone,
  large,
  className = '',
}: {
  label: string
  value: string
  note: string
  tone: keyof typeof TONE_CLASS
  large?: boolean
  className?: string
}) {
  return (
    <div className={`rs-plate min-w-0 px-3.5 py-3 ${className}`}>
      <p className="text-[0.7rem] font-medium uppercase tracking-wide text-room-400">{label}</p>
      <p
        className={`mt-1 font-semibold leading-tight tracking-tight tabular [overflow-wrap:anywhere] ${
          large ? 'text-[2rem]' : 'text-[1.45rem]'
        } ${TONE_CLASS[tone]}`}
      >
        {value}
      </p>
      <p className="mt-0.5 text-xs text-room-400">{note}</p>
    </div>
  )
}

function Fact({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.68rem] uppercase tracking-wide text-room-400">{label}</dt>
      <dd className="font-semibold text-bone-50 tabular">{value}</dd>
      {note && <dd className="text-xs text-room-400 tabular">{note}</dd>}
    </div>
  )
}
