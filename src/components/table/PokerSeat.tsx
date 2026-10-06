import type { KeyboardEvent, Ref } from 'react'
import './table.css'

/**
 * One chair at a `PokerTable`, as a button.
 *
 * Seat number (physical) and position (derived from the button) are always
 * shown separately. Hero status is a "YOU" tag as well as a colour, and an
 * empty chair is drawn dashed and says EMPTY, so no state depends on colour
 * alone. An empty chair stays at the table with its seat number.
 */
export function PokerSeat({
  seat,
  position,
  name,
  stack,
  bigBlinds,
  hero = false,
  empty = false,
  selected = false,
  label,
  tabIndex,
  buttonRef,
  onSelect,
  onKeyDown,
}: {
  seat: number
  /** Null until the dealer button has been placed. */
  position: string | null
  name?: string
  /** Display string, e.g. "$740". */
  stack?: string
  /** Display string, e.g. "148 BB". */
  bigBlinds?: string
  hero?: boolean
  /** Nobody is sitting here. */
  empty?: boolean
  selected?: boolean
  /** Full accessible name, e.g. "Seat 8, Button, you, stack $740". */
  label: string
  tabIndex?: number
  buttonRef?: Ref<HTMLButtonElement>
  onSelect?: () => void
  onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void
}) {
  const classes = [
    'pt-seat',
    `pt-seat-${seat}`,
    hero ? 'pt-seat--hero' : '',
    empty ? 'pt-seat--empty' : '',
    selected ? 'pt-seat--selected' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      ref={buttonRef}
      type="button"
      className={classes}
      aria-label={label}
      aria-pressed={selected}
      tabIndex={tabIndex}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      data-seat={seat}
    >
      {hero && (
        <span className="pt-you" aria-hidden="true">
          YOU
        </span>
      )}
      <span className="pt-seat__head" aria-hidden="true">
        <span className="pt-seat__num">{seat}</span>
        {/* Keyed so a new position fades in rather than swapping silently. */}
        {position || !empty ? (
          <span key={position ?? 'unset'} className={`pt-seat__pos ${position ? '' : 'pt-seat__pos--unset'}`}>
            {position ?? '—'}
          </span>
        ) : null}
      </span>
      {empty && <span className="pt-seat__state">EMPTY</span>}
      {name && (
        <span className="pt-seat__name" aria-hidden="true">
          {name}
        </span>
      )}
      {stack && (
        <span className="pt-seat__stack" aria-hidden="true">
          {stack}
        </span>
      )}
      {bigBlinds && (
        <span className="pt-seat__bb" aria-hidden="true">
          {bigBlinds}
        </span>
      )}
    </button>
  )
}
