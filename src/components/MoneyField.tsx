import { useId, useState } from 'react'
import { centsToInput, parseDollars, type Cents } from '../domain/money'

/**
 * A dollar text field backed by integer cents.
 *
 * The visible buffer is kept as typed so a half-finished "12." does not get
 * rewritten under the cursor; only parseable values are pushed upstream.
 */
export function MoneyField({
  label,
  value,
  onChange,
  hint,
  required,
  min = 0,
}: {
  label: string
  value: Cents
  onChange: (value: Cents) => void
  hint?: string
  required?: boolean
  min?: Cents
}) {
  const id = useId()
  const [buffer, setBuffer] = useState(() => centsToInput(value))
  const [lastValue, setLastValue] = useState(value)

  // Adjust state during render rather than in an effect: when the value is
  // changed from outside, rewrite the buffer -- but leave a half-typed "12."
  // alone when the change came from this field.
  if (value !== lastValue) {
    setLastValue(value)
    if (parseDollars(buffer) !== value) setBuffer(centsToInput(value))
  }

  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="text-room-400">
          $
        </span>
        <input
          id={id}
          className="field tabular"
          inputMode="decimal"
          required={required}
          value={buffer}
          onChange={(event) => {
            setBuffer(event.target.value)
            const cents = parseDollars(event.target.value)
            if (cents !== null) onChange(Math.max(min, cents))
          }}
          onBlur={() => setBuffer(centsToInput(value))}
        />
      </div>
      {hint && <p className="mt-1 text-xs text-room-400">{hint}</p>}
    </div>
  )
}
