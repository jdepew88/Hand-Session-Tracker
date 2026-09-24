import { formatCents } from '../money'
import { formatCards } from './cards'
import type { ActionEvent, HandRecord, HandResult, HandState, SeatState, Street } from './models'
import { replay } from './reducer'
import { computeResult } from './showdown'

/**
 * Renders a hand as the sort of text a player would post or read back.
 *
 * Every line is produced from the event log by replaying up to (but not
 * including) each action, so the amounts quoted are the ones that were true at
 * the moment the action happened -- calls read as the chips actually added,
 * bets and raises read as totals, which is how players say them out loud.
 */

const GAME_ABBREVIATIONS: Record<string, string> = {
  "No-Limit Hold'em": 'NLHE',
  'Pot-Limit Omaha': 'PLO',
  "Limit Hold'em": 'LHE',
}

const STREET_TITLES: Record<Street, string> = {
  preflop: 'Preflop',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
}

function seatLabel(seat: SeatState, heroSeat: number): string {
  if (seat.seat === heroSeat) return 'Hero'
  if (seat.label && seat.label.trim() !== '') return `${seat.position} (${seat.label.trim()})`
  return seat.position
}

function describeAction(event: ActionEvent, before: HandState, heroSeat: number): string {
  const seat = before.seats.get(event.seat)
  if (!seat) return ''
  const who = seatLabel(seat, heroSeat)
  const ceiling = seat.streetCommitted + seat.stack

  switch (event.action) {
    case 'fold':
      return `${who} folds.`
    case 'check':
      return `${who} checks.`
    case 'call': {
      const added = Math.min(before.currentBet - seat.streetCommitted, seat.stack)
      const allIn = added >= seat.stack
      return `${who} calls ${formatCents(added)}${allIn ? ' and is all-in' : ''}.`
    }
    case 'bet':
    case 'raise': {
      const to = Math.min(event.to, ceiling)
      const allIn = to >= ceiling
      const verb = event.action === 'bet' ? 'bets' : 'raises to'
      const amount = event.action === 'bet' ? formatCents(to - seat.streetCommitted) : formatCents(to)
      return `${who} ${verb} ${amount}${allIn ? ' and is all-in' : ''}.`
    }
  }
}

export interface SummaryOptions {
  /** Include the rake/drop breakdown block. Defaults to true. */
  includeRake?: boolean
}

export function generateSummary(record: HandRecord, options: SummaryOptions = {}): string {
  const { setup, events, context } = record
  const includeRake = options.includeRake ?? true
  const lines: string[] = []

  const game = GAME_ABBREVIATIONS[context.gameType] ?? context.gameType
  const location = context.location.trim() === '' ? 'Unknown location' : context.location.trim()
  lines.push(`${location} — ${context.stakesLabel} ${game}`.trim())
  lines.push(`${context.tableSize}-handed`)

  const finalState = replay(setup, events)
  const hero = finalState.seats.get(setup.heroSeat)
  if (hero) {
    lines.push(`Hero: ${hero.position} — ${formatCents(hero.startingStack)}`)
  }

  const extras: string[] = []
  if (setup.ante > 0) extras.push(`Ante ${formatCents(setup.ante)}`)
  for (const straddle of setup.straddles) {
    const straddleSeat = finalState.seats.get(straddle.seat)
    extras.push(`Straddle ${formatCents(straddle.amount)} (${straddleSeat?.position ?? `seat ${straddle.seat}`})`)
  }
  if (extras.length > 0) lines.push(extras.join(' · '))

  if (setup.heroCards.length === 2) {
    lines.push('')
    lines.push(`Hero: ${formatCards(setup.heroCards)}`)
  }

  let currentStreet: Street | null = null
  let boardShown = 0

  for (let index = 0; index < events.length; index += 1) {
    const event = events[index]!
    const before = replay(setup, events.slice(0, index))

    if (event.kind === 'deal') {
      const potBefore = before.pot
      lines.push('')
      lines.push(`Pot: ${formatCents(potBefore)}`)
      lines.push('')
      const shown = [...before.board, ...event.cards]
      lines.push(`${STREET_TITLES[event.street]}: ${formatCards(shown.slice(boardShown))}`)
      boardShown = shown.length
      currentStreet = event.street
      lines.push('')
      continue
    }

    if (event.kind === 'reveal') continue

    if (currentStreet !== event.street) {
      if (event.street === 'preflop') {
        lines.push('')
        lines.push(STREET_TITLES.preflop)
      }
      currentStreet = event.street
    }
    const text = describeAction(event, before, setup.heroSeat)
    if (text) lines.push(text)
  }

  const result = computeResult(setup, finalState, record.manualWinners)

  lines.push('')
  lines.push(`Pot: ${formatCents(finalState.pot)}`)

  const revealed = result.showdown.filter((entry) => entry.cards.length >= 2)
  if (finalState.status === 'showdown' && revealed.length > 0) {
    lines.push('')
    lines.push('Showdown')
    for (const entry of revealed) {
      const seat = finalState.seats.get(entry.seat)!
      lines.push(`${seatLabel(seat, setup.heroSeat)}: ${formatCards(entry.cards)}`)
    }
  }

  lines.push('')
  lines.push(...resultLines(finalState, result, setup.heroSeat, includeRake))

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

function resultLines(
  state: HandState,
  result: HandResult,
  heroSeat: number,
  includeRake: boolean,
): string[] {
  const lines: string[] = []

  if (result.undetermined && result.winners.length === 0) {
    lines.push('Winner not determined — opponent cards unknown.')
  } else {
    for (const seat of result.winners) {
      const player = state.seats.get(seat)!
      const won = result.awards
        .filter((award) => award.seat === seat)
        .reduce((sum, award) => sum + award.amount, 0)
      const entry = result.showdown.find((item) => item.seat === seat)
      const handText = entry?.ranking ? ` with ${entry.ranking.description}` : ''
      lines.push(`${seatLabel(player, heroSeat)} wins ${formatCents(won)}${handText}.`)
    }
  }

  lines.push('')
  lines.push(`Gross pot: ${formatCents(result.grossPot)}`)
  if (includeRake && result.rake.total > 0) {
    const parts: string[] = []
    if (result.rake.rake > 0) parts.push(`rake ${formatCents(result.rake.rake)}`)
    if (result.rake.jackpot > 0) parts.push(`jackpot ${formatCents(result.rake.jackpot)}`)
    lines.push(`Drop: ${formatCents(result.rake.total)} (${parts.join(', ')})`)
  }
  lines.push(`Net pot: ${formatCents(result.netPot)}`)
  lines.push(`Hero result: ${formatCents(result.heroResult, { sign: true })}`)
  return lines
}
