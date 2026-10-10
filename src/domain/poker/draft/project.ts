import type { HandEvent, HandSetup, Street } from '../models'
import { replay } from '../reducer'
import { computeResult } from '../showdown'
import { rememberCard } from './memory'
import {
  DRAFT_VERSION,
  type CardMemory,
  type DraftAction,
  type DraftActionKind,
  type DraftStreet,
  type HandDraft,
  type HoleCardsMemory,
  type ShowdownMemory,
} from './model'

/**
 * A live-tracked hand, retold as a draft.
 *
 * Live hands keep their exact event log as their source of truth; this is a
 * read-only view of one in the draft's shape, so the timeline, the summary
 * and anything that later reads drafts (search, an AI reviewer) handle both
 * kinds of hand with one code path.
 *
 * A seat whose only action was a preflop fold is not a participant: it is the
 * "everyone else folded" a reconstructed hand leaves unsaid. Feeding the
 * result back through `reconstructHand` reproduces the same pot and result.
 */
export function draftFromEvents(setup: HandSetup, events: readonly HandEvent[], manualWinners: readonly number[] = []): HandDraft {
  const actionsBySeat = new Map<number, ActionEventLike[]>()
  const streets: DraftStreet[] = [{ street: 'preflop', cards: [], suits: null, actions: [] }]
  const reveals = new Map<number, HoleCardsMemory>()

  events.forEach((event, index) => {
    if (event.kind === 'deal') {
      const slots = event.street === 'flop' ? 3 : 1
      const cards: CardMemory[] = event.cards.map(rememberCard)
      while (cards.length < slots) cards.push({ rank: null, suit: null })
      streets.push({ street: event.street, cards, suits: null, actions: [] })
      return
    }
    if (event.kind === 'reveal') {
      const [first, second] = event.cards
      if (first && second) reveals.set(event.seat, { cards: [rememberCard(first), rememberCard(second)], suited: null })
      return
    }
    const before = replay(setup, events.slice(0, index))
    const after = replay(setup, events.slice(0, index + 1))
    const allIn = after.seats.get(event.seat)?.allIn === true && before.seats.get(event.seat)?.allIn !== true
    const aggressive = event.action === 'bet' || event.action === 'raise'
    const kind: DraftActionKind = aggressive && allIn ? 'allin' : event.action
    const action: DraftAction = {
      id: event.id,
      seat: event.seat,
      action: kind,
      amount: aggressive ? event.to : null,
    }
    const list = actionsBySeat.get(event.seat) ?? []
    list.push({ street: event.street, action })
    actionsBySeat.set(event.seat, list)
    streetFor(streets, event.street).actions.push(action)
  })

  const final = replay(setup, events)
  const participants = setup.seats
    .map((seat) => seat.seat)
    .filter((seat) => {
      if (seat === setup.heroSeat) return true
      if (final.activeSeats.includes(seat)) return true
      return (actionsBySeat.get(seat) ?? []).some((entry) => entry.action.action !== 'fold')
    })

  // Non-participants' folds are the unspoken "everyone else folded".
  for (const street of streets) {
    street.actions = street.actions.filter((action) => participants.includes(action.seat))
  }

  const heroCards = setup.heroCards
  const hero: HoleCardsMemory =
    heroCards.length === 2
      ? { cards: [rememberCard(heroCards[0]!), rememberCard(heroCards[1]!)], suited: null }
      : { cards: [{ rank: null, suit: null }, { rank: null, suit: null }], suited: null }

  const showdown: ShowdownMemory[] = []
  if (final.status === 'showdown') {
    for (const seat of final.activeSeats) {
      if (seat === setup.heroSeat) continue
      const cards = reveals.get(seat)
      showdown.push(cards ? { seat, status: 'shown', cards } : { seat, status: 'unknown', cards: null })
    }
  }

  const result = computeResult(setup, final, manualWinners)
  const winners = result.undetermined || result.winners.length === 0 ? null : result.winners

  return { version: DRAFT_VERSION, participants, hero, streets, showdown, winners, pot: null }
}

interface ActionEventLike {
  street: Street
  action: DraftAction
}

function streetFor(streets: DraftStreet[], street: Street): DraftStreet {
  return streets.find((entry) => entry.street === street) ?? streets[streets.length - 1]!
}
