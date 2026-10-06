import './table.css'

/** The dealer puck itself. */
export function DealerButton() {
  return (
    <span className="hf-dealer-btn" aria-hidden="true">
      D
    </span>
  )
}

/**
 * The puck placed in front of a seat on a `PokerTable`. Changing `seat` moves
 * it there, with a short slide unless reduced motion is requested.
 */
export function DealerPuck({ seat }: { seat: number }) {
  return (
    <span className={`pt-puck pt-puck-${seat}`} aria-hidden="true" data-testid="dealer-puck" data-seat={seat}>
      <DealerButton />
    </span>
  )
}
