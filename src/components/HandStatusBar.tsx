import { formatCents } from '../domain/money'
import type { HandState } from '../domain/poker/models'
import { CardRow } from './PlayingCard'

const STREET_LABEL: Record<HandState['street'], string> = {
  preflop: 'Preflop',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
}

/**
 * The always-visible header while recording: street, board, and the three pot
 * figures kept apart so the drop is never confused with the money players win.
 */
export function HandStatusBar({ state }: { state: HandState }) {
  const heading =
    state.status === 'complete'
      ? 'Hand complete'
      : state.status === 'showdown'
        ? 'Showdown'
        : STREET_LABEL[state.street]

  return (
    <section
      aria-label="Hand status"
      className="sticky top-0 z-30 border-b border-room-700 bg-room-900/95 px-3 py-3 backdrop-blur"
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-felt-200">{heading}</h2>
        <CardRow cards={state.board} size="sm" placeholders={state.board.length > 0 ? 5 : 0} />
      </div>

      <dl className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-room-850 py-2">
          <dt className="text-[0.7rem] uppercase tracking-wide text-room-400">Gross pot</dt>
          <dd className="text-lg font-semibold tabular">{formatCents(state.pot)}</dd>
        </div>
        <div className="rounded-lg bg-room-850 py-2">
          <dt className="text-[0.7rem] uppercase tracking-wide text-room-400">Drop</dt>
          <dd className="text-lg font-semibold tabular text-room-300">
            {formatCents(state.rake.total)}
          </dd>
        </div>
        <div className="rounded-lg bg-room-850 py-2">
          <dt className="text-[0.7rem] uppercase tracking-wide text-room-400">Net pot</dt>
          <dd className="text-lg font-semibold tabular text-felt-200">{formatCents(state.netPot)}</dd>
        </div>
      </dl>

      {state.pots.length > 1 && (
        <p className="mt-2 text-xs text-room-400 tabular">
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
