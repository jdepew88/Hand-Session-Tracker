import type { ReactNode } from 'react'
import { formatCents } from '../../domain/money'
import { describeCard } from '../../domain/poker/cards'
import {
  FINAL_POT,
  FLOP,
  HERO_CARDS,
  HERO_RESULT,
  POT_ON_FLOP,
  PREFLOP_ACTION,
  RIVER,
  TURN,
  VILLAIN_CARDS,
} from './demoHand'
import { DealerButton, FeltCard } from './TableBits'
import { useReveal } from './useReveal'

/** The four stages of reconstructing a hand, told with the homepage's demo hand. */
export function WorkflowSteps() {
  const ref = useReveal<HTMLOListElement>()

  return (
    <ol
      ref={ref}
      className="hf-reveal grid gap-5 md:grid-cols-2 xl:grid-cols-4 xl:gap-8"
    >
      <Step number={1} title="Seat the table" copy="Where were you sitting? Who had the big stack? How deep was everyone?">
        <SeatingVisual />
      </Step>
      <Step number={2} title="Rebuild the action" copy="Tap the seats to add raises, calls, folds and bets on each street.">
        <ActionVisual />
      </Step>
      <Step number={3} title="Build the board" copy="Add the flop, turn and river as the hand progresses.">
        <BoardVisual />
      </Step>
      <Step
        number={4}
        last
        title="Record the result"
        copy="Add showdown hands and the outcome. See your profit for the hand and session."
      >
        <ResultVisual />
      </Step>
    </ol>
  )
}

function Step({
  number,
  title,
  copy,
  last = false,
  children,
}: {
  number: number
  title: string
  copy: string
  last?: boolean
  children: ReactNode
}) {
  return (
    <li className="relative flex flex-col rounded-2xl border border-white/[0.07] bg-gradient-to-b from-room-900 to-room-950/60 p-5">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-felt-500 text-sm font-bold text-room-950"
        >
          {number}
        </span>
        <div>
          <h3 className="text-[1.05rem] font-semibold tracking-tight text-bone-50">
            <span className="sr-only">Step {number}: </span>
            {title}
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-room-300">{copy}</p>
        </div>
      </div>
      <div className="@container mt-5 flex flex-1 items-center rounded-xl border border-white/[0.06] bg-room-950/70 p-3">
        <div className="w-full">{children}</div>
      </div>
      {!last && (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="absolute -right-7 top-1/2 hidden h-6 w-6 -translate-y-1/2 text-room-500 xl:block"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      )}
    </li>
  )
}

const MINI_SEATS = [
  { slot: 0, label: 'YOU' },
  { slot: 1, label: 'SB' },
  { slot: 2, label: 'BB' },
  { slot: 3, label: 'UTG' },
  { slot: 4, label: '+1' },
  { slot: 5, label: 'LJ' },
  { slot: 6, label: 'HJ' },
  { slot: 7, label: 'CO' },
]

function SeatingVisual() {
  return (
    <div
      className="hf-mini"
      role="img"
      aria-label="An eight-seat table: you on the button, then clockwise the small blind, big blind, under the gun, UTG+1, lojack, hijack and cutoff."
    >
      <div className="hf-rail">
        <div className="hf-felt" />
      </div>
      {MINI_SEATS.map((seat) => (
        <span
          key={seat.slot}
          aria-hidden="true"
          className={`hf-place hf-seat-${seat.slot} hf-marker ${seat.slot === 0 ? 'hf-marker--hero' : ''}`}
        >
          {seat.label}
        </span>
      ))}
      <span className="hf-place hf-dealer" aria-hidden="true">
        <DealerButton />
      </span>
    </div>
  )
}

/** Which table slot each timeline row belongs to, for the little seat map. */
const ROW_SLOTS: Record<string, readonly number[]> = {
  'UTG–LJ': [3, 4, 5],
  HJ: [6],
  CO: [7],
  YOU: [0],
  SB: [1],
  BB: [2],
}

/** A thumbnail of the table with the acting seat(s) marked. */
function SeatGlyph({ slots, hero }: { slots: readonly number[]; hero: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 26 16" className="h-4 w-[1.6rem] shrink-0">
      <ellipse cx="13" cy="8" rx="10.5" ry="6" fill="none" stroke="currentColor" strokeOpacity="0.35" />
      {slots.map((slot) => {
        const angle = ((90 + 45 * slot) * Math.PI) / 180
        return (
          <circle
            key={slot}
            cx={13 + 10.5 * Math.cos(angle)}
            cy={8 + 6 * Math.sin(angle)}
            r="2.1"
            className={hero ? 'fill-felt-400' : 'fill-bone-200'}
          />
        )
      })}
    </svg>
  )
}

function ActionVisual() {
  return (
    <div>
      <p className="mb-2 flex justify-between px-2 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-room-400">
        <span>Preflop</span>
        <span className="tabular">Pot {formatCents(POT_ON_FLOP)}</span>
      </p>
      <ol className="space-y-0.5 text-[0.8rem]" aria-label="Preflop action">
        {PREFLOP_ACTION.map((row) => (
          <li
            key={row.who}
            className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 ${
              row.hero ? 'bg-felt-500/15 font-semibold text-felt-200 ring-1 ring-inset ring-felt-400/45' : 'text-room-300'
            }`}
          >
            <SeatGlyph slots={ROW_SLOTS[row.who] ?? []} hero={row.hero ?? false} />
            <span className={`w-14 shrink-0 tracking-wide ${row.hero ? '' : 'text-room-400'}`}>{row.who}</span>
            <span className={row.hero ? '' : 'text-bone-200'}>{row.action}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

function StreetGroup({ label, wide = false, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={`rounded-lg border border-white/[0.06] bg-room-900/70 p-2 ${wide ? 'col-span-2' : ''}`}>
      <p className="mb-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-room-400">{label}</p>
      <div className="hf-step-cards">{children}</div>
    </div>
  )
}

function BoardVisual() {
  const board = [...FLOP, TURN, RIVER]
  return (
    <div
      className="grid grid-cols-2 gap-2"
      role="img"
      aria-label={`Board: ${board.map(describeCard).join(', ')}`}
    >
      <StreetGroup label="Flop" wide>
        {FLOP.map((card) => (
          <FeltCard key={card} card={card} />
        ))}
      </StreetGroup>
      <StreetGroup label="Turn">
        <FeltCard card={TURN} />
      </StreetGroup>
      <StreetGroup label="River">
        <FeltCard card={RIVER} />
      </StreetGroup>
    </div>
  )
}

function ShownHand({
  who,
  cards,
  made,
  winner = false,
}: {
  who: string
  cards: readonly string[]
  made: string
  winner?: boolean
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-room-900/70 px-2.5 py-2">
      <span className={`w-9 text-xs font-semibold tracking-wide ${who === 'YOU' ? 'text-felt-200' : 'text-room-300'}`}>
        {who}
      </span>
      <span className="hf-step-cards" role="img" aria-label={cards.map(describeCard).join(' and ')}>
        {cards.map((card) => (
          <FeltCard key={card} card={card} />
        ))}
      </span>
      <span className="ml-auto text-right text-xs leading-tight text-room-400">
        {made}
        {winner && (
          <span className="mt-1 block font-semibold uppercase tracking-wider text-bone-50">Winner</span>
        )}
      </span>
    </div>
  )
}

function ResultVisual() {
  return (
    <div className="space-y-2">
      <ShownHand who="YOU" cards={HERO_CARDS} made="Ace high" />
      <ShownHand who="CO" cards={VILLAIN_CARDS} made="Two pair" winner />
      <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-white/[0.06] bg-white/[0.06] text-xs">
        <div className="bg-room-900 px-2.5 py-2">
          <dt className="text-room-400">Winner</dt>
          <dd className="mt-0.5 text-sm font-semibold text-bone-50">CO</dd>
        </div>
        <div className="bg-room-900 px-2.5 py-2">
          <dt className="text-room-400">Pot</dt>
          <dd className="tabular mt-0.5 text-sm font-semibold text-bone-50">{formatCents(FINAL_POT)}</dd>
        </div>
        <div className="bg-room-900 px-2.5 py-2">
          <dt className="text-room-400">Your result</dt>
          <dd className="tabular mt-0.5 text-sm font-semibold text-loss">
            {formatCents(HERO_RESULT, { sign: true }).replace('-', '−')}
          </dd>
        </div>
      </dl>
    </div>
  )
}
