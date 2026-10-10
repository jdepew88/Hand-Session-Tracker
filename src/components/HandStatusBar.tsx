import { formatCents } from '../domain/money'
import type { HandState } from '../domain/poker/models'

const STREET_LABEL: Record<HandState['street'], string> = {
  preflop: 'Preflop',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
}

/**
 * The always-visible line while recording: street, and the three pot figures
 * kept apart so the drop is never confused with the money players win. The
 * board itself is on the table.
 */
export function HandStatusBar({ state }: { state: HandState }) {
  const heading =
    state.status === 'complete'
      ? 'Hand complete'
      : state.status === 'showdown'
        ? 'Showdown'
        : STREET_LABEL[state.street]
  // Unequal blinds make "layers" too; side pots only mean something once someone is all-in.
  const sidePots = state.pots.length > 1 && [...state.seats.values()].some((seat) => seat.allIn)

  return (
    <section
      aria-label="Hand status"
      className="sticky top-0 z-30 border-b border-room-700 bg-room-900/95 px-3 py-2 backdrop-blur"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-felt-200">{heading}</h2>
        <dl className="flex flex-wrap gap-x-3 text-sm tabular">
          <div>
            <dt className="inline text-room-400">Gross pot </dt>
            <dd className="inline font-semibold">{formatCents(state.pot)}</dd>
          </div>
          <div>
            <dt className="inline text-room-400">Drop </dt>
            <dd className="inline font-semibold text-room-300">{formatCents(state.rake.total)}</dd>
          </div>
          <div>
            <dt className="inline text-room-400">Net pot </dt>
            <dd className="inline font-semibold text-felt-200">{formatCents(state.netPot)}</dd>
          </div>
        </dl>
      </div>

      {sidePots && (
        <p className="mt-1 text-xs text-room-400 tabular">
          {state.pots
            .map(
              (pot, index) =>
                `${index === 0 ? 'Main' : `Side ${index}`} ${formatCents(pot.amount)} (seats ${pot.eligibleSeats.join(', ')})`,
            )
            .join(' · ')}
        </p>
      )}
    </section>
  )
}
