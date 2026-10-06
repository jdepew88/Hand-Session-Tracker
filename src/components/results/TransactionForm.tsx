import { useId, useState, type FormEvent } from 'react'
import type { Cents } from '../../domain/money'
import { newId } from '../../domain/poker/factories'
import type { BankrollTransaction, BankrollTransactionKind } from '../../domain/results/models'
import { dateInputToIso, dateInputValue } from '../../utils/labels'
import { MoneyField } from '../MoneyField'

export const MAX_TRANSACTION: Cents = 100_000_000

const COPY: Record<BankrollTransactionKind, { label: string; explain: string; placeholder: string; save: string }> = {
  deposit: {
    label: 'Add funds',
    explain: 'Money you set aside for poker. It raises your bankroll; it is not a win.',
    placeholder: 'Starting bankroll',
    save: 'Add to bankroll',
  },
  withdrawal: {
    label: 'Withdraw funds',
    explain: 'Money you take out of poker and back into your liferoll. It lowers your bankroll; it is not a loss.',
    placeholder: 'Moved to liferoll',
    save: 'Withdraw from bankroll',
  },
}

/**
 * Record money moving into or out of the 401G bankroll. A record only:
 * SessionTracker never holds or moves money.
 */
export function TransactionForm({
  initialKind,
  persistent,
  now,
  onSave,
  onCancel,
}: {
  initialKind: BankrollTransactionKind
  persistent: boolean
  now: number
  onSave: (transaction: BankrollTransaction) => void
  onCancel: () => void
}) {
  const id = useId()
  const [kind, setKind] = useState<BankrollTransactionKind>(initialKind)
  const [amount, setAmount] = useState<Cents>(0)
  const [date, setDate] = useState(() => dateInputValue(now))
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const copy = COPY[kind]

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const iso = dateInputToIso(date)
    if (amount <= 0) return setError('Enter an amount above $0.')
    if (amount > MAX_TRANSACTION) return setError('That amount is larger than SessionTracker accepts.')
    if (!iso) return setError('Choose a date.')
    const stamp = new Date().toISOString()
    onSave({ id: newId(), kind, amount, date: iso, note: note.trim().slice(0, 200), createdAt: stamp, updatedAt: stamp })
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <fieldset>
        <legend className="sr-only">Direction</legend>
        <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-room-850 p-1">
          {(['deposit', 'withdrawal'] as const).map((value) => (
            <label
              key={value}
              className={`flex min-h-11 cursor-pointer items-center justify-center rounded-lg text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-felt-400 ${
                kind === value ? 'bg-room-700 font-semibold text-bone-50' : 'text-room-300'
              }`}
            >
              <input
                type="radio"
                name={`${id}-kind`}
                value={value}
                checked={kind === value}
                onChange={() => setKind(value)}
                className="sr-only"
              />
              {COPY[value].label}
            </label>
          ))}
        </div>
      </fieldset>
      <p className="text-sm text-room-300">{copy.explain}</p>

      <div className="grid gap-3 min-[400px]:grid-cols-2">
        <MoneyField label="Amount" value={amount} onChange={setAmount} required />
        <div>
          <label htmlFor={`${id}-date`} className="label">
            Date
          </label>
          <input id={`${id}-date`} type="date" className="field" value={date} required onChange={(event) => setDate(event.target.value)} />
        </div>
      </div>
      <div>
        <label htmlFor={`${id}-note`} className="label">
          Note <span className="normal-case tracking-normal text-room-400">(optional)</span>
        </label>
        <input
          id={`${id}-note`}
          className="field"
          value={note}
          maxLength={200}
          placeholder={copy.placeholder}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-loss">
          {error}
        </p>
      )}
      {!persistent && (
        <p className="text-xs text-room-400">Preview: bankroll entries are kept until you reload the page. Saving them is coming.</p>
      )}

      <div className="grid grid-cols-2 gap-2 pt-1">
        <button type="button" onClick={onCancel} className="btn-secondary h-12">
          Cancel
        </button>
        <button type="submit" className="btn-primary h-12 px-2">
          {copy.save}
        </button>
      </div>
    </form>
  )
}
