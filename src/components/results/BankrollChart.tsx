import { useId, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { formatCents } from '../../domain/money'
import type { ChartPoint } from '../../domain/results/bankroll'
import { useElementWidth } from '../../hooks/useElementWidth'
import { axisMoney, chartGeometry, nearestIndex } from './chartGeometry'
import { chartPointContext, shortDate, signed } from './resultsText'

/**
 * The bankroll over time: one brass line, a soft area, a few gridlines.
 *
 * Pointer, touch and keyboard all move the same cursor; the readout above the
 * chart says what the cursor is on (date, balance, change, and what happened
 * that day). The chart itself is a slider to assistive technology, with the
 * readout as its spoken value, and a one-sentence summary describes it whole.
 */
export function BankrollChart({
  points,
  summary,
  now,
}: {
  points: readonly ChartPoint[]
  summary: string
  now: number
}) {
  const [frameRef, width] = useElementWidth<HTMLDivElement>(560)
  const [selected, setSelected] = useState<number | null>(null)
  const ids = useId().replace(/[^a-zA-Z0-9]/g, '')
  const height = width < 480 ? 150 : 196
  const geometry = chartGeometry(points, width, height)
  const last = points.length - 1
  const index = selected === null ? last : Math.min(selected, last)
  const point = points[index]
  const peakIndex = points.reduce((best, entry, at) => (entry.balance > points[best]!.balance ? at : best), 0)

  const readout = point
    ? `${shortDate(point.at, now)}: bankroll ${formatCents(point.balance)}, ${signed(point.change)} that day. ${chartPointContext(point)}.`
    : ''

  const moveTo = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    setSelected(nearestIndex(geometry.xs, event.clientX - box.left))
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step: Record<string, number> = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }
    if (event.key in step) setSelected(Math.max(0, Math.min(last, index + step[event.key]!)))
    else if (event.key === 'Home') setSelected(0)
    else if (event.key === 'End') setSelected(last)
    else if (event.key === 'PageUp') setSelected(Math.min(last, index + 10))
    else if (event.key === 'PageDown') setSelected(Math.max(0, index - 10))
    else return
    event.preventDefault()
  }

  if (!point) return null

  return (
    <figure className="m-0">
      <div aria-hidden="true" className="flex min-h-10 flex-wrap items-baseline justify-between gap-x-3 px-1 text-xs tabular">
        <p>
          <span className="text-room-400">{selected === null ? 'Latest · ' : ''}{shortDate(point.at, now)}</span>{' '}
          <span className="font-semibold text-bone-50">{formatCents(point.balance)}</span>{' '}
          <span className="text-room-300">({signed(point.change)})</span>
        </p>
        <p className="line-clamp-2 min-w-0 text-room-400">{chartPointContext(point)}</p>
      </div>

      <div
        ref={frameRef}
        role="slider"
        tabIndex={0}
        aria-label="Bankroll history. Use the arrow keys to move through the days."
        aria-describedby={`${ids}-summary`}
        aria-valuemin={1}
        aria-valuemax={points.length}
        aria-valuenow={index + 1}
        aria-valuetext={readout}
        onKeyDown={onKeyDown}
        className="rounded-lg focus-visible:outline-offset-4"
      >
        <svg
          aria-hidden="true"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className="rs-chart block max-w-full"
          onPointerMove={moveTo}
          onPointerDown={moveTo}
          onPointerLeave={(event) => event.pointerType === 'mouse' && setSelected(null)}
        >
          <defs>
            <linearGradient id={`${ids}-area`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" className="rs-chart__area-top" />
              <stop offset="100%" className="rs-chart__area-bottom" />
            </linearGradient>
          </defs>
          {geometry.yTicks.map((tick) => (
            <g key={tick.value}>
              <line className="rs-chart__grid" x1={geometry.plot.left} x2={geometry.plot.right} y1={tick.y} y2={tick.y} />
              <text className="rs-chart__axis" x={geometry.plot.left} y={tick.y - 4}>
                {axisMoney(tick.value)}
              </text>
            </g>
          ))}
          {geometry.xTicks.map((tick) => (
            <text key={`${tick.label}-${tick.x}`} className="rs-chart__axis" x={tick.x} y={height - 6} textAnchor="middle">
              {tick.label}
            </text>
          ))}
          <path d={geometry.area} fill={`url(#${ids}-area)`} />
          <path d={geometry.line} className="rs-chart__line" />
          {points.length > 1 && (
            <circle className="rs-chart__peak" cx={geometry.xs[peakIndex]} cy={geometry.ys[peakIndex]} r={5} />
          )}
          <line
            className="rs-chart__cursor"
            x1={geometry.xs[index]}
            x2={geometry.xs[index]}
            y1={geometry.plot.top}
            y2={geometry.plot.bottom}
          />
          <circle className="rs-chart__dot" cx={geometry.xs[index]} cy={geometry.ys[index]} r={4.5} />
        </svg>
      </div>
      <figcaption id={`${ids}-summary`} className="sr-only">
        {summary}
      </figcaption>
    </figure>
  )
}
