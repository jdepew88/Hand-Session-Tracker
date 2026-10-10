import type { Cents } from '../../money'
import type { Street } from '../models'
import { STREETS } from '../models'
import { aggressiveKind, flowFor, type DraftTable } from './flow'
import {
  BOARD_SLOTS,
  DRAFT_VERSION,
  SIZED_ACTIONS,
  UNKNOWN_CARD,
  unknownHoleCards,
  type CardMemory,
  type DraftAction,
  type DraftActionKind,
  type DraftStreet,
  type FlopSuits,
  type HandDraft,
  type HoleCardsMemory,
  type ShowdownMemory,
  type ShowdownStatus,
} from './model'

/**
 * Editing a draft. Every function is pure: it takes a draft and returns a new
 * one. The recorder's buttons call these; a future voice or text parser calls
 * the very same functions, so both produce the same hand.
 *
 * These keep a draft tidy (an aggressive action is named bet or raise to fit
 * the street, a street's board always has the right number of slots, dropping
 * a player drops their actions) but never fill in anything the player did not
 * say.
 */

const newActionId = () => crypto.randomUUID()

function emptyStreet(street: Street): DraftStreet {
  return {
    street,
    cards: Array.from({ length: BOARD_SLOTS[street] }, () => ({ ...UNKNOWN_CARD })),
    suits: null,
    actions: [],
  }
}

/** A new draft at this table: Hero in the hand, nothing else known yet. */
export function createDraft(table: Pick<DraftTable, 'heroSeat'>): HandDraft {
  return {
    version: DRAFT_VERSION,
    participants: [table.heroSeat],
    hero: unknownHoleCards(),
    streets: [emptyStreet('preflop')],
    showdown: [],
    winners: null,
    pot: null,
  }
}

/* ----------------------------------------------------------- participants */

/** Put a seat in or out of the hand. Hero always stays in; leaving drops everything recorded for the seat. */
export function setParticipant(draft: HandDraft, table: DraftTable, seat: number, inHand: boolean): HandDraft {
  if (seat === table.heroSeat) return draft
  if (!table.seats.some((entry) => entry.seat === seat)) return draft
  if (inHand) {
    if (draft.participants.includes(seat)) return draft
    return { ...draft, participants: [...draft.participants, seat].sort((a, b) => a - b) }
  }
  if (!draft.participants.includes(seat)) return draft
  return {
    ...draft,
    participants: draft.participants.filter((entry) => entry !== seat),
    streets: draft.streets.map((street) => ({
      ...street,
      actions: street.actions.filter((action) => action.seat !== seat),
    })),
    showdown: draft.showdown.filter((entry) => entry.seat !== seat),
    winners: draft.winners ? nullIfEmpty(draft.winners.filter((winner) => winner !== seat)) : null,
  }
}

export const setParticipants = (draft: HandDraft, table: DraftTable, seats: readonly number[]): HandDraft => {
  let next = draft
  for (const seat of draft.participants) if (!seats.includes(seat)) next = setParticipant(next, table, seat, false)
  for (const seat of seats) next = setParticipant(next, table, seat, true)
  return next
}

const nullIfEmpty = (seats: number[]) => (seats.length === 0 ? null : seats)

/* --------------------------------------------------------------- hero */

export const setHeroCards = (draft: HandDraft, hero: HoleCardsMemory): HandDraft => ({ ...draft, hero })

export function setHeroCard(draft: HandDraft, index: 0 | 1, card: CardMemory): HandDraft {
  const cards: [CardMemory, CardMemory] = [...draft.hero.cards]
  cards[index] = { ...card }
  return { ...draft, hero: { ...draft.hero, cards } }
}

export const setHeroSuited = (draft: HandDraft, suited: boolean | null): HandDraft => ({
  ...draft,
  hero: { ...draft.hero, suited },
})

export const clearHeroCards = (draft: HandDraft): HandDraft => ({ ...draft, hero: unknownHoleCards() })

/* -------------------------------------------------------------- streets */

/** Make sure the hand reaches `street`, adding any street before it with nothing known. */
export function reachStreet(draft: HandDraft, street: Street): HandDraft {
  const target = STREETS.indexOf(street)
  if (draft.streets.length > target) return draft
  const streets = [...draft.streets]
  for (let index = streets.length; index <= target; index += 1) streets.push(emptyStreet(STREETS[index]!))
  return { ...draft, streets }
}

/** Drop `street` and everything after it: the hand ended before then. */
export function dropStreetsFrom(draft: HandDraft, street: Street): HandDraft {
  const index = STREETS.indexOf(street)
  if (index <= 0) return draft
  return { ...draft, streets: draft.streets.slice(0, index) }
}

function updateStreet(draft: HandDraft, street: Street, change: (entry: DraftStreet) => DraftStreet): HandDraft {
  const reached = reachStreet(draft, street)
  return {
    ...reached,
    streets: reached.streets.map((entry) => (entry.street === street ? change(entry) : entry)),
  }
}

export function setBoardCard(draft: HandDraft, street: Exclude<Street, 'preflop'>, index: number, card: CardMemory): HandDraft {
  if (index < 0 || index >= BOARD_SLOTS[street]) return draft
  return updateStreet(draft, street, (entry) => ({
    ...entry,
    cards: entry.cards.map((existing, slot) => (slot === index ? { ...card } : existing)),
  }))
}

export const setFlopSuits = (draft: HandDraft, suits: FlopSuits | null): HandDraft =>
  updateStreet(draft, 'flop', (entry) => ({ ...entry, suits }))

/* -------------------------------------------------------------- actions */

export interface NewAction {
  seat: number
  action: DraftActionKind
  amount?: Cents | null
  id?: string
}

/**
 * Append an action to a street. A bet facing a bet becomes a raise and a
 * raise into nothing becomes a bet, so the recorder can offer one
 * "Bet / Raise" button. Amounts only stick to bets, raises and all-ins.
 */
export function addAction(draft: HandDraft, table: DraftTable, street: Street, next: NewAction): HandDraft {
  const reached = reachStreet(draft, street)
  const flow = flowFor(table, reached, street)
  let kind = next.action
  if (kind === 'bet' || kind === 'raise') kind = aggressiveKind(flow)
  const action: DraftAction = {
    id: next.id ?? newActionId(),
    seat: next.seat,
    action: kind,
    amount: SIZED_ACTIONS.includes(kind) ? (next.amount ?? null) : null,
  }
  return updateStreet(reached, street, (entry) => ({ ...entry, actions: [...entry.actions, action] }))
}

/** Append several actions in order. */
export function addActions(draft: HandDraft, table: DraftTable, street: Street, actions: readonly NewAction[]): HandDraft {
  return actions.reduce((current, action) => addAction(current, table, street, action), draft)
}

export function setActionAmount(draft: HandDraft, street: Street, actionId: string, amount: Cents | null): HandDraft {
  return updateStreet(draft, street, (entry) => ({
    ...entry,
    actions: entry.actions.map((action) =>
      action.id === actionId && SIZED_ACTIONS.includes(action.action) ? { ...action, amount } : action,
    ),
  }))
}

export function removeAction(draft: HandDraft, street: Street, actionId: string): HandDraft {
  return updateStreet(draft, street, (entry) => ({
    ...entry,
    actions: entry.actions.filter((action) => action.id !== actionId),
  }))
}

/** Remove the last action on a street. */
export function undoAction(draft: HandDraft, street: Street): HandDraft {
  const entry = draft.streets.find((item) => item.street === street)
  const last = entry?.actions.at(-1)
  return last ? removeAction(draft, street, last.id) : draft
}

/** "Don't remember": the street's action is not recorded. */
export const clearStreetActions = (draft: HandDraft, street: Street): HandDraft =>
  draft.streets.some((entry) => entry.street === street)
    ? updateStreet(draft, street, (entry) => ({ ...entry, actions: [] }))
    : draft

/* ------------------------------------------------------------- showdown */

export function setShowdown(
  draft: HandDraft,
  seat: number,
  status: ShowdownStatus,
  cards: HoleCardsMemory | null = null,
): HandDraft {
  const entry: ShowdownMemory = {
    seat,
    status,
    cards: status === 'shown' ? (cards ?? unknownHoleCards()) : null,
  }
  const others = draft.showdown.filter((item) => item.seat !== seat)
  const winners =
    status === 'no-showdown' && draft.winners ? nullIfEmpty(draft.winners.filter((winner) => winner !== seat)) : draft.winners
  return { ...draft, showdown: [...others, entry].sort((a, b) => a.seat - b.seat), winners }
}

export const clearShowdown = (draft: HandDraft, seat: number): HandDraft => ({
  ...draft,
  showdown: draft.showdown.filter((entry) => entry.seat !== seat),
})

/** Who won. Pass several seats for a split pot, or null for "not recorded". */
export const setWinners = (draft: HandDraft, winners: readonly number[] | null): HandDraft => ({
  ...draft,
  winners: winners && winners.length > 0 ? [...new Set(winners)].sort((a, b) => a - b) : null,
})

export const setPot = (draft: HandDraft, pot: Cents | null): HandDraft => ({ ...draft, pot })
