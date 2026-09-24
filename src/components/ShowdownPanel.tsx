import { formatCents } from '../domain/money'
import type { Card } from '../domain/poker/cards'
import type { HandResult, HandState } from '../domain/poker/models'
import { seatTitle } from '../utils/labels'
import { CardPicker } from './CardPicker'

/**
 * Showdown entry.
 *
 * Opponent cards are optional throughout: most of the time you see one hand,
 * or none. When enough is known the winner is evaluated; when it is not, the
 * app says so and asks rather than guessing.
 */
export function ShowdownPanel({
  state,
  result,
  heroSeat,
  manualWinners,
  onReveal,
  onSetManualWinners,
}: {
  state: HandState
  result: HandResult
  heroSeat: number
  manualWinners: readonly number[]
  onReveal: (seat: number, cards: Card[]) => void
  onSetManualWinners: (seats: number[]) => void
}) {
  const live = state.activeSeats

  return (
    <section className="space-y-4 px-3 py-4">
      <div>
        <h2 className="text-lg font-semibold">Showdown</h2>
        <p className="mt-1 text-sm text-room-400">
          Enter the cards you saw. Leave a player blank if their hand was never shown.
        </p>
      </div>

      {live.map((seatNumber) => {
        const seat = state.seats.get(seatNumber)!
        const entry = result.showdown.find((item) => item.seat === seatNumber)
        return (
          <div key={seatNumber} className="space-y-2">
            <CardPicker
              legend={`${seatTitle(seat, heroSeat)} — seat ${seatNumber}`}
              count={2}
              value={seat.cards}
              usedCards={state.usedCards}
              onChange={(cards) => onReveal(seatNumber, cards)}
            />
            {entry?.ranking && (
              <p className="px-1 text-sm text-felt-200">Has {entry.ranking.description}.</p>
            )}
          </div>
        )
      })}

      {result.undetermined && (
        <fieldset className="card-surface p-3">
          <legend className="px-1 text-xs font-medium uppercase tracking-wide text-room-400">
            Who won?
          </legend>
          <p className="mb-3 text-sm text-room-400">
            Not every hand is known, so the winner cannot be worked out. Pick the winner, or more
            than one for a split pot.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {live.map((seatNumber) => {
              const seat = state.seats.get(seatNumber)!
              const selected = manualWinners.includes(seatNumber)
              return (
                <button
                  key={seatNumber}
                  type="button"
                  aria-pressed={selected}
                  onClick={() =>
                    onSetManualWinners(
                      selected
                        ? manualWinners.filter((entry) => entry !== seatNumber)
                        : [...manualWinners, seatNumber],
                    )
                  }
                  className={`tap rounded-lg border px-3 py-2 text-sm font-semibold ${
                    selected
                      ? 'border-felt-400 bg-felt-500 text-room-950'
                      : 'border-room-700 bg-room-850'
                  }`}
                >
                  {seatTitle(seat, heroSeat)}
                </button>
              )
            })}
          </div>
        </fieldset>
      )}

      {!result.undetermined && result.winners.length > 0 && (
        <p className="rounded-lg border border-felt-500/40 bg-felt-700/20 px-3 py-2 text-sm">
          {result.winners
            .map((seat) => seatTitle(state.seats.get(seat)!, heroSeat))
            .join(' and ')}{' '}
          {result.winners.length > 1 ? 'split' : 'wins'}{' '}
          <span className="tabular font-semibold">{formatCents(result.netPot)}</span>.
        </p>
      )}
    </section>
  )
}
