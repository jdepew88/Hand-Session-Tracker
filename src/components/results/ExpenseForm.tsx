import { useId, useState, type FormEvent } from 'react'
import type { Cents } from '../../domain/money'
import { newId } from '../../domain/poker/factories'
import { EXPENSE_CATEGORIES, type Expense, type ExpenseCategory, type ExpenseScope } from '../../domain/results/models'
import { EXPENSE_CATEGORY_INFO } from '../../domain/results/stats'
import { dateInputToIso, dateInputValue } from '../../utils/labels'
import { MoneyField } from '../MoneyField'
import { CategoryIcon } from './CategoryIcon'

/** Large enough for a flight or a week of hotel; small enough to catch a typo. */
export const MAX_EXPENSE: Cents = 10_000_000

export interface SessionChoice {
  id: string
  label: string
  location: string
  /** ISO start, used as the expense date when the session is picked. */
  startedAt: string
}

/**
 * Add an expense: category, amount and date, then optional session, place,
 * note and whether it counts as a playing or a trip cost. The scope follows
 * the category until the player picks one themselves.
 */
export function ExpenseForm({
  sessions,
  persistent,
  now,
  onSave,
  onCancel,
}: {
  sessions: SessionChoice[]
  persistent: boolean
  now: number
  onSave: (expense: Expense) => void
  onCancel: () => void
}) {
  const id = useId()
  const [category, setCategory] = useState<ExpenseCategory>('tips')
  const [amount, setAmount] = useState<Cents>(0)
  const [date, setDate] = useState(() => dateInputValue(now))
  const [sessionId, setSessionId] = useState('')
  const [location, setLocation] = useState('')
  const [note, setNote] = useState('')
  const [scopeChoice, setScopeChoice] = useState<ExpenseScope | null>(null)
  const [error, setError] = useState<string | null>(null)
  const scope = scopeChoice ?? EXPENSE_CATEGORY_INFO[category].scope

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const iso = dateInputToIso(date)
    if (amount <= 0) return setError('Enter an amount above $0.')
    if (amount > MAX_EXPENSE) return setError('That amount is larger than SessionTracker accepts for one expense.')
    if (!iso) return setError('Choose a date.')
    const stamp = new Date().toISOString()
    onSave({
      id: newId(),
      category,
      amount,
      date: iso,
      sessionId: sessionId || null,
      location: location.trim().slice(0, 120),
      note: note.trim().slice(0, 200),
      scope,
      createdAt: stamp,
      updatedAt: stamp,
    })
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <fieldset>
        <legend className="label">Category</legend>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {EXPENSE_CATEGORIES.map((value) => (
            <label
              key={value}
              className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-2.5 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-felt-400 ${
                category === value
                  ? 'border-brass-400/70 bg-brass-400/10 font-semibold text-bone-50'
                  : 'border-room-700 bg-room-850 text-room-300'
              }`}
            >
              <input
                type="radio"
                name={`${id}-category`}
                value={value}
                checked={category === value}
                onChange={() => setCategory(value)}
                className="sr-only"
              />
              <CategoryIcon category={value} className="h-4 w-4 shrink-0 text-brass-300" />
              <span className="min-w-0 leading-tight">{EXPENSE_CATEGORY_INFO[value].label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-3 min-[400px]:grid-cols-2">
        <MoneyField label="Amount" value={amount} onChange={setAmount} required />
        <div>
          <label htmlFor={`${id}-date`} className="label">
            Date
          </label>
          <input id={`${id}-date`} type="date" className="field" value={date} required onChange={(event) => setDate(event.target.value)} />
        </div>
      </div>

      {sessions.length > 0 && (
        <div>
          <label htmlFor={`${id}-session`} className="label">
            Session <span className="normal-case tracking-normal text-room-400">(optional)</span>
          </label>
          <select
            id={`${id}-session`}
            className="field"
            value={sessionId}
            onChange={(event) => {
              const chosen = sessions.find((session) => session.id === event.target.value)
              setSessionId(event.target.value)
              if (chosen) {
                if (!location.trim()) setLocation(chosen.location)
                setDate(dateInputValue(Date.parse(chosen.startedAt)))
              }
            }}
          >
            <option value="">Not tied to a session</option>
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="grid gap-3 min-[400px]:grid-cols-2">
        <div>
          <label htmlFor={`${id}-location`} className="label">
            Casino or place <span className="normal-case tracking-normal text-room-400">(optional)</span>
          </label>
          <input id={`${id}-location`} className="field" value={location} maxLength={120} onChange={(event) => setLocation(event.target.value)} />
        </div>
        <div>
          <label htmlFor={`${id}-note`} className="label">
            Note <span className="normal-case tracking-normal text-room-400">(optional)</span>
          </label>
          <input id={`${id}-note`} className="field" value={note} maxLength={200} onChange={(event) => setNote(event.target.value)} />
        </div>
      </div>

      <fieldset>
        <legend className="label">Counts as</legend>
        <div className="grid grid-cols-2 gap-1.5">
          {(
            [
              ['playing', 'Playing cost', 'Tips, parking, fees'],
              ['trip', 'Trip cost', 'Food, travel, hotels'],
            ] as const
          ).map(([value, label, hint]) => (
            <label
              key={value}
              className={`flex min-h-11 cursor-pointer flex-col justify-center rounded-lg border px-3 py-1.5 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-felt-400 ${
                scope === value ? 'border-brass-400/70 bg-brass-400/10 text-bone-50' : 'border-room-700 bg-room-850 text-room-300'
              }`}
            >
              <input
                type="radio"
                name={`${id}-scope`}
                value={value}
                checked={scope === value}
                onChange={() => setScopeChoice(value)}
                className="sr-only"
              />
              <span className="font-semibold">{label}</span>
              <span className="text-xs text-room-400">{hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {error && (
        <p role="alert" className="text-sm text-loss">
          {error}
        </p>
      )}
      {!persistent && (
        <p className="text-xs text-room-400">Preview: expenses are kept until you reload the page. Saving them is coming.</p>
      )}

      <div className="grid grid-cols-2 gap-2 pt-1">
        <button type="button" onClick={onCancel} className="btn-secondary h-12">
          Cancel
        </button>
        <button type="submit" className="btn-primary h-12">
          Save expense
        </button>
      </div>
    </form>
  )
}
