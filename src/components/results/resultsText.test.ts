import { describe, expect, it } from 'vitest'
import type { ChartPoint } from '../../domain/results/bankroll'
import { axisMoney, chartGeometry, nearestIndex, niceStep, niceTicks } from './chartGeometry'
import {
  bankrollChartSummary,
  hoursText,
  perHour,
  rackHeights,
  signed,
  spokenChange,
  toneOf,
  transactionHeadline,
} from './resultsText'

const NOW = new Date(2026, 9, 6, 21, 0).getTime()

function point(month: number, day: number, balance: number, change = 0): ChartPoint {
  const at = new Date(2026, month, day, 23).getTime()
  return { day: `2026-${month + 1}-${day}`, at, balance, change, entries: [] }
}

describe('results wording', () => {
  it('gives every figure a sign and a tone that agree', () => {
    expect([signed(36_000), signed(-22_000), signed(0)]).toEqual(['+$360', '-$220', '$0'])
    expect([toneOf(1), toneOf(-1), toneOf(0)]).toEqual(['gain', 'loss', 'even'])
    expect(spokenChange(-22_000)).toBe('down $220')
  })

  it('writes hourly and hours', () => {
    expect(perHour(3_185)).toBe('+$31.85/hr')
    expect(perHour(null)).toBe('—')
    expect(hoursText(258)).toBe('4h 18m')
    expect(hoursText(300)).toBe('5h')
    expect(hoursText(264 * 60 + 20)).toBe('264h')
  })

  it('says bankroll moves in plain words', () => {
    expect(transactionHeadline({ kind: 'deposit', amount: 200_000 })).toBe('Added $2,000 to poker bankroll')
    expect(transactionHeadline({ kind: 'withdrawal', amount: 100_000 })).toBe('Moved $1,000 to liferoll')
  })
})

describe('bankroll chart summary', () => {
  it('describes the whole curve in one sentence', () => {
    const points = [point(6, 1, 1_000_000), point(8, 12, 1_410_000), point(9, 4, 1_248_000)]
    expect(bankrollChartSummary(points, NOW)).toBe(
      'Bankroll rose from $10,000 on July 1 to $12,480 on October 4, with a peak of $14,100 on September 12.',
    )
  })

  it('handles a falling curve, a curve ending at its peak, and no curve', () => {
    expect(bankrollChartSummary([point(6, 1, 500_000), point(7, 1, 400_000)], NOW)).toMatch(/^Bankroll fell from \$5,000/)
    expect(bankrollChartSummary([point(6, 1, 100_000), point(7, 1, 200_000)], NOW)).toMatch(/which is its peak\.$/)
    expect(bankrollChartSummary([], NOW)).toBe('No bankroll history yet.')
  })
})

describe('chart geometry', () => {
  it('picks readable steps and ticks that cover the data', () => {
    expect(niceStep(430_000, 3)).toBe(200_000)
    const ticks = niceTicks(1_000_000, 1_410_000)
    expect(ticks[0]!).toBeLessThanOrEqual(1_000_000)
    expect(ticks[ticks.length - 1]!).toBeGreaterThanOrEqual(1_410_000)
    expect(niceTicks(500, 500).length).toBeGreaterThan(1)
  })

  it('maps points inside the plot, oldest on the left', () => {
    const points = [point(6, 1, 1_000_000), point(8, 12, 1_410_000), point(9, 4, 1_248_000)]
    const geometry = chartGeometry(points, 400, 160)
    expect(geometry.xs[0]).toBe(geometry.plot.left)
    expect(geometry.xs[2]).toBe(geometry.plot.right)
    for (const y of geometry.ys) {
      expect(y).toBeGreaterThanOrEqual(geometry.plot.top)
      expect(y).toBeLessThanOrEqual(geometry.plot.bottom)
    }
    // The peak is the highest point drawn.
    expect(Math.min(...geometry.ys)).toBe(geometry.ys[1])
    expect(geometry.line.startsWith('M')).toBe(true)
    expect(geometry.xTicks.map((tick) => tick.label).length).toBeGreaterThan(0)
    expect(nearestIndex(geometry.xs, 390)).toBe(2)
  })

  it('labels the axis compactly', () => {
    expect([axisMoney(1_200_000), axisMoney(1_250_000), axisMoney(95_000), axisMoney(-300_000)]).toEqual([
      '$12k',
      '$12.5k',
      '$950',
      '-$3k',
    ])
  })
})

describe('chip rack', () => {
  it('fills toward a full rack as the balance approaches its peak', () => {
    expect(rackHeights(100, 100)).toEqual([8, 8, 8, 4])
    expect(rackHeights(50, 100)).toEqual([8, 6])
    expect(rackHeights(0, 100)).toEqual([])
  })
})
