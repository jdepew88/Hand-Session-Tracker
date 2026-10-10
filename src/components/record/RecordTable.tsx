import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { DealerPuck } from '../table/DealerButton'
import { PokerSeat } from '../table/PokerSeat'
import { PokerTable } from '../table/PokerTable'
import './record.css'

export interface RecordSeatView {
  seat: number
  position: string | null
  name?: string
  empty: boolean
  hero: boolean
  tone?: 'out' | 'folded' | 'acting'
  /** The seat's state in words: "TO ACT", "FOLDED", "OUT", "ALL-IN". */
  status?: string
  stack?: string
  /** Accessible name when the seat is a control. */
  label: string
  /** Toggle state when seats are chosen (who was in the hand). */
  pressed?: boolean
  disabled?: boolean
  /** Shown between the seat and the middle: cards, a bet, the last action. */
  spot?: ReactNode
  heroSpot?: boolean
}

/**
 * The table, as the recorder's working surface.
 *
 * With `onSeat`, seats are toggle buttons (one tab stop for the whole table;
 * arrow keys walk the chairs). Without it, the table is a picture of the hand
 * and the caller provides the same information as text.
 */
export function RecordTable({
  seatCount,
  seats,
  buttonSeat,
  center,
  onSeat,
  label,
  describedBy,
  compact = false,
}: {
  seatCount: number
  seats: readonly RecordSeatView[]
  buttonSeat: number | null
  center?: ReactNode
  onSeat?: (seat: number) => void
  label: string
  describedBy?: string
  /** A shorter oval on phones, for screens with a tall tray under the table. */
  compact?: boolean
}) {
  const [focusSeat, setFocusSeat] = useState(seats.find((seat) => !seat.empty)?.seat ?? 1)
  const buttons = useRef(new Map<number, HTMLButtonElement>())
  const interactive = onSeat !== undefined

  const moveFocus = (seat: number) => {
    setFocusSeat(seat)
    buttons.current.get(seat)?.focus()
  }

  const onKeyDown = (seat: number) => (event: KeyboardEvent<HTMLButtonElement>) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key]
    if (step !== undefined) {
      event.preventDefault()
      moveFocus(((seat - 1 + step + seatCount) % seatCount) + 1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      moveFocus(1)
    } else if (event.key === 'End') {
      event.preventDefault()
      moveFocus(seatCount)
    }
  }

  const roving = focusSeat <= seatCount ? focusSeat : 1

  return (
    <div
      className={`rc-frame ${compact ? 'rc-frame--compact' : ''}`}
      role={interactive ? 'group' : 'img'}
      aria-label={label}
      aria-describedby={describedBy}
    >
      <PokerTable seatCount={seatCount}>
        {center && <div className="rc-center">{center}</div>}
        {buttonSeat !== null && <DealerPuck seat={buttonSeat} />}
        {seats.map((view) =>
          view.spot ? (
            <span
              key={`spot-${view.seat}`}
              className={`rc-spot pt-seat-${view.seat} ${view.heroSpot ? 'rc-spot--hero' : ''}`}
              aria-hidden="true"
            >
              {view.spot}
            </span>
          ) : null,
        )}
        {seats.map((view) => (
          <PokerSeat
            key={view.seat}
            seat={view.seat}
            position={view.position}
            hero={view.hero}
            empty={view.empty}
            selected={view.pressed ?? false}
            {...(view.name && !view.empty ? { name: view.name } : {})}
            {...(view.stack ? { stack: view.stack } : {})}
            {...(view.status ? { status: view.status } : {})}
            {...(view.tone ? { tone: view.tone } : {})}
            label={view.label}
            inert={!interactive}
            disabled={view.disabled ?? false}
            tabIndex={view.seat === roving ? 0 : -1}
            buttonRef={(element) => {
              if (element) buttons.current.set(view.seat, element)
              else buttons.current.delete(view.seat)
            }}
            onSelect={() => {
              setFocusSeat(view.seat)
              onSeat?.(view.seat)
            }}
            onKeyDown={onKeyDown(view.seat)}
          />
        ))}
      </PokerTable>
    </div>
  )
}
