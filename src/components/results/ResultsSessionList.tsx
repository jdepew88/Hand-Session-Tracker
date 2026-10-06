import { useState } from 'react'
import { Link } from 'react-router-dom'
import { formatCents, type Cents } from '../../domain/money'
import { stakesLabel } from '../../domain/poker/factories'
import type { SessionResultRow } from '../../domain/results/stats'
import { formatMinutes, gameShort, spokenMinutes } from '../../utils/labels'
import { RESULT_TONE_CLASS, resultDisplay } from '../sessions/sessionText'
import { TONE_CLASS, shortDate, signed, toneOf } from './resultsText'
import '../sessions/sessions.css'

const CAPTION = { win: 'Profit', loss: 'Loss', even: 'Break-even' } as const

/**
 * The sessions behind the figures above, in the journal's visual language:
 * room and result lead, game and time beneath, then expenses and true net
 * when the session had any. The player's own sessions open their session
 * page; demo sessions are not links.
 */
export function ResultsSessionList({
  rows,
  sessionExpenses,
  now,
  linkable,
  onOpen,
}: {
  rows: SessionResultRow[]
  sessionExpenses: Map<string, Cents>
  now: number
  linkable: boolean
  onOpen?: (id: string) => void
}) {
  const [showAll, setShowAll] = useState(false)
  const shown = showAll ? rows : rows.slice(0, 8)

  return (
    <section aria-labelledby="results-sessions-heading" className="rs-panel p-4 sm:p-5">
      <h2 id="results-sessions-heading" className="label">
        Sessions in these results
      </h2>
      <ul className="grid lg:grid-cols-2 lg:gap-x-10">
        {shown.map((row) => {
          const expenses = sessionExpenses.get(row.id) ?? 0
          const net = row.result - expenses
          const result = resultDisplay({ ...row, live: false, handCount: 0 })
          const spoken = [
            row.location,
            `${stakesLabel(row)} ${row.gameType}`,
            shortDate(row.startedAt, now),
            spokenMinutes(row.durationMinutes),
            row.outcome === 'even' ? 'broke even' : `${CAPTION[row.outcome].toLowerCase()} ${formatCents(Math.abs(row.result))}`,
            ...(expenses > 0 ? [`expenses ${formatCents(expenses)}`, `true net ${signed(net)}`] : []),
          ].join(', ')
          return (
            <li key={row.id} className="sj-card min-w-0 border-t border-room-700/70 py-3 first:border-t-0 lg:[&:nth-child(2)]:border-t-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-semibold leading-snug [overflow-wrap:anywhere]">
                    {linkable ? (
                      <Link to={`/sessions/${row.id}`} onClick={() => onOpen?.(row.id)} className="sj-card__link" aria-label={spoken}>
                        {row.location}
                      </Link>
                    ) : (
                      <>
                        <span className="sr-only">{spoken}</span>
                        <span aria-hidden="true">{row.location}</span>
                      </>
                    )}
                  </h3>
                  <p aria-hidden="true" className="text-sm text-room-400 tabular">
                    {stakesLabel(row)} {gameShort(row.gameType)} · {shortDate(row.startedAt, now)} ·{' '}
                    {formatMinutes(row.durationMinutes)}
                  </p>
                </div>
                <div aria-hidden="true" className="shrink-0 text-right">
                  <p className={`text-lg font-semibold leading-tight tabular ${RESULT_TONE_CLASS[result.tone]}`}>{result.figure}</p>
                  <p className="text-[0.68rem] uppercase tracking-wide text-room-400">{result.caption}</p>
                </div>
              </div>
              {expenses > 0 && (
                <p aria-hidden="true" className="mt-1 flex flex-wrap justify-end gap-x-4 text-xs text-room-400 tabular">
                  <span>Expenses {formatCents(-expenses)}</span>
                  <span>
                    True net <span className={`font-semibold ${TONE_CLASS[toneOf(net)]}`}>{signed(net)}</span>
                  </span>
                </p>
              )}
            </li>
          )
        })}
      </ul>
      {rows.length > 8 && (
        <button type="button" onClick={() => setShowAll((value) => !value)} className="btn-ghost mt-1 w-full">
          {showAll ? 'Show fewer' : `Show all ${rows.length} sessions`}
        </button>
      )}
    </section>
  )
}
