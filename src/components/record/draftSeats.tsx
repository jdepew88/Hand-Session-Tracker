import type { ReactNode } from 'react'
import { handFlow, type StreetFlow } from '../../domain/poker/draft/flow'
import type { HandDraft } from '../../domain/poker/draft/model'
import { seatNickname, seatPositions, streetActionWords } from '../../domain/poker/draft/text'
import type { HandSetup, Street } from '../../domain/poker/models'
import { STREETS } from '../../domain/poker/models'
import { positionName } from '../../domain/poker/tableView'
import type { RecordSeatView } from './RecordTable'
import { HoleCards } from './RememberedCard'

/**
 * The table as a draft describes it at one moment: who is in, who has
 * folded, who is to act, Hero's cards, the last action in front of each
 * seat, and any cards shown at the end.
 */
export interface DraftTableMoment {
  /** The street being looked at, or null for "before any action" / "the end". */
  street: Street | null
  /** Show showdown cards and mucks (the end of the hand). */
  end: boolean
  /** Choosing who was in the hand: nobody is folded yet. */
  choosingPlayers: boolean
  actor: number | null
}

export function draftSeatViews(setup: HandSetup, draft: HandDraft, moment: DraftTableMoment): RecordSeatView[] {
  const positions = seatPositions(setup)
  const flows = handFlow(setup, draft)
  const index = moment.street ? draft.streets.findIndex((entry) => entry.street === moment.street) : flows.length - 1
  const flow: StreetFlow | undefined = index >= 0 ? flows[index] : flows.at(-1)
  const live = moment.choosingPlayers ? draft.participants : (flow?.live ?? draft.participants)
  const allIn = moment.choosingPlayers ? [] : (flow?.allIn ?? [])
  const words = moment.street && flow && index >= 0 ? streetActionWords(setup, flow, positions) : []

  return Array.from({ length: setup.tableSize }, (_, slot) => {
    const seat = slot + 1
    const dealt = setup.seats.some((entry) => entry.seat === seat)
    if (!dealt) return { seat, position: null, empty: true, hero: false, label: `Seat ${seat}, empty` }

    const hero = seat === setup.heroSeat
    const position = positions.get(seat) ?? null
    const nickname = seatNickname(setup, seat)
    const inHand = draft.participants.includes(seat)
    const spoken = `Seat ${seat}${position ? `, ${positionName(position)}` : ''}${hero ? ', you' : ''}${nickname ? `, ${nickname}` : ''}`

    const last = words.filter((word) => word.seat === seat).at(-1)
    const lastAction = last ? (
      <span className="rc-chipnote">{`${last.token}${last.amount ? ` ${last.amount.replace(/^(to|for) /, '')}` : ''}`}</span>
    ) : null
    let spot: ReactNode = null
    if (hero && draft.hero.cards.some((card) => card.rank !== null || card.suit !== null)) {
      spot = (
        <>
          <HoleCards cards={draft.hero.cards} />
          {!moment.end && lastAction}
        </>
      )
    } else if (!hero && moment.end) {
      const entry = draft.showdown.find((item) => item.seat === seat)
      if (entry?.status === 'shown' && entry.cards) spot = <HoleCards cards={entry.cards.cards} />
      else if (entry?.status === 'mucked') spot = <span className="rc-chipnote">MUCKED</span>
    } else {
      spot = lastAction
    }

    const view: RecordSeatView = {
      seat,
      position,
      empty: false,
      hero,
      label: `${spoken}, ${inHand ? 'in the hand' : 'not in the hand'}`,
      spot,
      heroSpot: hero,
      ...(nickname ? { name: nickname } : {}),
    }
    if (!inHand) return { ...view, tone: 'out', status: 'OUT' }
    if (!live.includes(seat)) return { ...view, tone: 'folded', status: 'FOLDED' }
    if (allIn.includes(seat)) return { ...view, status: 'ALL-IN' }
    if (moment.actor === seat) return { ...view, tone: 'acting', status: 'TO ACT' }
    return view
  })
}

/** Board cards up to and including `through` (everything when null). */
export function draftBoard(draft: HandDraft, through: Street | null) {
  return draft.streets
    .filter((entry) => entry.street !== 'preflop')
    .filter((entry) => through === null || STREETS.indexOf(entry.street) <= STREETS.indexOf(through))
    .flatMap((entry) => entry.cards)
}
