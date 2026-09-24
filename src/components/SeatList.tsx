import { formatCents } from '../domain/money'
import type { HandState } from '../domain/poker/models'
import { CardRow } from './PlayingCard'

/**
 * Every seat in the hand, with the numbers that matter while recording.
 *
 * Status is carried by a text badge, not by colour alone: "folded", "all-in"
 * and "to act" are readable in greyscale and by a screen reader.
 */
export function SeatList({
  state,
  heroSeat,
  showCards = false,
}: {
  state: HandState
  heroSeat: number
  showCards?: boolean
}) {
  return (
    <ul aria-label="Players in this hand" className="divide-y divide-room-800">
      {state.seatOrder.map((seatNumber) => {
        const seat = state.seats.get(seatNumber)!
        const acting = state.actingSeat === seatNumber
        const isHero = seatNumber === heroSeat

        return (
          <li
            key={seatNumber}
            className={`flex items-center gap-3 px-3 py-2.5 ${seat.folded ? 'opacity-50' : ''} ${
              acting ? 'bg-felt-700/20' : ''
            }`}
          >
            <span
              aria-hidden="true"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-room-700 bg-room-850 text-xs font-semibold tabular"
            >
              {seatNumber}
            </span>

            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 truncate text-sm font-semibold">
                <span>{seat.position}</span>
                {isHero && <span className="chip border-felt-500/50 text-felt-200">Hero</span>}
                {seat.label && <span className="truncate font-normal text-room-300">{seat.label}</span>}
              </p>
              <p className="text-xs text-room-400 tabular">
                Stack {formatCents(seat.stack)}
                {seat.committed > 0 && <>{' · in '}{formatCents(seat.committed)}</>}
              </p>
            </div>

            {showCards && seat.cards.length > 0 && <CardRow cards={seat.cards} size="sm" />}

            <span className="shrink-0 text-xs font-medium">
              {seat.folded ? (
                <span className="text-room-500">Folded</span>
              ) : seat.allIn ? (
                <span className="text-chip-amber">All-in</span>
              ) : acting ? (
                <span className="text-felt-400">To act</span>
              ) : (
                <span className="text-room-500">&nbsp;</span>
              )}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
