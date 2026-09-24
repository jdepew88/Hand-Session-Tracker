import { useState } from 'react'
import { formatCents, type Cents } from '../domain/money'
import {
  aggressiveActionType,
  amountToCall,
  buildAction,
  buildAllIn,
  canCheck,
  maxTo,
  minRaiseTo,
  sizingOptions,
  validateAction,
} from '../domain/poker/betting'
import type { ActionEvent, HandState } from '../domain/poker/models'
import { seatTitle } from '../utils/labels'
import { AmountInput } from './AmountInput'

/**
 * The control surface used while a hand is in progress.
 *
 * Everything needed to act is on one screen without scrolling: who is up,
 * their stack, what they have in, what it costs to call, and four large
 * buttons. Bet sizing expands inline rather than opening a dialog -- a modal
 * at a live table is a mis-tap waiting to happen.
 */
export function ActionPanel({
  state,
  heroSeat,
  bigBlind,
  onAction,
}: {
  state: HandState
  heroSeat: number
  bigBlind: Cents
  onAction: (event: ActionEvent) => void
}) {
  const seat = state.actingSeat === null ? null : state.seats.get(state.actingSeat)
  const [raiseTo, setRaiseTo] = useState<Cents | null>(null)

  // Close the sizing pad whenever the action moves on. Comparing a signature
  // during render keeps this in one pass -- an effect would briefly show the
  // previous player's pad.
  const signature = `${state.actingSeat}:${state.street}:${state.events.length}`
  const [lastSignature, setLastSignature] = useState(signature)
  if (signature !== lastSignature) {
    setLastSignature(signature)
    setRaiseTo(null)
  }

  if (!seat || state.actingSeat === null) return null

  const acting = state.actingSeat
  const toCall = amountToCall(state, acting)
  const ceiling = maxTo(state, acting)
  const floor = minRaiseTo(state, acting)
  const check = canCheck(state, acting)
  const aggression = aggressiveActionType(state)
  const canRaise = seat.stack > 0 && ceiling > state.currentBet

  const emit = (event: ActionEvent) => {
    setRaiseTo(null)
    onAction(event)
  }

  const confirmRaise = () => {
    if (raiseTo === null) return
    emit(buildAction(state, acting, aggression, raiseTo))
  }

  const pending =
    raiseTo === null
      ? null
      : validateAction(state, buildAction(state, acting, aggression, raiseTo))

  return (
    <section
      aria-label="Action"
      className="border-t border-room-700 bg-room-900/95 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur"
    >
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold">
          {seatTitle(seat, heroSeat)}
          <span className="ml-2 text-sm font-normal text-room-400">Seat {seat.seat}</span>
        </h2>
        <p className="text-sm text-room-300 tabular">
          Stack <span className="font-semibold text-room-50">{formatCents(seat.stack)}</span>
        </p>
      </div>

      <dl className="mb-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-room-850 py-2">
          <dt className="text-[0.7rem] uppercase tracking-wide text-room-400">In this street</dt>
          <dd className="text-base font-semibold tabular">{formatCents(seat.streetCommitted)}</dd>
        </div>
        <div className="rounded-lg bg-room-850 py-2">
          <dt className="text-[0.7rem] uppercase tracking-wide text-room-400">To call</dt>
          <dd className="text-base font-semibold tabular text-felt-200">{formatCents(toCall)}</dd>
        </div>
        <div className="rounded-lg bg-room-850 py-2">
          <dt className="text-[0.7rem] uppercase tracking-wide text-room-400">Pot</dt>
          <dd className="text-base font-semibold tabular">{formatCents(state.pot)}</dd>
        </div>
      </dl>

      {raiseTo === null ? (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className="btn-danger h-14 text-base"
            onClick={() => emit(buildAction(state, acting, 'fold'))}
          >
            Fold
          </button>

          {check ? (
            <button
              type="button"
              className="btn-secondary h-14 text-base"
              onClick={() => emit(buildAction(state, acting, 'check'))}
            >
              Check
            </button>
          ) : (
            <button
              type="button"
              className="btn-secondary h-14 flex-col gap-0 text-base"
              onClick={() => emit(buildAction(state, acting, 'call'))}
            >
              <span>Call</span>
              <span className="text-xs font-normal text-room-300 tabular">{formatCents(toCall)}</span>
            </button>
          )}

          <button
            type="button"
            className="btn-primary h-14 text-base"
            disabled={!canRaise}
            onClick={() => setRaiseTo(floor)}
          >
            {aggression === 'bet' ? 'Bet' : 'Raise'}
          </button>

          <button
            type="button"
            className="btn h-14 border border-felt-500/50 bg-felt-700/30 text-base text-felt-200 hover:bg-felt-700/50"
            onClick={() => emit(buildAllIn(state, acting))}
          >
            <span className="flex flex-col gap-0">
              <span>All-in</span>
              <span className="text-xs font-normal tabular">{formatCents(ceiling)}</span>
            </span>
          </button>
        </div>
      ) : (
        <div>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {sizingOptions(state, acting, bigBlind).map((option) => (
              <button
                key={`${option.label}-${option.to}`}
                type="button"
                aria-pressed={raiseTo === option.to}
                onClick={() => setRaiseTo(option.to)}
                className={`tap rounded-lg border px-3 py-2 text-sm font-semibold tabular ${
                  raiseTo === option.to
                    ? 'border-felt-400 bg-felt-500 text-room-950'
                    : 'border-room-700 bg-room-850 text-room-50 hover:border-room-500'
                }`}
              >
                {option.label}
                <span className="ml-1.5 font-normal text-room-400">{formatCents(option.to)}</span>
              </button>
            ))}
          </div>

          <AmountInput
            value={raiseTo}
            onChange={setRaiseTo}
            max={ceiling}
            label={`${aggression === 'bet' ? 'Bet' : 'Raise'} to (total for this street)`}
          />

          {pending && pending.warnings.length > 0 && (
            <p className="mt-2 text-sm text-chip-amber" role="status">
              {pending.warnings.join(' ')}
            </p>
          )}
          {pending && pending.errors.length > 0 && (
            <p className="mt-2 text-sm text-chip-red" role="alert">
              {pending.errors.join(' ')}
            </p>
          )}

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" className="btn-secondary h-12" onClick={() => setRaiseTo(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary h-12"
              disabled={(pending?.errors.length ?? 0) > 0}
              onClick={confirmRaise}
            >
              {aggression === 'bet' ? 'Bet' : 'Raise to'} {formatCents(raiseTo)}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
