import { useId, useRef } from 'react'
import {
  REVIEW_STATE_WORD,
  openQuestions,
  type Clarification,
  type NarrationOutcome,
  type ReviewFact,
  type ReviewState,
} from '../../domain/poker/narration/normalize'
import { summarizeDraft } from '../../domain/poker/draft/text'
import { DraftSummaryView } from './DraftSummaryView'

/**
 * What a hand description became, before anything is saved.
 *
 * Questions come first, as large buttons answered here -- no second trip to
 * the parser. Then every fact, grouped by how sure the app is: Confirmed
 * (said, or worked out from the table), Interpreted (read from shorthand),
 * Needs clarification, Not recorded. Each group is told apart by its words
 * and a symbol, never by colour alone, and a screen reader hears
 * "Interpreted: Big blind bets two-thirds pot."
 *
 * Confirming does not save: it opens the draft in Quick Reconstruct's own
 * Review, with its own checks and its own Save button.
 */

const ORDER: ReviewState[] = ['clarify', 'interpreted', 'confirmed', 'unrecorded']

const SYMBOL: Record<ReviewState, string> = { confirmed: '✓', interpreted: '≈', clarify: '?', unrecorded: '–' }

const GROUP_CLASS: Record<ReviewState, string> = {
  clarify: 'border-chip-amber/60 bg-chip-amber/5',
  interpreted: 'border-brass-400/50 border-dashed',
  confirmed: 'border-room-700',
  unrecorded: 'border-room-700 border-dashed',
}

const BADGE_CLASS: Record<ReviewState, string> = {
  clarify: 'border-chip-amber/60 text-chip-amber',
  interpreted: 'border-brass-400/60 text-brass-200',
  confirmed: 'border-felt-400/60 text-felt-200',
  unrecorded: 'border-room-500 border-dashed text-room-400',
}

export function NarrationReview({
  outcome,
  onAnswer,
  onEditText,
  onEditDraft,
  onConfirm,
}: {
  outcome: NarrationOutcome
  onAnswer: (id: string, answer: string | null) => void
  onEditText: () => void
  onEditDraft: () => void
  onConfirm: () => void
}) {
  const id = useId()
  const questionsRef = useRef<HTMLElement>(null)
  const open = openQuestions(outcome)
  const summary = summarizeDraft(outcome.setup, outcome.draft)
  // While questions are open, the draft's own errors are mostly their echo: show them once answered.
  const errors = open.length === 0 ? outcome.errors : []
  const groups = ORDER.map((state) => ({ state, facts: outcome.facts.filter((fact) => fact.state === state) })).filter(
    (group) => group.facts.length > 0 || (group.state === 'clarify' && errors.length > 0),
  )

  return (
    <section aria-labelledby={`${id}-title`} className="space-y-4">
      <div>
        <h2 id={`${id}-title`} className="text-lg font-semibold tracking-tight">
          Check the draft
        </h2>
        <p className="text-sm text-room-300">Nothing is saved yet. Answer anything below, then confirm to finish in the recorder.</p>
      </div>

      {outcome.questions.length > 0 && (
        <section ref={questionsRef} tabIndex={-1} aria-labelledby={`${id}-questions`} className="space-y-3 outline-none">
          <h3 id={`${id}-questions`} className="label mb-0">
            Questions {open.length > 0 ? `(${open.length} to answer)` : ''}
          </h3>
          {outcome.questions.map((question) => (
            <Question key={question.id} question={question} onAnswer={(answer) => onAnswer(question.id, answer)} />
          ))}
          {open.length > 0 && <p className="text-xs text-room-400">The rest of the draft fills in from your answers.</p>}
        </section>
      )}

      {groups.map(({ state, facts }) => (
        <section key={state} aria-labelledby={`${id}-${state}`} className={`rounded-lg border p-3 ${GROUP_CLASS[state]}`}>
          <h3 id={`${id}-${state}`} className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.12em]">
            <span aria-hidden="true" className={`grid h-5 w-5 place-items-center rounded-full border text-xs ${BADGE_CLASS[state]}`}>
              {SYMBOL[state]}
            </span>
            {REVIEW_STATE_WORD[state]}
            <span className="font-normal text-room-400">({facts.length + (state === 'clarify' ? errors.length : 0)})</span>
          </h3>
          <ul className="mt-2 space-y-2">
            {state === 'clarify' &&
              errors.map((error) => (
                <li key={error} className="text-sm">
                  <span className="sr-only">Needs clarification: </span>
                  <span className="font-semibold text-room-50">Can’t have happened as built:</span> {error}
                </li>
              ))}
            {facts.map((fact) => (
              <FactItem key={fact.id} fact={fact} />
            ))}
          </ul>
        </section>
      ))}

      {outcome.notes.length > 0 && (
        <div className="text-sm">
          <h3 className="label">Kept as notes with the hand</h3>
          <ul className="list-disc space-y-0.5 pl-5 text-room-300">
            {outcome.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="card-surface p-3">
        <h3 className="label">The draft</h3>
        <DraftSummaryView summary={summary} heroSeat={outcome.setup.heroSeat} />
      </div>

      <div className="rc-tray -mx-3 border-t border-room-700 bg-room-950/95 px-3 py-2.5 backdrop-blur lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0">
        {open.length > 0 && (
          <p className="mb-2 text-xs text-chip-amber" id={`${id}-blocked`}>
            {open.length === 1 ? 'One question needs an answer' : `${open.length} questions need answers`} before confirming.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary h-12 px-3" onClick={onEditText}>
            Edit text
          </button>
          <button type="button" className="btn-secondary h-12 px-3" onClick={onEditDraft}>
            Edit draft
          </button>
          {open.length > 0 ? (
            <button
              type="button"
              className="btn-primary h-12 min-w-36 flex-1 text-base"
              onClick={() => {
                questionsRef.current?.scrollIntoView({ block: 'start' })
                questionsRef.current?.focus()
              }}
            >
              Clarify
            </button>
          ) : (
            <button type="button" className="btn-primary h-12 min-w-36 flex-1 text-base" onClick={onConfirm}>
              Confirm draft
            </button>
          )}
        </div>
      </div>
    </section>
  )
}

function Question({ question, onAnswer }: { question: Clarification; onAnswer: (answer: string | null) => void }) {
  return (
    <fieldset className={`rounded-lg border p-3 ${question.answer === null && question.required ? 'border-chip-amber/60' : 'border-room-700'}`}>
      <legend className="px-1 text-base font-semibold text-room-50">
        {question.question}
        <span className="ml-2 text-xs font-normal text-room-400">{question.required ? 'Needed' : 'Optional'}</span>
      </legend>
      {question.said && <p className="mb-2 text-sm text-room-300">You said: {question.said}</p>}
      <div className="flex flex-wrap gap-2">
        {question.options.map((option) => {
          const chosen = question.answer === option.id
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={chosen}
              onClick={() => onAnswer(chosen ? null : option.id)}
              className={`tap min-h-12 rounded-lg border px-3 text-left text-sm font-semibold ${
                chosen ? 'border-felt-400 bg-felt-500 text-room-950' : 'border-room-700 bg-room-850 text-room-50 hover:border-room-500'
              }`}
            >
              {chosen && (
                <span aria-hidden="true" className="mr-1">
                  ✓
                </span>
              )}
              {option.label}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

function FactItem({ fact }: { fact: ReviewFact }) {
  return (
    <li className="text-sm">
      <p>
        <span aria-hidden="true" className={`mr-2 inline-block rounded border px-1.5 text-[0.65rem] font-bold uppercase tracking-wide ${BADGE_CLASS[fact.state]}`}>
          {SYMBOL[fact.state]} {fact.topic}
        </span>
        <span className="sr-only">
          {REVIEW_STATE_WORD[fact.state]}: {fact.spoken}
        </span>
        <span aria-hidden="true" className={fact.state === 'unrecorded' ? 'italic text-room-400' : 'font-semibold text-room-50'}>
          {fact.text}
        </span>
      </p>
      {fact.said && fact.said !== fact.text && <p className="mt-0.5 text-xs text-room-400">You said: “{fact.said}”</p>}
      {fact.detail && <p className="mt-0.5 text-xs text-room-400">{fact.detail}</p>}
    </li>
  )
}
