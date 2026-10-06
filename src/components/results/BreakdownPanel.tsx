import type { ReactNode } from 'react'
import type { Breakdown } from '../../domain/results/stats'
import { TONE_CLASS, hoursText, perHour, signed, toneOf } from './resultsText'
import './results.css'

/**
 * One breakdown (by casino, stakes or game): a row per group with its result
 * and hourly, and a bar that grows right for profit and left for loss from a
 * shared centre line -- direction and sign, not colour alone.
 */
export function BreakdownPanel({
  title,
  groups,
  marker,
  empty = 'Nothing to compare yet.',
}: {
  title: string
  groups: Breakdown[]
  marker?: (group: Breakdown) => ReactNode
  empty?: string
}) {
  const scale = Math.max(1, ...groups.map((group) => Math.abs(group.result)))
  const headingId = `breakdown-${title.toLowerCase().replace(/[^a-z]+/g, '-')}`

  return (
    <section aria-labelledby={headingId} className="rs-panel p-4 sm:p-5">
      <h2 id={headingId} className="label">
        {title}
      </h2>
      {groups.length === 0 ? (
        <p className="text-sm text-room-400">{empty}</p>
      ) : (
        <ul className="space-y-3.5">
          {groups.map((group) => {
            const width = (Math.abs(group.result) / scale) * 50
            return (
              <li key={group.key}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium text-bone-50 [overflow-wrap:anywhere]">
                      {marker?.(group)}
                      {group.label}
                    </p>
                    <p className="text-xs text-room-400 tabular">
                      {group.sessions} session{group.sessions === 1 ? '' : 's'} · {hoursText(group.minutes)} ·{' '}
                      {perHour(group.hourly)}
                    </p>
                  </div>
                  <p className={`shrink-0 font-semibold tabular ${TONE_CLASS[toneOf(group.result)]}`}>{signed(group.result)}</p>
                </div>
                <svg aria-hidden="true" viewBox="0 0 100 6" preserveAspectRatio="none" className="mt-1.5 block h-1.5 w-full">
                  <rect className="rs-bar-track" width="100" height="6" rx="1" />
                  {group.result !== 0 && (
                    <rect
                      className={group.result > 0 ? 'rs-bar--gain' : 'rs-bar--loss'}
                      x={group.result > 0 ? 50 : 50 - width}
                      width={width}
                      height="6"
                    />
                  )}
                  <rect className="rs-bar--axis" x="49.75" width="0.5" height="6" />
                </svg>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
