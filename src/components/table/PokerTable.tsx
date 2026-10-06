import type { ReactNode } from 'react'
import { TABLE_SIZES } from '../../domain/poker/positions'
import './table.css'

/**
 * The table surface: rail, felt and the dealer's spot, with seats and objects
 * laid over it by the caller. `seatCount` selects the seat geometry, so
 * anything placed with `pt-seat-N`, `pt-puck-N` or `pt-chips-N` lands in the
 * right chair for that table size.
 */
export function PokerTable({
  seatCount,
  center,
  children,
}: {
  seatCount: number
  center?: ReactNode
  children: ReactNode
}) {
  if (!(TABLE_SIZES as readonly number[]).includes(seatCount)) {
    throw new Error(`No seat layout for a ${seatCount}-seat table`)
  }
  return (
    <div className="pt-frame">
      <div className={`pt-table pt-n${seatCount}`}>
        <div className="hf-rail" aria-hidden="true">
          <div className="hf-felt" />
        </div>
        <span className="pt-mark pt-dealer-spot" aria-hidden="true">
          Dealer
        </span>
        {center && <div className="pt-mark pt-center">{center}</div>}
        {children}
      </div>
    </div>
  )
}
