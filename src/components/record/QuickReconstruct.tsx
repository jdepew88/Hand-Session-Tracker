import { useId, useMemo, useState, type ReactNode } from 'react'
import { centsToInput, formatCents, parseDollars, type Cents } from '../../domain/money'
import { SUITS, SUIT_NAME, SUIT_SYMBOL, type Card, type Suit } from '../../domain/poker/cards'
import { checkDraft } from '../../domain/poker/draft/check'
import { flowFor, handFlow, type StreetFlow } from '../../domain/poker/draft/flow'
import { exactCards, exactHoleCards, isExactCard, isPair } from '../../domain/poker/draft/memory'
import { SIZED_ACTIONS, type CardMemory, type DraftActionKind, type HandDraft, type ShowdownStatus } from '../../domain/poker/draft/model'
import {
  addAction,
  clearStreetActions,
  reachStreet,
  setActionAmount,
  setBoardCard,
  setFlopSuits,
  setHeroCards,
  setHeroSuited,
  setParticipant,
  setPot,
  setShowdown,
  setWinners,
  undoAction,
} from '../../domain/poker/draft/ops'
import { reconstructHand, type StackConflict } from '../../domain/poker/draft/reconstruct'
import { withHandStack } from '../../domain/poker/factories'
import { applyShortcut, preflopShortcuts, streetShortcuts } from '../../domain/poker/draft/shortcuts'
import {
  STREET_TITLE,
  effectiveWinners,
  holeCardsText,
  participantsLine,
  reachedShowdown,
  seatName,
  seatNickname,
  seatPositions,
  seatSpokenName,
  spokenParticipants,
  streetActionWords,
  summarizeDraft,
} from '../../domain/poker/draft/text'
import type { HandSetup, Street } from '../../domain/poker/models'
import { STREETS } from '../../domain/poker/models'
import { MoneyField } from '../MoneyField'
import { ActionTimeline } from './ActionTimeline'
import { CardInput } from './CardInput'
import { DraftSummaryView } from './DraftSummaryView'
import { draftBoard, draftSeatViews } from './draftSeats'
import { RecordTable, type RecordSeatView } from './RecordTable'
import { RememberedCard } from './RememberedCard'
import './record.css'

type Step = 'players' | 'cards' | Street | 'showdown' | 'review'

const STEPS: { id: Exclude<Step, 'review'>; short: string; full: string }[] = [
  { id: 'players', short: 'Players', full: 'Players' },
  { id: 'cards', short: 'Cards', full: "Hero's cards" },
  { id: 'preflop', short: 'Pre', full: 'Preflop' },
  { id: 'flop', short: 'Flop', full: 'Flop' },
  { id: 'turn', short: 'Turn', full: 'Turn' },
  { id: 'river', short: 'River', full: 'River' },
  { id: 'showdown', short: 'Show', full: 'Showdown' },
]

const ORDER: Step[] = ['players', 'cards', 'preflop', 'flop', 'turn', 'river', 'showdown', 'review']

const isStreet = (step: Step): step is Street => (STREETS as readonly string[]).includes(step)

/**
 * Quick Reconstruct: a hand from memory, in well under a minute.
 *
 * Everything the table already knows -- seats, names, Hero, the button,
 * positions, stakes -- comes from the table. The player says who was in the
 * hand, what Hero held, and as much of the action as they remember, in any
 * order; skipping is always allowed and nothing is guessed. Every tap goes
 * through the pure draft operations in `domain/poker/draft`, the same ones a
 * future text or voice parser will call.
 */
export function QuickReconstruct({
  setup: initialSetup,
  header,
  initialDraft,
  onSave,
  saveLabel = 'Save hand',
  notice,
  onDraftChange,
}: {
  /**
   * The hand's own snapshot of the table it was dealt at. Corrections made
   * here (a starting stack for this hand) change only this copy.
   */
  setup: HandSetup
  /** "$2/$5 NLH". */
  header: string
  initialDraft: HandDraft
  onSave: (draft: HandDraft, setup: HandSetup) => void | Promise<void>
  saveLabel?: string
  notice?: ReactNode
  /** Called with the draft and the hand's own setup whenever either changes. */
  onDraftChange?: (draft: HandDraft, setup: HandSetup) => void
}) {
  const [draft, setDraftState] = useState(initialDraft)
  const [setup, setSetupState] = useState(initialSetup)
  const [step, setStep] = useState<Step>(() => (initialDraft.participants.length > 1 ? 'review' : 'players'))
  const [saving, setSaving] = useState(false)
  const summaryId = useId()

  const setDraft = (next: HandDraft) => {
    setDraftState(next)
    onDraftChange?.(next, setup)
  }

  const setSetup = (next: HandSetup) => {
    setSetupState(next)
    onDraftChange?.(draft, next)
  }

  const flows = useMemo(() => handFlow(setup, draft), [setup, draft])
  const check = useMemo(() => checkDraft(setup, draft), [setup, draft])
  const endedOn = flows.find((flow) => flow.live.length <= 1)?.street ?? null
  const ended = endedOn !== null

  const available = (target: Step): boolean => {
    if (target === 'players' || target === 'cards' || target === 'review') return true
    if (draft.participants.length < 2) return false
    if (target === 'preflop') return true
    if (target === 'showdown') return !ended
    // A street after the one the hand ended on cannot be reached.
    return !ended || STREETS.indexOf(target) <= STREETS.indexOf(endedOn)
  }

  const go = (target: Step) => {
    if (available(target)) setStep(target)
  }

  const next = () => {
    const index = ORDER.indexOf(step)
    const following = ORDER.slice(index + 1).find(available)
    if (following) setStep(following)
  }

  const back = () => {
    const index = ORDER.indexOf(step)
    const previous = ORDER.slice(0, index).reverse().find(available)
    if (previous) setStep(previous)
  }

  const save = async () => {
    if (saving || check.errors.length > 0) return
    setSaving(true)
    try {
      await onSave(draft, setup)
    } finally {
      setSaving(false)
    }
  }

  /* ------------------------------------------------------------ the table */

  const currentStreet: Street | null = isStreet(step) ? step : null
  const streetFlowNow: StreetFlow | null = currentStreet ? flowFor(setup, draft, currentStreet) : null
  const [chosenActor, setChosenActor] = useState<number | null>(null)
  const actorChoices = streetFlowNow ? streetFlowNow.live.filter((seat) => !streetFlowNow.allIn.includes(seat)) : []
  const defaultActor = streetFlowNow?.toAct[0] ?? null
  const actor = chosenActor !== null && actorChoices.includes(chosenActor) && streetFlowNow!.toAct.length > 0 ? chosenActor : defaultActor

  const shownStreet: Street | null =
    currentStreet ?? (step === 'showdown' || step === 'review' ? (draft.streets.at(-1)?.street ?? null) : null)
  const seats = draftSeatViews(setup, draft, {
    street: currentStreet,
    end: step === 'showdown' || step === 'review',
    choosingPlayers: step === 'players' || step === 'cards',
    actor: currentStreet !== null && !ended ? actor : null,
  })
  const boardSoFar = draftBoard(draft, shownStreet)

  const onSeat = (seat: number) => {
    if (step === 'players') {
      if (seat === setup.heroSeat) return
      if (!setup.seats.some((entry) => entry.seat === seat)) return
      setDraft(setParticipant(draft, setup, seat, !draft.participants.includes(seat)))
      return
    }
    if (currentStreet && actorChoices.includes(seat)) setChosenActor(seat)
  }

  const seatsForStep: RecordSeatView[] =
    step === 'players'
      ? seats.map((view) =>
          view.empty
            ? { ...view, disabled: true }
            : view.hero
              ? { ...view, disabled: true, pressed: true, label: `${view.label}. Hero is always in the hand.` }
              : { ...view, label: view.label.replace(/, (in|not in) the hand$/, ''), pressed: draft.participants.includes(view.seat) },
        )
      : seats.map((view) =>
          currentStreet && actorChoices.includes(view.seat)
            ? { ...view, label: `${view.label}. Choose to record ${view.hero ? "Hero's" : 'their'} action.`, pressed: actor === view.seat }
            : { ...view, disabled: true, pressed: false },
        )

  const tableInteractive = step === 'players' || (currentStreet !== null && actorChoices.length > 0 && !ended)

  /* ------------------------------------------------------------- render */

  const stepTitle =
    step === 'review' ? 'Review and save' : step === 'cards' ? "Hero's cards" : step === 'showdown' ? 'Showdown' : step === 'players' ? 'Who was in the hand?' : STREET_TITLE[step]

  return (
    <div className="space-y-3">
      <nav aria-label="Reconstruct steps">
        <ol className="rc-steps">
          {STEPS.map((entry) => {
            const done = stepDone(entry.id, draft)
            return (
              <li key={entry.id} className="contents">
                <button
                  type="button"
                  className="rc-step"
                  aria-current={step === entry.id ? 'step' : undefined}
                  aria-label={`${entry.full}${done ? ', recorded' : ''}`}
                  disabled={!available(entry.id)}
                  onClick={() => go(entry.id)}
                >
                  <span aria-hidden="true" className="max-sm:hidden">{entry.full === "Hero's cards" ? 'Cards' : entry.full}</span>
                  <span aria-hidden="true" className="sm:hidden">{entry.short}</span>
                  <span aria-hidden="true" className="rc-step__mark">{done ? '✓' : '·'}</span>
                </button>
              </li>
            )
          })}
        </ol>
      </nav>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
        <div className="min-w-0">
          <p id={summaryId} className="sr-only">
            {spokenParticipants(setup, draft.participants)}.
            {step === 'players' ? ' Use the arrow keys to move between seats and Enter to put a player in or out of the hand.' : ''}
          </p>
          <RecordTable
            seatCount={setup.tableSize}
            seats={seatsForStep}
            buttonSeat={setup.buttonSeat}
            label={step === 'players' ? 'Seats. Choose who was in the hand' : `Table: ${participantsLine(setup, draft.participants)}`}
            describedBy={summaryId}
            {...(tableInteractive ? { onSeat } : {})}
            center={
              <>
                <span className="rc-center__street">{shownStreet && step !== 'review' ? STREET_TITLE[shownStreet] : header}</span>
                {boardSoFar.length > 0 && (
                  <span className="rc-center__board">
                    {boardSoFar.map((card, index) => (
                      <RememberedCard key={index} card={card} />
                    ))}
                  </span>
                )}
                {step === 'players' && <span className="rc-center__note">{participantsLine(setup, draft.participants)}</span>}
              </>
            }
          />
          {notice}
        </div>

        <section aria-labelledby={`${summaryId}-step`} className="min-w-0 space-y-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id={`${summaryId}-step`} className="text-lg font-semibold tracking-tight">
              {stepTitle}
            </h2>
            {step !== 'review' && (
              <button type="button" className="btn-ghost -mr-2 shrink-0 text-sm" onClick={() => setStep('review')}>
                Review &amp; save
              </button>
            )}
          </div>

          {step === 'players' && <PlayersStep setup={setup} draft={draft} setDraft={setDraft} />}
          {step === 'cards' && <HeroCardsStep draft={draft} setDraft={setDraft} />}
          {isStreet(step) && (
            <StreetStep
              key={step}
              setup={setup}
              draft={draft}
              setDraft={(next) => {
                setDraft(next)
                setChosenActor(null)
              }}
              street={step}
              actor={actor}
              onActor={setChosenActor}
              onSkip={() => {
                setDraft(clearStreetActions(reachStreet(draft, step), step))
                next()
              }}
            />
          )}
          {step === 'showdown' && <ShowdownStep setup={setup} draft={draft} setDraft={setDraft} />}
          {step === 'review' && (
            <ReviewStep
              setup={setup}
              setSetup={setSetup}
              draft={draft}
              setDraft={setDraft}
              header={header}
              errors={check.errors}
              gaps={check.gaps}
              warnings={check.warnings}
            />
          )}

          <div className="rc-tray -mx-3 border-t border-room-700 bg-room-950/95 px-3 py-2.5 backdrop-blur lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0">
            {check.errors.length > 0 && step !== 'review' && draft.participants.length > 1 && (
              <p className="mb-2 text-xs text-chip-red" role="status">
                {check.errors[0]}
              </p>
            )}
            <div className="flex gap-2">
              <button type="button" className="btn-secondary h-12 px-4" onClick={back} disabled={step === 'players'}>
                <span aria-hidden="true">&larr;</span> Back
              </button>
              {step === 'review' ? (
                <button
                  type="button"
                  className="btn-primary h-12 flex-1 text-base"
                  disabled={saving || check.errors.length > 0}
                  onClick={() => void save()}
                >
                  {saveLabel}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-primary h-12 flex-1 text-base"
                  onClick={next}
                  disabled={step === 'players' && draft.participants.length < 2}
                >
                  {nextLabel(step, ORDER.slice(ORDER.indexOf(step) + 1).find(available))}
                </button>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

function nextLabel(step: Step, following: Step | undefined): string {
  if (step === 'players') return 'Next: cards'
  if (!following || following === 'review') return 'Review'
  if (following === 'showdown') return 'Next: showdown'
  if (following === 'cards') return 'Next: cards'
  return `Next: ${STREET_TITLE[following as Street].toLowerCase()}`
}

function stepDone(step: Exclude<Step, 'review'>, draft: HandDraft): boolean {
  switch (step) {
    case 'players':
      return draft.participants.length > 1
    case 'cards':
      return draft.hero.cards.some((card) => card.rank !== null || card.suit !== null)
    case 'showdown':
      return draft.showdown.length > 0 || draft.winners !== null
    default: {
      const street = draft.streets.find((entry) => entry.street === step)
      return !!street && (street.actions.length > 0 || street.cards.some((card) => card.rank !== null || card.suit !== null))
    }
  }
}

/* ================================================================ steps */

function PlayersStep({ setup, draft, setDraft }: { setup: HandSetup; draft: HandDraft; setDraft: (draft: HandDraft) => void }) {
  const positions = seatPositions(setup)
  const others = setup.seats.filter((entry) => entry.seat !== setup.heroSeat)
  return (
    <div className="space-y-3">
      <p className="text-sm text-room-300">
        Tap the seats on the table, or the positions here. Hero is already in. Everyone you leave out folded preflop.
      </p>
      <fieldset>
        <legend className="label">Opponents</legend>
        <div className="flex flex-wrap gap-1.5">
          {others.map((entry) => {
            const pressed = draft.participants.includes(entry.seat)
            const nickname = seatNickname(setup, entry.seat)
            return (
              <button
                key={entry.seat}
                type="button"
                aria-pressed={pressed}
                onClick={() => setDraft(setParticipant(draft, setup, entry.seat, !pressed))}
                className={`tap flex flex-col items-start justify-center rounded-lg border px-3 py-1 text-left leading-tight ${
                  pressed ? 'border-felt-400 bg-felt-500 text-room-950' : 'border-room-700 bg-room-850 text-room-50'
                }`}
              >
                <span className="text-sm font-semibold">
                  {positions.get(entry.seat) ?? `Seat ${entry.seat}`}
                  <span className="sr-only">, seat {entry.seat}</span>
                </span>
                {nickname && <span className={`max-w-28 truncate text-[0.7rem] ${pressed ? 'text-room-900' : 'text-room-400'}`}>{nickname}</span>}
              </button>
            )
          })}
        </div>
      </fieldset>
      <p className="rounded-lg bg-room-900 px-3 py-2 text-sm font-semibold text-room-50" aria-live="polite">
        {participantsLine(setup, draft.participants)}
      </p>
    </div>
  )
}

function HeroCardsStep({ draft, setDraft }: { draft: HandDraft; setDraft: (draft: HandDraft) => void }) {
  const used = usedExactCards(draft, 'hero')
  const [first, second] = draft.hero.cards
  const ranksOnly = first.rank !== null && second.rank !== null && (first.suit === null || second.suit === null)
  const suitedness = draft.hero.suited
  return (
    <div className="space-y-3">
      <CardInput
        legend="Hero's two cards"
        cards={draft.hero.cards}
        used={used}
        hole
        slotNames={['First card', 'Second card']}
        onChange={(cards, suited) =>
          setDraft(
            setHeroCards(draft, {
              cards: [cards[0]!, cards[1]!],
              suited: suited !== undefined ? suited : draft.hero.suited,
            }),
          )
        }
      />
      {ranksOnly && !isPair(draft.hero) && (
        <fieldset>
          <legend className="label">Suits not exact? Say what you remember</legend>
          <div className="grid grid-cols-3 gap-1.5">
            {(
              [
                [true, 'Suited'],
                [false, 'Offsuit'],
                [null, 'Not sure'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={label}
                type="button"
                aria-pressed={suitedness === value}
                onClick={() => setDraft(setHeroSuited(draft, value))}
                className={`tap rounded-lg border px-2 text-sm font-semibold ${
                  suitedness === value ? 'border-felt-400 bg-felt-500 text-room-950' : 'border-room-700 bg-room-850'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      <p className="text-sm text-room-300" aria-live="polite">
        Hero: <span className="font-semibold text-room-50">{holeCardsText(draft.hero)}</span>
      </p>
    </div>
  )
}

function StreetStep({
  setup,
  draft,
  setDraft,
  street,
  actor,
  onActor,
  onSkip,
}: {
  setup: HandSetup
  draft: HandDraft
  setDraft: (draft: HandDraft) => void
  street: Street
  actor: number | null
  onActor: (seat: number) => void
  onSkip: () => void
}) {
  const positions = seatPositions(setup)
  const flow = flowFor(setup, draft, street)
  const words = streetActionWords(setup, flow, positions)
  const entry = draft.streets.find((item) => item.street === street)
  const title = STREET_TITLE[street]
  const choices = flow.live.filter((seat) => !flow.allIn.includes(seat))
  const over = flow.live.length <= 1
  const closed = !over && flow.toAct.length === 0 && flow.steps.length > 0
  const shortcuts =
    flow.steps.length === 0 ? (street === 'preflop' ? preflopShortcuts(setup, draft) : streetShortcuts(setup, draft, street)) : []
  const lastSized = [...flow.steps].reverse().find((step) => SIZED_ACTIONS.includes(step.action.action) && !step.problem)

  const facing = flow.level > 0
  const canCheck = actor !== null && flow.matched.includes(actor)
  const record = (kind: DraftActionKind) => {
    if (actor === null) return
    setDraft(addAction(draft, setup, street, { seat: actor, action: kind }))
  }

  return (
    <div className="space-y-4">
      {street !== 'preflop' && (
        <BoardStep setup={setup} draft={draft} setDraft={setDraft} street={street} />
      )}

      <section aria-label={`${title} action`} className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="label mb-0">{title} action</h3>
          <div className="flex gap-1">
            <button type="button" className="btn-ghost px-3 text-xs" disabled={!entry || entry.actions.length === 0} onClick={() => setDraft(undoAction(draft, street))}>
              Undo
            </button>
            <button type="button" className="btn-ghost px-3 text-xs" onClick={onSkip}>
              Don&rsquo;t remember
            </button>
          </div>
        </div>

        <ActionTimeline
          words={words}
          label={`${title} action so far`}
          heroSeat={setup.heroSeat}
          empty={street === 'preflop' ? 'Nothing recorded. Pick a line below, tap the actions, or skip.' : 'Nothing recorded. Pick a line, tap the actions, or skip.'}
        />
        <p className="sr-only" aria-live="polite">
          {words.length > 0 ? words.at(-1)!.spoken : ''}
        </p>

        {lastSized && (
          <OptionalAmount
            key={lastSized.action.id}
            label={`${seatName(setup, lastSized.action.seat, positions)} ${lastSized.action.action === 'allin' ? 'all-in' : lastSized.action.action} amount`}
            hint={lastSized.action.action === 'raise' || street === 'preflop' ? 'Total, e.g. raise to $20. Optional.' : 'Optional.'}
            value={lastSized.action.amount}
            onChange={(amount) => setDraft(setActionAmount(draft, street, lastSized.action.id, amount))}
          />
        )}

        {over ? (
          <p className="rounded-lg border border-room-700 bg-room-900 px-3 py-2 text-sm">
            Hand over: {seatName(setup, flow.live[0]!, positions)} is the last player in.
          </p>
        ) : closed ? (
          <p className="text-sm text-room-300">Betting on the {street} is done.</p>
        ) : (
          <>
            {shortcuts.length > 0 && (
              <div>
                <p className="label">Common lines</p>
                <div className="flex flex-wrap gap-1.5">
                  {shortcuts.map((shortcut) => (
                    <button
                      key={shortcut.id}
                      type="button"
                      className="tap rounded-lg border border-room-700 bg-room-850 px-3 py-1.5 text-left text-sm hover:border-room-500"
                      onClick={() => setDraft(applyShortcut(draft, setup, street, shortcut))}
                    >
                      {shortcut.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="label">Who acts</p>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Player acting">
                {choices.map((seat) => (
                  <button
                    key={seat}
                    type="button"
                    aria-pressed={actor === seat}
                    onClick={() => onActor(seat)}
                    className={`tap rounded-lg border px-3 text-sm font-semibold ${
                      actor === seat ? 'border-bone-50 bg-room-700 text-room-50' : 'border-room-700 bg-room-850 text-room-300'
                    }`}
                  >
                    {seatName(setup, seat, positions)}
                    {seatNickname(setup, seat) && (
                      <>
                        {' '}
                        <span className="inline-block max-w-24 truncate align-bottom font-normal text-room-400">
                          · {seatNickname(setup, seat)}
                        </span>
                      </>
                    )}
                    {flow.toAct[0] === seat && <span className="ml-1 text-[0.65rem] font-bold tracking-wide text-felt-200">NEXT</span>}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label={actor !== null ? `${seatSpokenName(setup, actor, positions)}'s action` : 'Action'}>
              <button type="button" className="btn-secondary h-12" disabled={actor === null} onClick={() => record('fold')}>
                Fold
              </button>
              {canCheck || !facing ? (
                <button type="button" className="btn-secondary h-12" disabled={actor === null || !canCheck} onClick={() => record('check')}>
                  Check
                </button>
              ) : (
                <button type="button" className="btn-secondary h-12" disabled={actor === null} onClick={() => record('call')}>
                  Call
                </button>
              )}
              <button type="button" className="btn-secondary h-12" disabled={actor === null} onClick={() => record(facing ? 'raise' : 'bet')}>
                {facing ? (street === 'preflop' && flow.level >= 2 ? `${flow.level + 1}-bet` : 'Raise') : 'Bet'}
              </button>
              <button type="button" className="btn-secondary h-12" disabled={actor === null} onClick={() => record('allin')}>
                All-in
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  )
}

function BoardStep({
  setup,
  draft,
  setDraft,
  street,
}: {
  setup: HandSetup
  draft: HandDraft
  setDraft: (draft: HandDraft) => void
  street: Exclude<Street, 'preflop'>
}) {
  const entry = draft.streets.find((item) => item.street === street)
  const slots: CardMemory[] = entry?.cards ?? Array.from({ length: street === 'flop' ? 3 : 1 }, () => ({ rank: null, suit: null }))
  const used = usedExactCards(draft, street)
  const someSuitUnknown = slots.some((card) => card.suit === null)
  const suits = entry?.suits ?? null
  void setup

  const setPattern = (kind: 'rainbow' | 'two-tone' | 'monotone' | null, suit: Suit | null = null) => {
    if (kind === null) setDraft(setFlopSuits(draft, null))
    else if (kind === 'rainbow') setDraft(setFlopSuits(draft, { kind }))
    else setDraft(setFlopSuits(draft, { kind, suit }))
  }

  return (
    <div className="space-y-3">
      <CardInput
        legend={`${STREET_TITLE[street]} card${slots.length > 1 ? 's' : ''}`}
        cards={slots}
        used={used}
        slotNames={slots.length > 1 ? ['First flop card', 'Second flop card', 'Third flop card'] : [`${STREET_TITLE[street]} card`]}
        onChange={(cards) => {
          let nextDraft = draft
          cards.forEach((card, index) => {
            nextDraft = setBoardCard(nextDraft, street, index, card)
          })
          setDraft(nextDraft)
        }}
      />
      {street === 'flop' && someSuitUnknown && (
        <fieldset>
          <legend className="label">Flop suits, if that is all you remember</legend>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ['rainbow', 'Rainbow'],
                ['two-tone', 'Two of a suit'],
                ['monotone', 'All one suit'],
              ] as const
            ).map(([kind, label]) => (
              <button
                key={kind}
                type="button"
                aria-pressed={suits?.kind === kind}
                onClick={() => setPattern(suits?.kind === kind ? null : kind)}
                className={`tap rounded-lg border px-3 text-sm font-semibold ${
                  suits?.kind === kind ? 'border-felt-400 bg-felt-500 text-room-950' : 'border-room-700 bg-room-850'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {suits && suits.kind !== 'rainbow' && (
            <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label="Which suit">
              {SUITS.map((suit) => (
                <button
                  key={suit}
                  type="button"
                  aria-pressed={suits.suit === suit}
                  onClick={() => setPattern(suits.kind, suits.suit === suit ? null : suit)}
                  className={`tap rounded-lg border px-3 text-sm ${
                    suits.suit === suit ? 'border-felt-400 bg-room-800 text-room-50' : 'border-room-700 bg-room-850 text-room-300'
                  }`}
                >
                  <span aria-hidden="true">{SUIT_SYMBOL[suit]} </span>
                  {SUIT_NAME[suit]}
                </button>
              ))}
            </div>
          )}
        </fieldset>
      )}
    </div>
  )
}

const STATUS_LABEL: Record<ShowdownStatus, string> = {
  shown: 'Showed',
  mucked: 'Mucked',
  unknown: 'Unknown',
  'no-showdown': 'Out before',
}

function ShowdownStep({ setup, draft, setDraft }: { setup: HandSetup; draft: HandDraft; setDraft: (draft: HandDraft) => void }) {
  const positions = seatPositions(setup)
  const flows = handFlow(setup, draft)
  const liveAtEnd = flows.at(-1)?.live ?? draft.participants
  const opponents = liveAtEnd.filter((seat) => seat !== setup.heroSeat)
  const heroEntry = draft.showdown.find((entry) => entry.seat === setup.heroSeat)
  const winners = effectiveWinners(setup, draft)
  const contenders = liveAtEnd.filter((seat) => draft.showdown.find((entry) => entry.seat === seat)?.status !== 'no-showdown')

  // Reaching showdown means the board ran out to the river.
  const atShowdown = (next: HandDraft) => reachStreet(next, 'river')

  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="label">Hero</legend>
        <div className="grid grid-cols-2 gap-1.5">
          {(['shown', 'mucked'] as const).map((status) => {
            const pressed = (heroEntry?.status ?? 'shown') === status
            return (
              <button
                key={status}
                type="button"
                aria-pressed={pressed}
                onClick={() => setDraft(atShowdown(setShowdown(draft, setup.heroSeat, status)))}
                className={`tap rounded-lg border px-3 text-sm font-semibold ${
                  pressed ? 'border-felt-400 bg-felt-500 text-room-950' : 'border-room-700 bg-room-850'
                }`}
              >
                {status === 'shown' ? `Showed ${holeCardsText(draft.hero) === 'Not recorded' ? '' : holeCardsText(draft.hero)}` : 'Mucked'}
              </button>
            )
          })}
        </div>
      </fieldset>

      {opponents.map((seat) => {
        const entry = draft.showdown.find((item) => item.seat === seat)
        const status = entry?.status ?? 'unknown'
        const nickname = seatNickname(setup, seat)
        return (
          <fieldset key={seat} className="space-y-2">
            <legend className="label">
              {seatName(setup, seat, positions)}
              {nickname ? ` · ${nickname}` : ''}
            </legend>
            <div className="grid grid-cols-4 gap-1">
              {(['shown', 'mucked', 'unknown', 'no-showdown'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={status === option}
                  onClick={() => setDraft(atShowdown(setShowdown(draft, seat, option, entry?.cards ?? null)))}
                  className={`tap rounded-lg border px-1 text-xs font-semibold leading-tight ${
                    status === option ? 'border-felt-400 bg-felt-500 text-room-950' : 'border-room-700 bg-room-850'
                  }`}
                >
                  {STATUS_LABEL[option]}
                  {option === 'no-showdown' && <span className="sr-only"> showdown</span>}
                </button>
              ))}
            </div>
            {status === 'shown' && entry?.cards && (
              <CardInput
                legend={`${seatSpokenName(setup, seat, positions)}'s cards`}
                cards={entry.cards.cards}
                used={usedExactCards(draft, seat)}
                hole
                slotNames={['First card', 'Second card']}
                onChange={(cards, suited) =>
                  setDraft(
                    setShowdown(draft, seat, 'shown', {
                      cards: [cards[0]!, cards[1]!],
                      suited: suited !== undefined ? suited : (entry.cards?.suited ?? null),
                    }),
                  )
                }
              />
            )}
          </fieldset>
        )
      })}

      <fieldset>
        <legend className="label">Who won?</legend>
        <div className="flex flex-wrap gap-1.5">
          {contenders.map((seat) => {
            const pressed = draft.winners?.includes(seat) ?? false
            return (
              <button
                key={seat}
                type="button"
                aria-pressed={pressed}
                onClick={() => {
                  const current = draft.winners ?? []
                  setDraft(setWinners(draft, pressed ? current.filter((winner) => winner !== seat) : [...current, seat]))
                }}
                className={`tap rounded-lg border px-3 text-sm font-semibold ${
                  pressed ? 'border-felt-400 bg-felt-500 text-room-950' : 'border-room-700 bg-room-850'
                }`}
              >
                {seatName(setup, seat, positions)}
              </button>
            )
          })}
          <button type="button" className="btn-ghost px-3 text-sm" disabled={draft.winners === null} onClick={() => setDraft(setWinners(draft, null))}>
            Not sure
          </button>
        </div>
        <p className="mt-1.5 text-xs text-room-400">Choose two or more for a split pot.</p>
        <p className="mt-1 text-sm font-semibold" aria-live="polite">
          {winners
            ? winners.length > 1
              ? `Split pot: ${winners.map((seat) => seatName(setup, seat, positions)).join(' and ')}`
              : `${seatName(setup, winners[0]!, positions)} wins`
            : 'Winner not recorded'}
        </p>
      </fieldset>
      {!reachedShowdown(setup, draft) && draft.streets.length < 4 && (
        <p className="text-xs text-room-400">Recording a showdown counts the board as dealt to the river; cards you don&rsquo;t enter stay unknown.</p>
      )}
    </div>
  )
}

function ReviewStep({
  setup,
  setSetup,
  draft,
  setDraft,
  header,
  errors,
  gaps,
  warnings,
}: {
  setup: HandSetup
  setSetup: (setup: HandSetup) => void
  draft: HandDraft
  setDraft: (draft: HandDraft) => void
  header: string
  errors: string[]
  gaps: string[]
  warnings: string[]
}) {
  const summary = summarizeDraft(setup, draft)
  const rebuilt = errors.length === 0 ? reconstructHand(setup, draft) : null
  return (
    <div className="space-y-4">
      {errors.length > 0 && (
        <div role="alert" className="rounded-lg border border-chip-red/50 bg-chip-red/10 px-3 py-2 text-sm text-chip-red">
          <p className="font-semibold">This can&rsquo;t have happened, so it can&rsquo;t be saved yet:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="card-surface p-3">
        <DraftSummaryView summary={summary} heroSeat={setup.heroSeat} header={header} />
      </div>

      <div className="text-sm">
        <h3 className="label">Pot and result</h3>
        {rebuilt?.exact ? (
          <p className="tabular">
            Pot <span className="font-semibold">{formatCents(rebuilt.result.grossPot)}</span>
            {!rebuilt.result.undetermined && (
              <>
                {' '}
                · Hero <span className="font-semibold">{formatCents(rebuilt.result.heroResult, { sign: true })}</span>
              </>
            )}
            <span className="block text-xs text-room-400">Worked out from the amounts you entered.</span>
          </p>
        ) : (
          <>
            {rebuilt && !rebuilt.exact && rebuilt.conflicts.length > 0 ? (
              <StackConflicts setup={setup} setSetup={setSetup} conflicts={rebuilt.conflicts} />
            ) : (
              <p className="text-room-300">
                Not worked out{rebuilt && !rebuilt.exact ? ` — ${rebuilt.missing[0]!}.` : '.'}
              </p>
            )}
            <OptionalAmount label="Pot, if you remember it" hint="Optional. Saved as you remember it, not calculated." value={draft.pot} onChange={(pot) => setDraft(setPot(draft, pot))} />
          </>
        )}
      </div>

      {warnings.length > 0 && (
        <p role="status" className="rounded-lg border border-chip-amber/50 bg-chip-amber/10 px-3 py-2 text-sm text-chip-amber">
          {warnings.join(' ')}
        </p>
      )}

      <HandStacks setup={setup} setSetup={setSetup} draft={draft} />

      {gaps.length > 0 && (
        <div className="text-sm">
          <h3 className="label">Not recorded</h3>
          <p className="mb-1 text-xs text-room-400">Fine to leave. The hand saves as it is, and nothing here is filled in for you.</p>
          <ul className="flex flex-wrap gap-1.5">
            {gaps.map((gap) => (
              <li key={gap} className="chip border-dashed">
                {gap}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/**
 * A recorded amount that disagrees with a starting stack. Shown, not fixed:
 * the player either corrects the amount or, if the table had the stack wrong
 * for this hand, uses the stack the amount implies.
 */
function StackConflicts({
  setup,
  setSetup,
  conflicts,
}: {
  setup: HandSetup
  setSetup: (setup: HandSetup) => void
  conflicts: readonly StackConflict[]
}) {
  return (
    <div role="status" className="space-y-2 rounded-lg border border-chip-amber/50 bg-chip-amber/10 px-3 py-2 text-chip-amber">
      <p className="font-semibold">An amount doesn&rsquo;t match the stacks this hand started with.</p>
      {conflicts.map((conflict) => (
        <div key={conflict.message} className="space-y-1.5">
          <p>{conflict.message}.</p>
          <p className="text-xs text-room-300">
            Change the amount on the street, or, if the stack was different for this hand, correct it below. The stack
            is not changed unless you do.
          </p>
          {conflict.suggestedStartingStack !== null && (
            <button
              type="button"
              className="btn-secondary text-sm"
              onClick={() => setSetup(withHandStack(setup, conflict.seat, conflict.suggestedStartingStack!))}
            >
              Start {seatName(setup, conflict.seat)} on {formatCents(conflict.suggestedStartingStack)} for this hand
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

/** "Adjust this hand": the players' starting stacks for this hand only. */
function HandStacks({
  setup,
  setSetup,
  draft,
}: {
  setup: HandSetup
  setSetup: (setup: HandSetup) => void
  draft: HandDraft
}) {
  const positions = seatPositions(setup)
  return (
    <details className="card-surface p-3 text-sm">
      <summary className="cursor-pointer font-semibold">
        Adjust this hand
        <span className="ml-2 font-normal text-room-400">starting stacks</span>
      </summary>
      <p className="mt-2 text-xs text-room-400">
        For this hand only. The Table keeps its own stacks; change them there if they have changed.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {draft.participants.map((seat) => {
          const entry = setup.seats.find((item) => item.seat === seat)
          if (!entry) return null
          return (
            <MoneyField
              key={seat}
              label={`${seatName(setup, seat, positions)} starting stack`}
              value={entry.startingStack}
              onChange={(value) => value > 0 && setSetup(withHandStack(setup, seat, value))}
            />
          )
        })}
      </div>
    </details>
  )
}

/** An amount that may be left blank. Blank means "not recorded", never zero. */
function OptionalAmount({
  label,
  hint,
  value,
  onChange,
}: {
  label: string
  hint?: string
  value: Cents | null
  onChange: (value: Cents | null) => void
}) {
  const id = useId()
  const [buffer, setBuffer] = useState(value === null ? '' : centsToInput(value))
  const invalid = buffer.trim() !== '' && (parseDollars(buffer) === null || (parseDollars(buffer) ?? 0) <= 0)
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="text-room-400">
          $
        </span>
        <input
          id={id}
          className="field max-w-40 tabular"
          inputMode="decimal"
          autoComplete="off"
          placeholder="Not recorded"
          value={buffer}
          aria-invalid={invalid || undefined}
          aria-describedby={hint ? `${id}-hint` : undefined}
          onChange={(event) => {
            setBuffer(event.target.value)
            const cents = parseDollars(event.target.value)
            if (event.target.value.trim() === '') onChange(null)
            else if (cents !== null && cents > 0) onChange(cents)
          }}
        />
        {value !== null && (
          <button
            type="button"
            className="btn-ghost px-3 text-xs"
            onClick={() => {
              setBuffer('')
              onChange(null)
            }}
          >
            Clear
          </button>
        )}
      </div>
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-room-400">
          {invalid ? 'Enter an amount in dollars, like 20 or 12.50.' : hint}
        </p>
      )}
    </div>
  )
}

/** Exact cards placed anywhere in the hand except the part being edited. */
function usedExactCards(draft: HandDraft, except: 'hero' | Street | number): Card[] {
  const cards: Card[] = []
  if (except !== 'hero') cards.push(...exactCards(draft.hero.cards))
  for (const street of draft.streets) if (street.street !== except) cards.push(...exactCards(street.cards))
  for (const entry of draft.showdown) {
    if (entry.seat === except || entry.status !== 'shown' || !entry.cards) continue
    const hole = exactHoleCards(entry.cards)
    if (hole) cards.push(...hole)
    else cards.push(...entry.cards.cards.filter(isExactCard).map((card) => `${card.rank}${card.suit}`))
  }
  return cards
}
