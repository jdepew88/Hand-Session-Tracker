import { DealerPuck } from '../table/DealerButton'
import { PokerTable } from '../table/PokerTable'
import type { TableSeatView } from '../../domain/poker/tableView'
import './sessions.css'

/**
 * A still, read-only picture of the session's table: the shared `PokerTable`
 * with a numbered dot per chair, hero ringed, empty chairs dashed and the
 * dealer puck in place. Nothing in it is interactive -- the full Table screen
 * is where seats are changed.
 */
export function TableSnapshot({ views }: { views: readonly TableSeatView[] }) {
  const button = views.find((view) => view.isButton)
  return (
    <div className="sj-snapshot" aria-hidden="true">
      <PokerTable seatCount={views.length}>
        {button && <DealerPuck seat={button.seat} />}
        {views.map((view) => (
          <span
            key={view.seat}
            className={`sj-seat pt-seat-${view.seat} ${view.isEmpty ? 'sj-seat--empty' : ''} ${
              view.isHero ? 'sj-seat--hero' : ''
            }`}
          >
            {view.seat}
          </span>
        ))}
      </PokerTable>
    </div>
  )
}
