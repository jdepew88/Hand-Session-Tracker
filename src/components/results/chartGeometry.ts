import type { Cents } from '../../domain/money'
import type { ChartPoint } from '../../domain/results/bankroll'

/**
 * Pixel geometry for the bankroll chart, kept out of the component so it can
 * be tested. The chart is drawn at its real pixel width (measured), so text
 * and strokes are never stretched.
 */

/** 1, 2, 2.5 or 5 times a power of ten: steps people can read. */
export function niceStep(range: number, targetTicks: number): number {
  if (range <= 0) return 1
  const raw = range / Math.max(1, targetTicks)
  const power = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((factor) => factor * power).find((candidate) => candidate >= raw)!
  return step
}

export function niceTicks(min: number, max: number, targetTicks = 3): number[] {
  if (min === max) {
    const pad = Math.max(10_000, Math.abs(min) * 0.1)
    min -= pad
    max += pad
  }
  const step = niceStep(max - min, targetTicks)
  const ticks: number[] = []
  for (let value = Math.floor(min / step) * step; value <= Math.ceil(max / step) * step + step / 2; value += step) {
    ticks.push(Math.round(value))
  }
  return ticks
}

export interface ChartGeometry {
  xs: number[]
  ys: number[]
  line: string
  area: string
  yTicks: { value: Cents; y: number }[]
  xTicks: { label: string; x: number }[]
  plot: { top: number; bottom: number; left: number; right: number }
}

const PAD = { top: 14, bottom: 24, left: 8, right: 8 }

export function chartGeometry(points: readonly ChartPoint[], width: number, height: number): ChartGeometry {
  const plot = { top: PAD.top, bottom: height - PAD.bottom, left: PAD.left, right: width - PAD.right }
  if (points.length === 0) return { xs: [], ys: [], line: '', area: '', yTicks: [], xTicks: [], plot }

  const balances = points.map((point) => point.balance)
  const ticks = niceTicks(Math.min(...balances), Math.max(...balances))
  const low = ticks[0]!
  const high = ticks[ticks.length - 1]!
  const y = (value: number) => plot.bottom - ((value - low) / (high - low || 1)) * (plot.bottom - plot.top)

  const first = points[0]!.at
  const last = points[points.length - 1]!.at
  const span = last - first
  const x = (time: number, index: number) =>
    span > 0
      ? plot.left + ((time - first) / span) * (plot.right - plot.left)
      : plot.left + (points.length === 1 ? (plot.right - plot.left) / 2 : (index / (points.length - 1)) * (plot.right - plot.left))

  const xs = points.map((point, index) => x(point.at, index))
  const ys = points.map((point) => y(point.balance))
  const round = (value: number) => Math.round(value * 10) / 10
  const line = xs.map((px, index) => `${index === 0 ? 'M' : 'L'}${round(px)} ${round(ys[index]!)}`).join(' ')
  const area = `${line} L${round(xs[xs.length - 1]!)} ${plot.bottom} L${round(xs[0]!)} ${plot.bottom} Z`

  // Month labels on the first of each month, thinned so they never collide.
  const xTicks: { label: string; x: number }[] = []
  if (span > 0) {
    const cursor = new Date(first)
    cursor.setDate(1)
    cursor.setHours(0, 0, 0, 0)
    cursor.setMonth(cursor.getMonth() + 1)
    const all: { label: string; x: number }[] = []
    while (cursor.getTime() <= last) {
      all.push({
        label: cursor.toLocaleDateString(undefined, { month: 'short' }),
        x: plot.left + ((cursor.getTime() - first) / span) * (plot.right - plot.left),
      })
      cursor.setMonth(cursor.getMonth() + 1)
    }
    const minGap = 44
    for (const tick of all) {
      const previous = xTicks[xTicks.length - 1]
      if (tick.x < plot.left + 14 || tick.x > plot.right - 14) continue
      if (!previous || tick.x - previous.x >= minGap) xTicks.push(tick)
    }
  }

  return { xs, ys, line, area, yTicks: ticks.map((value) => ({ value, y: y(value) })), xTicks, plot }
}

/** Index of the point nearest to a horizontal position. */
export function nearestIndex(xs: readonly number[], position: number): number {
  let best = 0
  for (let index = 1; index < xs.length; index += 1) {
    if (Math.abs(xs[index]! - position) < Math.abs(xs[best]! - position)) best = index
  }
  return best
}

/** "$12k", "$12.5k", "$950" -- compact axis labels. */
export function axisMoney(cents: Cents): string {
  const dollars = cents / 100
  const sign = dollars < 0 ? '-' : ''
  const abs = Math.abs(dollars)
  if (abs >= 1000) {
    const thousands = abs / 1000
    return `${sign}$${Number.isInteger(thousands) ? thousands : thousands.toFixed(1)}k`
  }
  return `${sign}$${Math.round(abs)}`
}
