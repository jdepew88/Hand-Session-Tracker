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
  status,
  tone,
  inert = false,
  disabled = false,
  extraClass = '',
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
  /** A state in words under the seat, e.g. "TO ACT", "FOLDED", "OUT". */
  status?: string
  /** How the seat sits in a hand being recorded. */
  tone?: 'out' | 'folded' | 'acting'
  /**
   * Draw the seat without making it a control. The caller describes the
   * table some other way (the recorder keeps a text list of seats).
   */
  inert?: boolean
  disabled?: boolean
  extraClass?: string
}) {
  const classes = [
    'pt-seat',
    `pt-seat-${seat}`,
    hero ? 'pt-seat--hero' : '',
    empty ? 'pt-seat--empty' : '',
    selected ? 'pt-seat--selected' : '',
    tone ? `rc-seat--${tone}` : '',
    inert ? 'rc-seat--static' : '',
    disabled ? 'rc-seat--disabled' : '',
    extraClass,
  ]
    .filter(Boolean)
    .join(' ')

  const content = (
    <>
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
      {status && (
        <span className="rc-seat__state" aria-hidden="true">
          {status}
        </span>
      )}
    </>
  )

  if (inert) {
    return (
      <div className={classes} aria-hidden="true" data-seat={seat}>
        {content}
      </div>
    )
  }

  return (
    <button
      ref={buttonRef}
      type="button"
      className={classes}
      aria-label={label}
      aria-pressed={selected}
      aria-disabled={disabled || undefined}
      tabIndex={tabIndex}
      onClick={disabled ? undefined : onSelect}
      onKeyDown={onKeyDown}
      data-seat={seat}
    >
      {content}
    </button>
  )
}
