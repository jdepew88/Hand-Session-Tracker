import { formatCents, type Cents } from '../../domain/money'
import type { ChartPoint, LedgerEntry } from '../../domain/results/bankroll'
import type { BankrollTransaction } from '../../domain/results/models'
import { EXPENSE_CATEGORY_INFO } from '../../domain/results/stats'
import { formatMinutes } from '../../utils/labels'

/**
 * Words and small view math for Results. Every figure arrives already derived
 * from `domain/results`; this file only decides how to say and size it.
 */

export type Tone = 'gain' | 'loss' | 'even'

export const toneOf = (cents: Cents): Tone => (cents > 0 ? 'gain' : cents < 0 ? 'loss' : 'even')

/** Result colours: muted, and only ever on a figure that also carries a sign. */
export const TONE_CLASS: Record<Tone, string> = {
  gain: 'text-gain',
  loss: 'text-loss',
  even: 'text-bone-50',
}

/** "+$360", "-$220", "$0". */
export const signed = (cents: Cents) => formatCents(cents, { sign: true })

/** "+$31.85/hr", or a dash when there is no time to divide by. */
export const perHour = (cents: Cents | null) => (cents === null ? '—' : `${signed(cents)}/hr`)

/** "201h" for long totals, "4h 18m" for short ones. */
export function hoursText(minutes: number): string {
  if (minutes >= 600) return `${Math.round(minutes / 60).toLocaleString('en-US')}h`
  return minutes % 60 === 0 && minutes > 0 ? `${minutes / 60}h` : formatMinutes(minutes)
}

export const percentText = (share: number | null) => (share === null ? '—' : `${Math.round(share * 100)}%`)

/** "up $360", "down $220", "even" -- for sentences read aloud. */
export function spokenChange(cents: Cents): string {
  if (cents > 0) return `up ${formatCents(cents)}`
  if (cents < 0) return `down ${formatCents(-cents)}`
  return 'even'
}

/** "Oct 4", or "Oct 4, 2025" outside the current year. */
export function shortDate(value: string | number, now: number = Date.now()): string {
  const time = typeof value === 'number' ? value : Date.parse(value)
  if (Number.isNaN(time)) return '—'
  const date = new Date(time)
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() === new Date(now).getFullYear() ? {} : { year: 'numeric' }),
  })
}

function longDate(time: number, now: number): string {
  const date = new Date(time)
  return date.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    ...(date.getFullYear() === new Date(now).getFullYear() ? {} : { year: 'numeric' }),
  })
}

export const categoryLabel = (category: keyof typeof EXPENSE_CATEGORY_INFO) => EXPENSE_CATEGORY_INFO[category].label

/** "Added $2,000 to poker bankroll", "Moved $1,000 to liferoll". */
export function transactionHeadline(transaction: Pick<BankrollTransaction, 'kind' | 'amount'>): string {
  return transaction.kind === 'deposit'
    ? `Added ${formatCents(transaction.amount)} to poker bankroll`
    : `Moved ${formatCents(transaction.amount)} to liferoll`
}

/** What one ledger line was, for the chart readout. */
export function ledgerEntryText(entry: LedgerEntry): string {
  switch (entry.kind) {
    case 'session':
      return `${entry.location} session`
    case 'expense':
      return categoryLabel(entry.category)
    case 'deposit':
      return 'Added to bankroll'
    case 'withdrawal':
      return 'Moved to liferoll'
  }
}

/** "Commerce Casino session +$360 · Dealer tips -$25", at most three, then "+2 more". */
export function chartPointContext(point: ChartPoint): string {
  const shown = point.entries.slice(-3).map((entry) => `${ledgerEntryText(entry)} ${signed(entry.amount)}`)
  const more = point.entries.length - shown.length
  return more > 0 ? `${shown.join(' · ')} · +${more} more` : shown.join(' · ')
}

/**
 * The bankroll chart in one sentence:
 * "Bankroll rose from $8,000 on April 19 to $12,480 on October 4, with a peak
 * of $14,100 on September 12."
 */
export function bankrollChartSummary(points: readonly ChartPoint[], now: number = Date.now()): string {
  if (points.length === 0) return 'No bankroll history yet.'
  const first = points[0]!
  const last = points[points.length - 1]!
  if (points.length === 1) return `Bankroll is ${formatCents(last.balance)} as of ${longDate(last.at, now)}.`
  const verb = last.balance > first.balance ? 'rose' : last.balance < first.balance ? 'fell' : 'was unchanged'
  const span =
    verb === 'was unchanged'
      ? `Bankroll was ${formatCents(last.balance)} on both ${longDate(first.at, now)} and ${longDate(last.at, now)}`
      : `Bankroll ${verb} from ${formatCents(first.balance)} on ${longDate(first.at, now)} to ${formatCents(last.balance)} on ${longDate(last.at, now)}`
  const peak = points.reduce((best, point) => (point.balance > best.balance ? point : best), first)
  const peakText =
    peak === last ? 'which is its peak' : `with a peak of ${formatCents(peak.balance)} on ${longDate(peak.at, now)}`
  return `${span}, ${peakText}.`
}

/**
 * Chip columns for the bankroll rack: fuller the closer the balance is to its
 * peak. Decorative; the printed balance is the figure.
 */
export function rackHeights(balance: Cents, peak: Cents): number[] {
  if (balance <= 0 || peak <= 0) return []
  let chips = Math.max(2, Math.round(Math.min(1, balance / peak) * 28))
  const heights: number[] = []
  while (chips > 0 && heights.length < 4) {
    const height = Math.min(8, chips)
    heights.push(height)
    chips -= height
  }
  return heights
}

/** Chip colour by big blind denomination, for the stakes markers. */
export function stakesChip(bigBlind: Cents): 'i' | 'r' | 'g' | 'k' {
  if (bigBlind >= 10_000) return 'k'
  if (bigBlind >= 2_500) return 'g'
  if (bigBlind >= 500) return 'r'
  return 'i'
}
