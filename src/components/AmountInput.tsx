import { useState } from 'react'
import { centsToInput, formatCents, parseDollars, type Cents } from '../domain/money'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '00'] as const

/**
 * An on-screen keypad rather than a text input.
 *
 * A native number field on a phone means the OS keyboard covering half the
 * screen, then a mis-tap on a tiny key. These targets are large, always
 * visible, and the buffer is plain text so "12.50" behaves the way it reads.
 * A real input is still rendered (visually hidden labelling aside) so keyboard
 * and screen-reader users are not forced through the keypad.
 */
export function AmountInput({
  value,
  onChange,
  label,
  max,
}: {
  value: Cents
  onChange: (value: Cents) => void
  label: string
  max?: Cents
}) {
  const [buffer, setBuffer] = useState(() => centsToInput(value))
  const [lastValue, setLastValue] = useState(value)

  // Follow external changes (a sizing shortcut being tapped, for instance)
  // by adjusting during render, which avoids a second render pass.
  if (value !== lastValue) {
    setLastValue(value)
    if (parseDollars(buffer) !== value) setBuffer(centsToInput(value))
  }

  const commit = (next: string) => {
    setBuffer(next)
    const cents = parseDollars(next)
    if (cents === null) return
    onChange(max !== undefined ? Math.min(cents, max) : cents)
  }

  const press = (key: string) => {
    if (key === '.' && buffer.includes('.')) return
    const next = buffer === '0' && key !== '.' ? key : buffer + key
    // Two decimal places is the most a chip can be divided into.
    if (/\.\d{3,}$/.test(next)) return
    commit(next)
  }

  const backspace = () => commit(buffer.slice(0, -1) || '0')

  return (
    <div>
      <label className="label" htmlFor="amount-input">
        {label}
      </label>
      <div className="mb-2 flex items-center gap-2">
        <span aria-hidden="true" className="text-2xl font-semibold text-room-400">
          $
        </span>
        <input
          id="amount-input"
          inputMode="decimal"
          className="field flex-1 text-2xl font-semibold tabular"
          value={buffer}
          onChange={(event) => commit(event.target.value)}
        />
        {max !== undefined && (
          <button type="button" className="btn-secondary" onClick={() => commit(centsToInput(max))}>
            Max
          </button>
        )}
      </div>
      <p className="mb-2 text-sm text-room-400 tabular" aria-live="polite">
        {formatCents(value)}
        {max !== undefined && value >= max ? ' — all-in' : ''}
      </p>
      <div className="grid grid-cols-3 gap-1.5">
        {KEYS.map((key) => (
          <button
            key={key}
            type="button"
            className="tap h-12 rounded-lg border border-room-700 bg-room-850 text-lg font-semibold hover:border-room-500"
            onClick={() => press(key)}
          >
            {key}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="btn-secondary mt-1.5 w-full"
        onClick={backspace}
        aria-label="Delete last digit"
      >
        <span aria-hidden="true">&#9003; Delete</span>
      </button>
    </div>
  )
}
