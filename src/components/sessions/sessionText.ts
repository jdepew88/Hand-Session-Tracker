import { formatCents } from '../../domain/money'
import { stakesLabel } from '../../domain/poker/factories'
import type { SessionOutcome, SessionSummary } from '../../domain/poker/sessionSummary'
import { formatMinutes, gameShort, spokenDate, spokenMinutes } from '../../utils/labels'

/**
 * Words for a session summary. Every figure comes from `SessionSummary`; this
 * file only decides how to say it.
 */

export const roomName = (summary: Pick<SessionSummary, 'location'>) => summary.location.trim() || 'Unnamed room'

/** "$2/$5 NLH · 9-handed" */
export function gameLine(summary: SessionSummary): string {
  return `${stakesLabel(summary)} ${gameShort(summary.gameType)} · ${summary.tableSize}-handed`
}

export const handCountText = (count: number) => `${count} hand${count === 1 ? '' : 's'}`

/** "$500", or "$1,000 · 2 buy-ins" when there were rebuys. */
export function buyInText(summary: SessionSummary): string {
  const total = formatCents(summary.totalBuyIn)
  return summary.buyInCount > 1 ? `${total} · ${summary.buyInCount} buy-ins` : total
}

export interface ResultDisplay {
  /** The big figure: "+$360", "-$220", "$0", or words when there is no result. */
  figure: string
  /** Says in words what the sign and colour say. */
  caption: string
  tone: 'gain' | 'loss' | 'even' | 'muted'
  /** True when `figure` is a number. */
  numeric: boolean
}

const CAPTIONS: Record<Exclude<SessionOutcome, 'live' | 'unsettled'>, string> = {
  win: 'Profit',
  loss: 'Loss',
  even: 'Break-even',
}

export function resultDisplay(summary: SessionSummary): ResultDisplay {
  if (summary.outcome === 'live') return { figure: 'In progress', caption: 'Not cashed out yet', tone: 'muted', numeric: false }
  if (summary.outcome === 'unsettled' || summary.result === null) {
    return { figure: 'No cash-out', caption: 'Result unknown', tone: 'muted', numeric: false }
  }
  return {
    figure: formatCents(summary.result, { sign: true }),
    caption: CAPTIONS[summary.outcome],
    tone: summary.outcome === 'win' ? 'gain' : summary.outcome === 'loss' ? 'loss' : 'even',
    numeric: true,
  }
}

export const RESULT_TONE_CLASS: Record<ResultDisplay['tone'], string> = {
  gain: 'text-gain',
  loss: 'text-loss',
  even: 'text-bone-50',
  muted: 'text-room-300',
}

function spokenResult(summary: SessionSummary): string {
  switch (summary.outcome) {
    case 'live':
      return 'in progress'
    case 'unsettled':
      return 'no cash-out recorded'
    case 'even':
      return 'broke even'
    case 'win':
      return `profit ${formatCents(summary.result!)}`
    case 'loss':
      return `loss ${formatCents(-summary.result!)}`
  }
}

/**
 * One sentence for assistive technology:
 * "Commerce Casino, $2/$5 No-Limit Hold'em, 9-handed, October 4, duration
 * 4 hours 18 minutes, profit $360, bought in for $500, cashed out for $860,
 * 12 hands recorded."
 */
export function sessionAccessibleSummary(summary: SessionSummary, now: number = Date.now()): string {
  const parts = [
    summary.live ? `Live session at ${roomName(summary)}` : roomName(summary),
    `${stakesLabel(summary)} ${summary.gameType}`,
    `${summary.tableSize}-handed`,
    summary.live ? `started ${spokenDate(summary.startedAt, now)}` : spokenDate(summary.startedAt, now),
    `${summary.live ? 'running for' : 'duration'} ${spokenMinutes(summary.durationMinutes)}`,
    spokenResult(summary),
    `bought in for ${formatCents(summary.totalBuyIn)}${summary.buyInCount > 1 ? ` across ${summary.buyInCount} buy-ins` : ''}`,
  ]
  if (summary.cashOut !== null) parts.push(`cashed out for ${formatCents(summary.cashOut)}`)
  parts.push(`${handCountText(summary.handCount)} recorded`)
  return `${parts.join(', ')}.`
}

export const durationText = (summary: SessionSummary) => formatMinutes(summary.durationMinutes)
