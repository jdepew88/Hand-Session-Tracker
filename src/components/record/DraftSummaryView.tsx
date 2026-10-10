import type { DraftSummary } from '../../domain/poker/draft/text'
import { ActionTimeline } from './ActionTimeline'

/**
 * A hand told street by street: matchup, Hero's cards, each street's board
 * and action, showdown, result. Anything not recorded says so in place
 * ("Details not recorded") in a quieter tone -- an omission, not an error.
 */
export function DraftSummaryView({
  summary,
  heroSeat,
  header,
}: {
  summary: DraftSummary
  heroSeat: number
  header?: string
}) {
  return (
    <div className="space-y-3 text-sm">
      <div>
        {header && <p className="text-xs uppercase tracking-wide text-room-400">{header}</p>}
        <p className="text-base font-semibold text-room-50">{summary.matchup}</p>
        <p className="text-room-300">
          Hero: <span className={summary.hero === 'Not recorded' ? 'italic text-room-400' : 'font-semibold text-room-50'}>{summary.hero}</span>
        </p>
      </div>

      <ol className="space-y-2.5">
        {summary.streets.map((street) => (
          <li key={street.street} className="border-l-2 border-room-700 pl-3">
            <p className="sr-only">{street.spoken}</p>
            <div aria-hidden="true">
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-xs font-bold uppercase tracking-[0.14em] text-room-400">{street.title}</span>
                {street.board && <span className="font-semibold text-room-50 tabular">{street.board}</span>}
              </p>
              {street.recorded ? (
                <div className="mt-1">
                  <ActionTimeline words={street.actions} label={`${street.title} action`} heroSeat={heroSeat} />
                </div>
              ) : (
                <p className="mt-0.5 italic text-room-400">Details not recorded</p>
              )}
            </div>
          </li>
        ))}
      </ol>

      {summary.showdown.length > 0 && (
        <div className="border-l-2 border-room-700 pl-3">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-room-400">Showdown</p>
          <ul className="mt-0.5 space-y-0.5">
            {summary.showdown.map((entry) => (
              <li key={entry.seat}>
                <span aria-hidden="true" className={entry.text.endsWith('cards unknown') ? 'italic text-room-400' : ''}>
                  {entry.text}
                </span>
                <span className="sr-only">{entry.spoken}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p
        className={`text-base font-semibold ${summary.winners ? 'text-room-50' : 'italic font-normal text-room-400'}`}
      >
        {summary.result}
      </p>
    </div>
  )
}
