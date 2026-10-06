import { Link } from 'react-router-dom'
import { formatCents } from '../../domain/money'
import type { SessionSummary } from '../../domain/poker/sessionSummary'
import { formatJournalDate } from '../../utils/labels'
import {
  RESULT_TONE_CLASS,
  buyInText,
  durationText,
  gameLine,
  handCountText,
  resultDisplay,
  roomName,
  sessionAccessibleSummary,
} from './sessionText'
import { TableGlyph } from './TableGlyph'
import './sessions.css'

/**
 * One session in the journal.
 *
 * Room and result lead; game and time come second; money and hand count sit
 * underneath. The whole card opens the session. A live session also gets a
 * steady LIVE marker, its running time and buttons straight back to the table
 * and the recorder. Colour only ever tints the result figure, and the result
 * is always also given as a sign and a word.
 */
export function SessionCard({
  summary,
  now,
  seatNote,
  onOpen,
}: {
  summary: SessionSummary
  /** The clock live durations are measured against. */
  now: number
  /** e.g. "Seat 8 · BTN", for a live session with a hero seat. */
  seatNote?: string
  /** Called before any of the card's links navigate: makes this the app's session. */
  onOpen?: () => void
}) {
  const result = resultDisplay(summary)
  const live = summary.live

  return (
    <article
      className={`sj-card card-surface px-4 pb-3.5 pt-3.5 transition-colors hover:border-room-500 ${live ? 'sj-card--live' : ''}`}
    >
      {/* The heading link carries the full spoken summary, so the visible
          details beside it are hidden from screen readers rather than read twice. */}
      {live && (
        <p aria-hidden="true" className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span className="inline-flex items-center gap-1.5 font-bold tracking-[0.14em] text-felt-200">
            <span className="sj-live-dot" />
            LIVE
          </span>
          <span className="text-room-300">
            Started {formatJournalDate(summary.startedAt, now)} · {durationText(summary)} so far
          </span>
        </p>
      )}

      <div className="flex items-start gap-3">
        <TableGlyph seats={summary.tableSize} className="mt-1 hidden h-8 w-10 shrink-0 min-[360px]:block" />
        <div className="min-w-0 flex-1">
          <h3 className="text-[1.05rem] font-semibold leading-snug tracking-tight [overflow-wrap:anywhere]">
            {/* The card's one link, stretched over the whole card by CSS. */}
            <Link
              to={`/sessions/${summary.id}`}
              onClick={onOpen}
              className="sj-card__link"
              aria-label={sessionAccessibleSummary(summary, now)}
            >
              {roomName(summary)}
            </Link>
          </h3>
          <p aria-hidden="true" className="mt-0.5 text-sm text-room-300 tabular">{gameLine(summary)}</p>
          {!live && (
            <p aria-hidden="true" className="mt-0.5 text-sm text-room-400 tabular">
              {formatJournalDate(summary.startedAt, now)} · {durationText(summary)}
            </p>
          )}
          {live && seatNote && <p aria-hidden="true" className="mt-0.5 text-sm text-room-400 tabular">{seatNote}</p>}
        </div>
        <div aria-hidden="true" className="shrink-0 text-right">
          <p
            className={`tabular font-semibold leading-tight ${result.numeric ? 'text-[1.45rem]' : 'text-sm'} ${
              RESULT_TONE_CLASS[result.tone]
            }`}
          >
            {result.figure}
          </p>
          {result.numeric && <p className="text-[0.7rem] uppercase tracking-wide text-room-400">{result.caption}</p>}
        </div>
      </div>

      <p
        aria-hidden="true"
        className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-room-700/70 pt-2.5 text-xs text-room-400 tabular"
      >
        <span>
          {summary.cashOut !== null ? (
            <>
              {formatCents(summary.totalBuyIn)} <span className="text-room-500">→</span>{' '}
              <span className="text-room-300">{formatCents(summary.cashOut)}</span>
              {summary.buyInCount > 1 && ` · ${summary.buyInCount} buy-ins`}
            </>
          ) : (
            <>Buy-in {buyInText(summary)}</>
          )}
        </span>
        <span>{handCountText(summary.handCount)}</span>
      </p>

      {live && (
        <div className="sj-card__actions mt-3 grid grid-cols-2 gap-2">
          <Link to="/table" onClick={onOpen} className="btn-primary h-11 px-2 text-center leading-tight">
            Return to table
          </Link>
          <Link to="/record" onClick={onOpen} className="btn-secondary h-11 px-2 text-center leading-tight">
            Record hand
          </Link>
        </div>
      )}
    </article>
  )
}
