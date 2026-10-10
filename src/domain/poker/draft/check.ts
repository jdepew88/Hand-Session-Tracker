import type { Cents } from '../../money'
import { RANK_PLURAL, findDuplicateCards, type Rank } from '../cards'
import { compareRankings, evaluateHand } from '../evaluator'
import { STREETS, type HandRanking, type Street } from '../models'
import { MAX_AMOUNT } from '../validation'
import { finalLive, handFlow, type DraftTable, type FlowProblem } from './flow'
import { exactCards, exactHoleCards, holeCardsKnown, isExactCard, isPair, isUnknownCard } from './memory'
import { BOARD_SLOTS, SIZED_ACTIONS, type CardMemory, type FlopSuits, type HandDraft, type HoleCardsMemory } from './model'
import { STREET_TITLE, effectiveWinners, reachedShowdown, seatName, seatPositions } from './text'

/**
 * Two different questions about a draft:
 *
 * - **errors**: could this hand have happened at all? The same physical card
 *   twice, a player checking into a bet, a winner who folded. A draft with
 *   errors cannot be saved.
 * - **gaps**: what is not recorded? Missing amounts, an unremembered street,
 *   an opponent's unseen cards. Gaps are normal -- a hand with gaps saves
 *   fine and says plainly what it does not know.
 *
 * Warnings sit between: allowed, but worth a second look (the cards entered
 * say someone else won).
 */

export interface DraftCheck {
  errors: string[]
  gaps: string[]
  warnings: string[]
}

export type CheckTable = DraftTable & { bigBlind?: Cents }

const PROBLEM_TEXT: Record<FlowProblem, (who: string) => string> = {
  'not-participant': (who) => `${who} is not in the hand.`,
  folded: (who) => `${who} has already folded.`,
  'all-in': (who) => `${who} is already all-in.`,
  'street-over': (who) => `${who} acts after the betting was over.`,
  'already-acted': (who) => `${who} acts twice without a bet or raise in between.`,
  'check-facing-bet': (who) => `${who} cannot check facing a bet.`,
  'nothing-to-call': (who) => `${who} has nothing to call.`,
  'bet-facing-bet': (who) => `${who} cannot bet into a bet; that is a raise.`,
  'raise-without-bet': (who) => `${who} cannot raise with no bet in front; that is a bet.`,
}

export function checkDraft(table: CheckTable, draft: HandDraft): DraftCheck {
  const errors: string[] = []
  const gaps: string[] = []
  const warnings: string[] = []
  const positions = seatPositions(table)
  const name = (seat: number) => seatName(table, seat, positions)
  const dealt = new Set(table.seats.map((seat) => seat.seat))

  /* ---------------------------------------------------------- players */

  if (!draft.participants.includes(table.heroSeat)) errors.push('Hero must be in the hand.')
  if (new Set(draft.participants).size !== draft.participants.length) errors.push('A player is listed twice.')
  for (const seat of draft.participants) {
    if (!dealt.has(seat)) errors.push(`Seat ${seat} is not dealt in at this table.`)
  }
  if (draft.participants.length < 2) errors.push('Choose who Hero played against.')

  /* ---------------------------------------------------------- streets */

  draft.streets.forEach((street, index) => {
    if (street.street !== STREETS[index]) errors.push('The streets are out of order.')
    if (street.cards.length !== BOARD_SLOTS[street.street]) {
      errors.push(`The ${street.street} must have ${BOARD_SLOTS[street.street]} card slots.`)
    }
    if (street.suits && street.street !== 'flop') errors.push('Only the flop has a suit pattern.')
  })
  if (draft.streets.length === 0) errors.push('The hand has no preflop.')

  /* ------------------------------------------------------------ cards */

  const heroExact = exactCards(draft.hero.cards)
  const boardMemory = draft.streets.flatMap((street) => street.cards)
  const shown = draft.showdown.filter((entry) => entry.status === 'shown' && entry.cards)
  const duplicates = findDuplicateCards([
    heroExact,
    exactCards(boardMemory),
    ...shown.map((entry) => exactCards(entry.cards!.cards)),
  ])
  if (duplicates.length > 0) errors.push(`The same card appears more than once: ${duplicates.join(', ')}.`)

  const ranks = new Map<Rank, number>()
  for (const card of [...draft.hero.cards, ...boardMemory, ...shown.flatMap((entry) => entry.cards!.cards)]) {
    if (card.rank) ranks.set(card.rank, (ranks.get(card.rank) ?? 0) + 1)
  }
  for (const [rank, count] of ranks) if (count > 4) errors.push(`There are only four ${RANK_PLURAL[rank]} in a deck.`)

  holeProblems(draft.hero, 'Hero', errors)
  for (const entry of shown) holeProblems(entry.cards!, name(entry.seat), errors)

  const flop = draft.streets.find((street) => street.street === 'flop')
  if (flop?.suits) {
    const problem = flopSuitsProblem(flop.suits, flop.cards)
    if (problem) errors.push(problem)
  }

  /* ----------------------------------------------------------- action */

  const flows = handFlow(table, draft)
  let endedOn: Street | null = null
  flows.forEach((flow, index) => {
    const street = draft.streets[index]!
    const title = STREET_TITLE[flow.street]
    if (endedOn) {
      errors.push(`The hand was over before the ${flow.street}: everyone else folded on the ${endedOn}.`)
      return
    }

    let lastAmount: Cents | null = null
    for (const step of flow.steps) {
      const who = name(step.action.seat)
      if (step.problem) {
        errors.push(`${title}: ${PROBLEM_TEXT[step.problem](who)}`)
        continue
      }
      for (const seat of step.skipped) gaps.push(`${title}: ${name(seat)}'s action`)
      const { amount } = step.action
      if (!SIZED_ACTIONS.includes(step.action.action)) continue
      if (amount === null) {
        // An all-in without an amount is everything the player had left: nothing is missing.
        if (step.action.action !== 'allin') gaps.push(`${title}: ${who}'s ${step.action.action} amount`)
        continue
      }
      if (!Number.isInteger(amount) || amount <= 0 || amount > MAX_AMOUNT) {
        errors.push(`${title}: ${who}'s amount is not a valid amount.`)
        continue
      }
      if (flow.street === 'preflop' && table.bigBlind !== undefined && amount <= table.bigBlind && step.action.action !== 'allin') {
        errors.push(`${title}: ${who}'s raise must be more than the big blind.`)
      }
      if (lastAmount !== null && amount <= lastAmount && step.action.action !== 'allin') {
        errors.push(`${title}: ${who}'s raise must be larger than the bet before it.`)
      }
      lastAmount = Math.max(lastAmount ?? 0, amount)
    }

    if (street.actions.length === 0) gaps.push(`${title} action`)
    else if (flow.toAct.length > 0 && flow.live.length > 1) gaps.push(`${title}: the rest of the action`)
    if (flow.live.length <= 1 && street.actions.length > 0) endedOn = flow.street

    if (flow.street !== 'preflop') {
      if (street.cards.every(isUnknownCard)) gaps.push(`${title} cards`)
      else if (!street.cards.every(isExactCard)) gaps.push(`${title}: exact cards`)
    }
  })

  /* ------------------------------------------------------- hero, showdown */

  if (!holeCardsKnown(draft.hero)) gaps.push("Hero's cards")
  else if (!exactHoleCards(draft.hero)) gaps.push("Hero's exact cards")

  const live = finalLive(table, draft)
  const folded = new Set(draft.participants.filter((seat) => !flows.at(-1)?.live.includes(seat)))
  for (const entry of draft.showdown) {
    if (!draft.participants.includes(entry.seat)) {
      errors.push(`Seat ${entry.seat} is not in the hand.`)
      continue
    }
    if (entry.seat === table.heroSeat && entry.status !== 'shown' && entry.status !== 'mucked') {
      errors.push("Hero's showdown can only be shown or mucked.")
    }
    if ((entry.status === 'shown' || entry.status === 'mucked') && folded.has(entry.seat)) {
      errors.push(`${name(entry.seat)} folded, so cannot show or muck at showdown.`)
    }
  }

  if (reachedShowdown(table, draft)) {
    for (const seat of live) {
      if (seat === table.heroSeat) continue
      const entry = draft.showdown.find((item) => item.seat === seat)
      if (!entry || entry.status === 'unknown') gaps.push(`${name(seat)}'s cards`)
      else if (entry.status === 'shown' && !exactHoleCards(entry.cards)) gaps.push(`${name(seat)}'s exact cards`)
    }
  }

  /* ----------------------------------------------------------- winners */

  if (draft.winners) {
    for (const seat of draft.winners) {
      if (!draft.participants.includes(seat)) errors.push(`Seat ${seat} is not in the hand, so cannot win it.`)
      else if (!live.includes(seat)) errors.push(`${name(seat)} folded, so cannot have won.`)
    }
  }
  if (!effectiveWinners(table, draft)) gaps.push('Winner')

  const evaluated = evaluatedWinners(table, draft, live)
  if (evaluated && draft.winners) {
    const same = evaluated.length === draft.winners.length && evaluated.every((seat) => draft.winners!.includes(seat))
    if (!same) {
      warnings.push(
        `The cards entered give the pot to ${evaluated.map(name).join(' and ')}. Check the cards or the winner.`,
      )
    }
  }

  if (draft.pot !== null && (!Number.isInteger(draft.pot) || draft.pot <= 0 || draft.pot > MAX_AMOUNT)) {
    errors.push('The pot is not a valid amount.')
  }

  return { errors: [...new Set(errors)], gaps: [...new Set(gaps)], warnings }
}

function holeProblems(hole: HoleCardsMemory, who: string, errors: string[]) {
  const [first, second] = hole.cards
  if (isExactCard(first) && isExactCard(second) && first.rank === second.rank && first.suit === second.suit) {
    errors.push(`${who} has the same card twice.`)
  }
  if (hole.suited === true && isPair(hole)) errors.push(`${who}'s pair cannot be suited.`)
}

function flopSuitsProblem(suits: FlopSuits, cards: readonly CardMemory[]): string | null {
  const known = cards.map((card) => card.suit).filter((suit) => suit !== null)
  const counts = new Map<string, number>()
  for (const suit of known) counts.set(suit, (counts.get(suit) ?? 0) + 1)
  const largest = Math.max(0, ...counts.values())
  switch (suits.kind) {
    case 'rainbow':
      return largest > 1 ? 'A rainbow flop has three different suits.' : null
    case 'monotone': {
      if (counts.size > 1) return 'A monotone flop has one suit.'
      if (suits.suit && known.some((suit) => suit !== suits.suit)) return 'The flop suits do not match the cards.'
      return null
    }
    case 'two-tone': {
      if (largest > 2 || (known.length === 3 && largest !== 2)) return 'A two-tone flop has exactly two cards of one suit.'
      if (suits.suit) {
        const matching = known.filter((suit) => suit === suits.suit).length
        const other = known.length - matching
        if (matching > 2 || other > 1) return 'The flop suits do not match the cards.'
      }
      return null
    }
  }
}

/**
 * Winners by the cards, when every card needed is known: five board cards and
 * both hole cards of everyone left. Null otherwise.
 */
function evaluatedWinners(table: DraftTable, draft: HandDraft, live: readonly number[]): number[] | null {
  if (live.length < 2) return null
  const board = exactCards(draft.streets.flatMap((street) => street.cards))
  if (board.length !== 5) return null
  const rankings: { seat: number; ranking: HandRanking }[] = []
  for (const seat of live) {
    const hole =
      seat === table.heroSeat
        ? exactHoleCards(draft.hero)
        : exactHoleCards(draft.showdown.find((entry) => entry.seat === seat && entry.status === 'shown')?.cards ?? null)
    const ranking = hole ? evaluateHand([...hole, ...board]) : null
    if (!ranking) return null
    rankings.push({ seat, ranking })
  }
  let best: HandRanking | null = null
  let winners: number[] = []
  for (const { seat, ranking } of rankings) {
    const comparison = best ? compareRankings(ranking, best) : 1
    if (comparison > 0) {
      best = ranking
      winners = [seat]
    } else if (comparison === 0) winners.push(seat)
  }
  return winners.sort((a, b) => a - b)
}

/** Errors only: what blocks saving. */
export const draftErrors = (table: CheckTable, draft: HandDraft) => checkDraft(table, draft).errors
