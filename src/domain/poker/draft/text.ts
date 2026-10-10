import { formatCents } from '../../money'
import { RANK_NAME, SUIT_NAME, SUIT_SYMBOL, type Suit } from '../cards'
import type { Street } from '../models'
import { derivePositions, type Position } from '../positions'
import { positionName } from '../tableView'
import { finalLive, handFlow, type DraftTable, type FlowProblem, type StreetFlow } from './flow'
import { isExactCard, isPair, isUnknownCard, suitedness } from './memory'
import type { CardMemory, DraftStreet, FlopSuits, HandDraft, HoleCardsMemory } from './model'

/**
 * Words for a draft: the short forms the recorder shows on a phone ("CO
 * 3-bet to $60"), the plain-text summary a player copies, and full sentences
 * for screen readers ("Cutoff 3-bet to $60."). Unknowns are said as unknown,
 * never smoothed over.
 */

export const STREET_TITLE: Record<Street, string> = {
  preflop: 'Preflop',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
}

/* ------------------------------------------------------------------ seats */

export function seatPositions(table: DraftTable): Map<number, Position> {
  return derivePositions(
    table.seats.map((seat) => seat.seat),
    table.buttonSeat,
  )
}

/** "Hero", "CO", or "Seat 4" where no position can be derived. */
export function seatName(table: DraftTable, seat: number, positions = seatPositions(table)): string {
  if (seat === table.heroSeat) return 'Hero'
  return positions.get(seat) ?? `Seat ${seat}`
}

/** "Hero", "Cutoff": for sentences read aloud. */
export function seatSpokenName(table: DraftTable, seat: number, positions = seatPositions(table)): string {
  if (seat === table.heroSeat) return 'Hero'
  const position = positions.get(seat)
  return position ? positionName(position) : `Seat ${seat}`
}

/** The table's name for the player in a seat, if one was noted. */
export function seatNickname(table: DraftTable, seat: number): string | undefined {
  const label = table.seats.find((entry) => entry.seat === seat)?.label?.trim()
  return label ? label : undefined
}

/** "Hero BTN vs CO", "Hero BB vs CO, BTN (Hoodie guy)". */
export function participantsLine(table: DraftTable, participants: readonly number[]): string {
  const positions = seatPositions(table)
  const heroPosition = positions.get(table.heroSeat)
  const others = participants
    .filter((seat) => seat !== table.heroSeat)
    .map((seat) => {
      const nickname = seatNickname(table, seat)
      return `${seatName(table, seat, positions)}${nickname ? ` (${nickname})` : ''}`
    })
  const hero = heroPosition ? `Hero ${heroPosition}` : 'Hero'
  return others.length === 0 ? hero : `${hero} vs ${others.join(', ')}`
}

export function spokenParticipants(table: DraftTable, participants: readonly number[]): string {
  const positions = seatPositions(table)
  const others = participants.filter((seat) => seat !== table.heroSeat).map((seat) => seatSpokenName(table, seat, positions))
  const heroPosition = positions.get(table.heroSeat)
  const hero = heroPosition ? `Hero, ${positionName(heroPosition).toLowerCase()}` : 'Hero'
  return others.length === 0 ? `${hero}, alone so far` : `${hero}, against ${joinWords(others)}`
}

export function joinWords(words: readonly string[]): string {
  if (words.length <= 1) return words.join('')
  return `${words.slice(0, -1).join(', ')} and ${words.at(-1)!}`
}

/* ------------------------------------------------------------------ cards */

const rankChar = (rank: string) => rank

/** "A♠", "A?" (suit unknown), "?♠" (rank unknown), "?" (unknown). */
export function cardText(card: CardMemory): string {
  if (isUnknownCard(card)) return '?'
  return `${card.rank ? rankChar(card.rank) : '?'}${card.suit ? SUIT_SYMBOL[card.suit] : '?'}`
}

const SUIT_SINGULAR: Record<Suit, string> = { s: 'spade', h: 'heart', d: 'diamond', c: 'club' }

/** "Ace of spades", "an Ace, suit unknown", "a club, rank unknown", "unknown card". */
export function cardSpoken(card: CardMemory): string {
  if (isExactCard(card)) return `${RANK_NAME[card.rank]} of ${SUIT_NAME[card.suit]}`
  if (card.rank) return `${RANK_NAME[card.rank]}, suit unknown`
  if (card.suit) return `a ${SUIT_SINGULAR[card.suit]}, rank unknown`
  return 'unknown card'
}

/** "A♠ K♦", "AK suited", "AK offsuit", "AK", "A? K♦", or "Not recorded". */
export function holeCardsText(hole: HoleCardsMemory | null): string {
  if (!hole || hole.cards.every(isUnknownCard)) return 'Not recorded'
  const [first, second] = hole.cards
  if (isExactCard(first) && isExactCard(second)) return `${cardText(first)} ${cardText(second)}`
  if (first.rank && second.rank && first.suit === null && second.suit === null) {
    const ranks = `${first.rank}${second.rank}`
    const suited = suitedness(hole)
    if (isPair(hole) || suited === null) return ranks
    return `${ranks} ${suited ? 'suited' : 'offsuit'}`
  }
  return `${cardText(first)} ${cardText(second)}`
}

export function holeCardsSpoken(hole: HoleCardsMemory | null): string {
  if (!hole || hole.cards.every(isUnknownCard)) return 'cards not recorded'
  const [first, second] = hole.cards
  if (first.rank && second.rank && first.suit === null && second.suit === null) {
    const ranks = `${RANK_NAME[first.rank]} ${RANK_NAME[second.rank]}`
    const suited = suitedness(hole)
    if (isPair(hole) || suited === null) return `${ranks}, suits unknown`
    return `${ranks} ${suited ? 'suited' : 'offsuit'}, exact suits unknown`
  }
  return `${cardSpoken(first)}, ${cardSpoken(second)}`
}

/** "two clubs", "rainbow", "monotone clubs", "two-tone". */
export function flopSuitsText(suits: FlopSuits | null): string | null {
  if (!suits) return null
  switch (suits.kind) {
    case 'rainbow':
      return 'rainbow'
    case 'two-tone':
      return suits.suit ? `two ${SUIT_NAME[suits.suit]}` : 'two-tone'
    case 'monotone':
      return suits.suit ? `all ${SUIT_NAME[suits.suit]}` : 'monotone'
  }
}

/** "T♣ 8♥ 2♣", "T 8 2 · two clubs", or null when nothing about the cards is recorded. */
export function boardText(street: DraftStreet): string | null {
  if (street.cards.length === 0) return null
  const texture = street.street === 'flop' ? flopSuitsText(street.suits) : null
  if (street.cards.every(isUnknownCard)) return texture ? `Cards not recorded · ${texture}` : null
  const allRanksOnly = street.cards.every((card) => card.rank !== null && card.suit === null)
  const cards = allRanksOnly
    ? street.cards.map((card) => card.rank).join(' ')
    : street.cards.map(cardText).join(' ')
  return texture && street.cards.some((card) => card.suit === null) ? `${cards} · ${texture}` : cards
}

export function boardSpoken(street: DraftStreet): string {
  if (street.cards.length === 0) return ''
  const texture = street.street === 'flop' ? flopSuitsText(street.suits) : null
  if (street.cards.every(isUnknownCard)) return texture ? `cards not recorded, ${texture}` : 'cards not recorded'
  const allRanksOnly = street.cards.every((card) => card.rank !== null && card.suit === null)
  const cards = allRanksOnly
    ? street.cards.map((card) => RANK_NAME[card.rank!].toLowerCase()).join(', ')
    : street.cards.map((card) => lowerFirst(cardSpoken(card))).join(', ')
  return texture && street.cards.some((card) => card.suit === null) ? `${cards}, ${texture}` : cards
}

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1)

/* ---------------------------------------------------------------- actions */

export interface ActionWords {
  id: string
  seat: number
  who: string
  /** Upper-case token for the timeline: "BET", "3-BET", "LIMP", "ALL-IN". */
  token: string
  /** "$40", "to $120", or null when no amount is recorded or none applies. */
  amount: string | null
  /** "CO 3-bet to $60". */
  short: string
  /** "Cutoff 3-bet to $60." */
  spoken: string
  problem: FlowProblem | null
  /** Seats that owed an action before this one that is not recorded. */
  skipped: number[]
}

interface Verb {
  token: string
  spoken: string
}

function verbFor(street: Street, kind: string, facing: boolean, level: number): Verb {
  switch (kind) {
    case 'fold':
      return { token: 'fold', spoken: 'folded' }
    case 'check':
      return { token: 'check', spoken: 'checked' }
    case 'call':
      // Preflop, calling only the blinds is a limp.
      return street === 'preflop' && level <= 1 ? { token: 'limp', spoken: 'limped' } : { token: 'call', spoken: 'called' }
    case 'allin':
      return { token: 'all-in', spoken: 'went all-in' }
    case 'bet':
      return { token: 'bet', spoken: 'bet' }
    default: {
      // Raises: preflop the open is a raise, then a 3-bet, a 4-bet...
      if (street === 'preflop' && level >= 3) return { token: `${level}-bet`, spoken: `${level}-bet` }
      return facing ? { token: 'raise', spoken: 'raised' } : { token: 'bet', spoken: 'bet' }
    }
  }
}

function amountWords(kind: string, amount: number | null, level: number, street: Street): string | null {
  if (amount === null) return null
  if (kind === 'allin') return `for ${formatCents(amount)}`
  if (kind === 'bet') return formatCents(amount)
  if (kind === 'raise' || (street === 'preflop' && level >= 2)) return `to ${formatCents(amount)}`
  return null
}

/** Every recorded action on a street, worded. */
export function streetActionWords(table: DraftTable, flow: StreetFlow, positions = seatPositions(table)): ActionWords[] {
  return flow.steps.map((step) => {
    const { action } = step
    const verb = verbFor(flow.street, action.action, step.facing, step.level)
    const amount = amountWords(action.action, action.amount, step.level, flow.street)
    const who = seatName(table, action.seat, positions)
    const spokenWho = seatSpokenName(table, action.seat, positions)
    return {
      id: action.id,
      seat: action.seat,
      who,
      token: verb.token.toUpperCase(),
      amount,
      short: `${who} ${verb.token}${amount ? ` ${amount}` : ''}`,
      spoken: `${spokenWho} ${verb.spoken}${amount ? ` ${amount}` : ''}.`,
      problem: step.problem,
      skipped: step.skipped,
    }
  })
}

/** "Hero bet → CO call". */
export const actionLine = (words: readonly ActionWords[]) => words.map((word) => word.short).join(' → ')

/* ---------------------------------------------------------------- summary */

export interface StreetSummary {
  street: Street
  title: string
  /** Board text for the street, null preflop or when nothing about the cards is known. */
  board: string | null
  actions: ActionWords[]
  /** "Hero bet → CO call", or "Details not recorded". */
  line: string
  /** "Flop: ten of clubs, eight of hearts, two of clubs. Hero bet. Cutoff called." */
  spoken: string
  recorded: boolean
}

export interface DraftSummary {
  /** "Hero BTN vs CO". */
  matchup: string
  /** "A♠ K♦" or "Not recorded". */
  hero: string
  streets: StreetSummary[]
  /** Empty when the hand did not reach a showdown (or nothing about it is recorded). */
  showdown: { seat: number; text: string; spoken: string }[]
  /** "Hero wins", "Split pot: Hero and CO", "Winner not recorded". */
  result: string
  /** Seats that won, as recorded or as the only player left. Null = not recorded. */
  winners: number[] | null
}

/** Winners as recorded, or the last player standing when everyone else folded. */
export function effectiveWinners(table: DraftTable, draft: HandDraft): number[] | null {
  if (draft.winners && draft.winners.length > 0) return draft.winners
  const flows = handFlow(table, draft)
  const last = flows.at(-1)
  if (last && last.live.length === 1) return [...last.live]
  return null
}

/** True when the hand went to a showdown as far as the draft says. */
export function reachedShowdown(table: DraftTable, draft: HandDraft): boolean {
  const flows = handFlow(table, draft)
  if (flows.some((flow) => flow.live.length <= 1)) return false
  if (draft.showdown.some((entry) => entry.status !== 'no-showdown')) return true
  return draft.streets.at(-1)?.street === 'river' && finalLive(table, draft).length >= 2
}

export function summarizeDraft(table: DraftTable, draft: HandDraft): DraftSummary {
  const positions = seatPositions(table)
  const flows = handFlow(table, draft)
  const streets: StreetSummary[] = draft.streets.map((street, index) => {
    const flow = flows[index]!
    const actions = streetActionWords(table, flow, positions)
    const board = boardText(street)
    const recorded = actions.length > 0
    const line = recorded ? actionLine(actions) : 'Details not recorded'
    const boardWords = boardSpoken(street)
    const spokenActions = recorded ? actions.map((word) => word.spoken).join(' ') : 'Action not recorded.'
    return {
      street: street.street,
      title: STREET_TITLE[street.street],
      board,
      actions,
      line,
      spoken: `${STREET_TITLE[street.street]}${boardWords ? `: ${boardWords}` : ''}. ${spokenActions}`,
      recorded,
    }
  })

  const showdown: DraftSummary['showdown'] = []
  if (reachedShowdown(table, draft)) {
    const live = finalLive(table, draft)
    const heroEntry = draft.showdown.find((entry) => entry.seat === table.heroSeat)
    if (heroEntry?.status === 'mucked') {
      showdown.push({ seat: table.heroSeat, text: 'Hero mucks', spoken: 'Hero mucked.' })
    } else if (draft.hero.cards.some((card) => !isUnknownCard(card))) {
      showdown.push({
        seat: table.heroSeat,
        text: `Hero shows ${holeCardsText(draft.hero)}`,
        spoken: `Hero showed ${holeCardsSpoken(draft.hero)}.`,
      })
    }
    for (const seat of live) {
      if (seat === table.heroSeat) continue
      const entry = draft.showdown.find((item) => item.seat === seat)
      const who = seatName(table, seat, positions)
      const spokenWho = seatSpokenName(table, seat, positions)
      if (entry?.status === 'shown') {
        showdown.push({
          seat,
          text: `${who} shows ${holeCardsText(entry.cards)}`,
          spoken: `${spokenWho} showed ${holeCardsSpoken(entry.cards)}.`,
        })
      } else if (entry?.status === 'mucked') {
        showdown.push({ seat, text: `${who} mucks`, spoken: `${spokenWho} mucked.` })
      } else {
        showdown.push({ seat, text: `${who}: cards unknown`, spoken: `${spokenWho}'s cards are unknown.` })
      }
    }
  }

  const winners = effectiveWinners(table, draft)
  const names = winners?.map((seat) => seatName(table, seat, positions)) ?? []
  const result =
    !winners || winners.length === 0
      ? 'Winner not recorded'
      : winners.length === 1
        ? `${names[0]!} wins`
        : `Split pot: ${joinWords(names)}`

  return {
    matchup: participantsLine(table, draft.participants),
    hero: holeCardsText(draft.hero),
    streets,
    showdown,
    result,
    winners,
  }
}

/** The plain-text summary a player copies or reads back. */
export function draftSummaryText(summary: DraftSummary, header?: string): string {
  const lines: string[] = []
  if (header) lines.push(header)
  lines.push(summary.matchup, '', `Hero: ${summary.hero}`)
  for (const street of summary.streets) {
    lines.push('', street.title)
    if (street.board) lines.push(street.board)
    lines.push(street.line)
  }
  if (summary.showdown.length > 0) {
    lines.push('', 'Showdown', ...summary.showdown.map((entry) => entry.text))
  }
  lines.push('', summary.result)
  return lines.join('\n')
}
