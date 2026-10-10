import { useMemo } from 'react'
import { formatCents, type Cents } from '../domain/money'
import type { HandSetup, Session } from '../domain/poker/models'
import { derivePositions } from '../domain/poker/positions'
import { MoneyField } from './MoneyField'

/**
 * Adjustments to one hand's setup: the button, Hero's seat, who is dealt in,
 * stacks, blinds and a straddle. Every value already comes from the table,
 * so this is optional and folded away; the recorder never asks for it.
 *
 * Seats are what the app stores; position is derived from the button every
 * hand, so moving the button is one tap and every label follows. The position
 * shortcut underneath does the same job from the other direction -- pick "CO"
 * and it selects whichever seat is the cutoff this hand -- for players who
 * think in positions rather than chair numbers.
 */
export function HandSetupPanel({
  setup,
  session,
  onChange,
}: {
  setup: HandSetup
  session: Session
  onChange: (setup: HandSetup) => void
}) {
  const allSeats = useMemo(
    () => Array.from({ length: setup.tableSize }, (_, index) => index + 1),
    [setup.tableSize],
  )
  const dealtSeats = setup.seats.map((seat) => seat.seat)
  const positions = derivePositions(dealtSeats, setup.buttonSeat)
  const heroPosition = positions.get(setup.heroSeat)

  const positionOrder = [...positions.entries()].map(([seat, position]) => ({ seat, position }))

  const setSeatStack = (seat: number, startingStack: Cents) =>
    onChange({
      ...setup,
      seats: setup.seats.map((entry) => (entry.seat === seat ? { ...entry, startingStack } : entry)),
    })

  const toggleSeat = (seat: number) => {
    const dealt = dealtSeats.includes(seat)
    if (dealt) {
      // Hero and the button have to stay in the hand.
      if (seat === setup.heroSeat || seat === setup.buttonSeat) return
      if (setup.seats.length <= 2) return
      onChange({
        ...setup,
        seats: setup.seats.filter((entry) => entry.seat !== seat),
        straddles: setup.straddles.filter((straddle) => straddle.seat !== seat),
      })
      return
    }
    onChange({
      ...setup,
      seats: [...setup.seats, { seat, startingStack: session.startingStack }].sort(
        (a, b) => a.seat - b.seat,
      ),
    })
  }

  const straddleSeat = setup.straddles[0]?.seat ?? null
  const firstAfterBigBlind = () => {
    const bb = [...positions.entries()].find(([, position]) => position === 'BB')?.[0]
    if (bb === undefined) return dealtSeats[0]!
    const sorted = [...dealtSeats].sort((a, b) => a - b)
    const after = sorted.filter((seat) => seat > bb)
    return (after[0] ?? sorted[0])!
  }

  return (
    <div className="space-y-5">
      <SeatChooser
        label="Dealer button"
        seats={dealtSeats}
        selected={setup.buttonSeat}
        positions={positions}
        onSelect={(seat) => onChange({ ...setup, buttonSeat: seat })}
      />

      <SeatChooser
        label="Your seat"
        seats={dealtSeats}
        selected={setup.heroSeat}
        positions={positions}
        onSelect={(seat) => onChange({ ...setup, heroSeat: seat })}
      />

      <div>
        <p className="label">Or pick your position</p>
        <div className="flex flex-wrap gap-1.5">
          {positionOrder.map(({ seat, position }) => (
            <button
              key={position}
              type="button"
              aria-pressed={setup.heroSeat === seat}
              onClick={() => onChange({ ...setup, heroSeat: seat })}
              className={`tap rounded-lg border px-3 py-2 text-sm font-semibold ${
                setup.heroSeat === seat
                  ? 'border-felt-400 bg-felt-500 text-room-950'
                  : 'border-room-700 bg-room-850'
              }`}
            >
              {position}
            </button>
          ))}
        </div>
        {heroPosition && (
          <p className="mt-2 text-sm text-room-300">
            You are in the <span className="font-semibold text-room-50">{heroPosition}</span> with
            the button on seat {setup.buttonSeat}.
          </p>
        )}
      </div>

      <details className="card-surface p-3">
        <summary className="cursor-pointer text-sm font-semibold">
          Players in the hand
          <span className="ml-2 font-normal text-room-400">{setup.seats.length} dealt in</span>
        </summary>
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {allSeats.map((seat) => {
              const dealt = dealtSeats.includes(seat)
              const locked = seat === setup.heroSeat || seat === setup.buttonSeat
              return (
                <button
                  key={seat}
                  type="button"
                  aria-pressed={dealt}
                  disabled={locked && dealt}
                  onClick={() => toggleSeat(seat)}
                  className={`tap rounded-lg border px-3 py-2 text-sm font-semibold tabular disabled:opacity-60 ${
                    dealt ? 'border-felt-400 bg-room-800 text-room-50' : 'border-room-700 bg-room-850 text-room-500'
                  }`}
                >
                  {seat}
                </button>
              )
            })}
          </div>
          <p className="text-xs text-room-400">
            Tap a seat to sit a player out. Your seat and the button stay in the hand.
          </p>

          <ul className="space-y-2">
            {setup.seats.map((seat) => (
              <li key={seat.seat} className="flex items-end gap-3">
                <span className="w-24 shrink-0 text-sm">
                  <span className="font-semibold">{positions.get(seat.seat) ?? `Seat ${seat.seat}`}</span>
                  <span className="block text-xs text-room-400">
                    {seat.label || `Seat ${seat.seat}`}
                  </span>
                </span>
                <div className="flex-1">
                  <MoneyField
                    label="Stack"
                    value={seat.startingStack}
                    onChange={(value) => setSeatStack(seat.seat, value)}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </details>

      <details className="card-surface p-3">
        <summary className="cursor-pointer text-sm font-semibold">
          Blinds, ante and straddle
          <span className="ml-2 font-normal text-room-400">
            {formatCents(setup.smallBlind)}/{formatCents(setup.bigBlind)}
          </span>
        </summary>
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <MoneyField
              label="Small blind"
              value={setup.smallBlind}
              onChange={(value) => onChange({ ...setup, smallBlind: value })}
            />
            <MoneyField
              label="Big blind"
              value={setup.bigBlind}
              onChange={(value) => onChange({ ...setup, bigBlind: value })}
            />
          </div>

          <label className="flex items-center gap-3 py-1">
            <input
              type="checkbox"
              className="h-5 w-5 rounded border-room-700 bg-room-850 accent-felt-500"
              checked={straddleSeat !== null}
              onChange={(event) =>
                onChange({
                  ...setup,
                  straddles: event.target.checked
                    ? [
                        {
                          seat: firstAfterBigBlind(),
                          amount: session.straddleAmount ?? setup.bigBlind * 2,
                        },
                      ]
                    : [],
                })
              }
            />
            <span className="text-sm">Straddle posted</span>
          </label>

          {setup.straddles.map((straddle, index) => (
            <div key={straddle.seat} className="space-y-3 rounded-lg border border-room-700 p-3">
              <SeatChooser
                label="Straddle seat"
                seats={dealtSeats}
                selected={straddle.seat}
                positions={positions}
                onSelect={(seat) =>
                  onChange({
                    ...setup,
                    straddles: setup.straddles.map((entry, i) =>
                      i === index ? { ...entry, seat } : entry,
                    ),
                  })
                }
              />
              <MoneyField
                label="Straddle amount"
                value={straddle.amount}
                onChange={(amount) =>
                  onChange({
                    ...setup,
                    straddles: setup.straddles.map((entry, i) =>
                      i === index ? { ...entry, amount } : entry,
                    ),
                  })
                }
              />
            </div>
          ))}
        </div>
      </details>
    </div>
  )
}

function SeatChooser({
  label,
  seats,
  selected,
  positions,
  onSelect,
}: {
  label: string
  seats: readonly number[]
  selected: number
  positions: ReadonlyMap<number, string>
  onSelect: (seat: number) => void
}) {
  return (
    <fieldset>
      <legend className="label">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {seats.map((seat) => (
          <button
            key={seat}
            type="button"
            aria-pressed={selected === seat}
            onClick={() => onSelect(seat)}
            className={`tap flex flex-col items-center justify-center rounded-lg border px-3 py-1.5 leading-tight ${
              selected === seat
                ? 'border-felt-400 bg-felt-500 text-room-950'
                : 'border-room-700 bg-room-850'
            }`}
          >
            <span className="text-sm font-semibold tabular">{seat}</span>
            <span className="text-[0.65rem] opacity-80">{positions.get(seat) ?? ''}</span>
          </button>
        ))}
      </div>
    </fieldset>
  )
}
