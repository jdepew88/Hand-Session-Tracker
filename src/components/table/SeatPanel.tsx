import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatCents, type Cents } from '../../domain/money'
import { positionName, type TableSeatView } from '../../domain/poker/tableView'
import { MoneyField } from '../MoneyField'

/**
 * Actions for the selected seat: whether someone sits here, sitting the hero
 * here, putting the button here, and the seat's name and stack. Everything
 * else about a player stays on the lineup page.
 */
export function SeatPanel({
  view,
  lineupHref,
  emptyBlockedReason,
  onClose,
  onSetHero,
  onSetButton,
  onSetOccupied,
  onSavePlayer,
}: {
  view: TableSeatView
  lineupHref: string
  /** Why this occupied seat cannot be marked empty, or null. */
  emptyBlockedReason: string | null
  onClose: () => void
  onSetHero: () => void
  onSetButton: () => void
  onSetOccupied: (occupied: boolean) => void
  onSavePlayer: (details: { nickname: string; stack: Cents; stackChanged: boolean }) => Promise<void>
}) {
  const hintId = useId()
  const titleId = useId()
  return (
    <section aria-labelledby={titleId} className="card-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id={titleId} className="text-lg font-semibold tracking-tight">
            Seat {view.seat}
            {view.position && <span className="ml-2 text-felt-200">{view.position}</span>}
          </h2>
          <p className="text-sm text-room-400">
            {view.isEmpty
              ? 'Empty seat · not dealt into new hands'
              : view.position
                ? positionName(view.position)
                : 'Position appears once the button is in front of a player'}
            {view.isHero && ' · your seat'}
          </p>
        </div>
        <button type="button" className="btn-ghost -mr-2 -mt-1 px-3" onClick={onClose}>
          Done
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          aria-pressed={view.isHero}
          onClick={onSetHero}
          className={view.isHero ? 'btn border border-felt-400 bg-felt-500/15 text-felt-200' : 'btn-secondary'}
        >
          {view.isHero ? 'You sit here' : 'I sit here'}
        </button>
        <button
          type="button"
          aria-pressed={view.isButton}
          onClick={onSetButton}
          className={view.isButton ? 'btn border border-bone-200/60 bg-bone-50/10 text-bone-50' : 'btn-secondary'}
        >
          <span
            aria-hidden="true"
            className="grid h-5 w-5 place-items-center rounded-full bg-ivory text-[0.65rem] font-extrabold text-room-950"
          >
            D
          </span>
          {view.isButton ? 'Button is here' : 'Button here'}
        </button>
      </div>

      {view.isEmpty ? (
        <button type="button" className="btn-primary mt-2 w-full" onClick={() => onSetOccupied(true)}>
          Seat player here
        </button>
      ) : (
        <>
          <button
            type="button"
            className="btn-secondary mt-2 w-full"
            disabled={emptyBlockedReason !== null}
            {...(emptyBlockedReason ? { 'aria-describedby': hintId } : {})}
            onClick={() => onSetOccupied(false)}
          >
            Mark seat empty
          </button>
          {emptyBlockedReason && (
            <p id={hintId} className="mt-1.5 text-xs text-room-400">
              {emptyBlockedReason}
            </p>
          )}
          {/* Keyed so switching seats, or a save elsewhere, reseeds the form. */}
          <PlayerForm key={`${view.seat}:${view.player?.updatedAt ?? 'new'}`} view={view} onSave={onSavePlayer} />
        </>
      )}

      <Link to={lineupHref} className="mt-3 inline-block text-sm text-room-300 underline-offset-2 hover:text-room-50 hover:underline">
        Style, tag colour and notes on the lineup page
      </Link>
    </section>
  )
}

function PlayerForm({
  view,
  onSave,
}: {
  view: TableSeatView
  onSave: (details: { nickname: string; stack: Cents; stackChanged: boolean }) => Promise<void>
}) {
  const nameId = useId()
  const [nickname, setNickname] = useState(view.nickname)
  const [stack, setStack] = useState<Cents>(view.stack)
  const dirty = nickname.trim() !== view.nickname || stack !== view.stack

  return (
    <form
      className="mt-5 space-y-3 border-t border-room-700 pt-4"
      onSubmit={async (event) => {
        event.preventDefault()
        await onSave({ nickname: nickname.trim(), stack, stackChanged: stack !== view.stack })
      }}
    >
      <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-3">
        <div>
          <label className="label" htmlFor={nameId}>
            Player
          </label>
          <input
            id={nameId}
            className="field"
            value={nickname}
            maxLength={120}
            placeholder={view.isHero ? 'You' : 'Name or description'}
            onChange={(event) => setNickname(event.target.value)}
          />
        </div>
        <MoneyField
          label="Stack"
          value={stack}
          onChange={setStack}
        />
      </div>
      {view.stackIsDefault && !dirty && (
        <p className="text-xs text-room-400">
          No stack recorded. New hands deal this seat the session default of {formatCents(view.stack)}.
        </p>
      )}
      <button type="submit" className="btn-primary" disabled={!dirty}>
        Save seat
      </button>
    </form>
  )
}
