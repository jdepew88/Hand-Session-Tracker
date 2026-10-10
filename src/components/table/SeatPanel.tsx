import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import type { PlayerProfile } from '../../domain/poker/models'
import { hasIdentity, playerTags } from '../../domain/poker/players'
import { positionName, type TableSeatView } from '../../domain/poker/tableView'
import { PlayerCard, PlayerEditor, type PlayerEdit } from './PlayerEditor'

/**
 * The selected chair: who sits there and what you know about them.
 *
 * A chair is not a person. Marking it empty means the person left -- their
 * label, tags and notes stay with the session -- and whoever sits down next
 * starts with a clean card. A player who moves takes everything with them.
 */
export function SeatPanel({
  view,
  lineupHref,
  emptyBlockedReason,
  emptySeats,
  returning,
  onClose,
  onSetHero,
  onSetButton,
  onSetOccupied,
  onSavePlayer,
  onMove,
  onBringBack,
}: {
  view: TableSeatView
  lineupHref: string
  /** Why this occupied seat cannot be marked empty, or null. */
  emptyBlockedReason: string | null
  /** Empty chairs a player here could move to. */
  emptySeats: readonly number[]
  /** People who were at this table earlier and could sit back down. */
  returning: readonly PlayerProfile[]
  onClose: () => void
  onSetHero: () => void
  onSetButton: () => void
  onSetOccupied: (occupied: boolean) => void
  onSavePlayer: (edit: PlayerEdit) => Promise<void>
  onMove: (toSeat: number) => void
  onBringBack: (player: PlayerProfile) => void
}) {
  const hintId = useId()
  const titleId = useId()
  const moveId = useId()
  const known = view.player !== null && hasIdentity(view.player)
  const [editing, setEditing] = useState(!known)
  const [moveTo, setMoveTo] = useState('')

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

      <div className="mt-3 grid grid-cols-2 gap-2">
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
        <div className="mt-3 space-y-3">
          <button type="button" className="btn-primary w-full" onClick={() => onSetOccupied(true)}>
            Seat a new player here
          </button>
          {returning.length > 0 && (
            <div>
              <p className="label">Back at the table</p>
              <ul className="flex flex-wrap gap-1.5">
                {returning.map((player) => (
                  <li key={player.id}>
                    <button type="button" className="btn-secondary h-auto min-h-11 flex-col items-start gap-0 px-3 py-1.5 text-left" onClick={() => onBringBack(player)}>
                      <span className="text-sm">{player.nickname.trim() || 'Unnamed player'}</span>
                      {playerTags(player).length > 0 && (
                        <span className="text-xs font-normal text-room-400">{playerTags(player).join(' · ')}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-xs text-room-400">Someone who left earlier, with their notes. A new face starts clean.</p>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {editing ? (
            // Keyed so a save elsewhere, or another seat, reseeds the form.
            <PlayerEditor
              key={`${view.seat}:${view.player?.id ?? 'new'}:${view.player?.updatedAt ?? ''}`}
              player={view.player}
              stack={view.stack}
              isHero={view.isHero}
              onSave={async (edit) => {
                await onSavePlayer(edit)
                setEditing(false)
              }}
              {...(known ? { onCancel: () => setEditing(false) } : {})}
            />
          ) : (
            <>
              <PlayerCard
                player={view.player}
                stack={view.stack}
                stackIsDefault={view.stackIsDefault}
                fallback={view.isHero ? 'You' : `Seat ${view.seat}`}
              />
              <button type="button" className="btn-secondary w-full" onClick={() => setEditing(true)}>
                Edit player and notes
              </button>
            </>
          )}

          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 border-t border-room-700 pt-3">
            {emptySeats.length > 0 ? (
              <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <label className="label" htmlFor={moveId}>
                    Moved to
                  </label>
                  <select id={moveId} className="field" value={moveTo} onChange={(event) => setMoveTo(event.target.value)}>
                    <option value="">Empty seat…</option>
                    {emptySeats.map((seat) => (
                      <option key={seat} value={seat}>
                        Seat {seat}
                      </option>
                    ))}
                  </select>
                </div>
                <button type="button" className="btn-secondary" disabled={moveTo === ''} onClick={() => onMove(Number(moveTo))}>
                  Move
                </button>
              </div>
            ) : (
              <span />
            )}
            <button
              type="button"
              className="btn-secondary"
              disabled={emptyBlockedReason !== null}
              {...(emptyBlockedReason ? { 'aria-describedby': hintId } : {})}
              onClick={() => onSetOccupied(false)}
            >
              Mark seat empty
            </button>
          </div>
          {emptyBlockedReason && (
            <p id={hintId} className="text-xs text-room-400">
              {emptyBlockedReason}
            </p>
          )}
        </div>
      )}

      <Link to={lineupHref} className="mt-3 inline-block text-sm text-room-300 underline-offset-2 hover:text-room-50 hover:underline">
        Everyone at this table this session
      </Link>
    </section>
  )
}
