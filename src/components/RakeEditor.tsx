import { useId } from 'react'
import type { RakeStructure, Street } from '../domain/poker/models'
import { rakeStructureSummary } from '../domain/poker/rake'
import { MoneyField } from './MoneyField'

/**
 * Editor for a room's drop structure.
 *
 * Every amount is editable and nothing is assumed: the shipped presets are
 * labelled as examples to verify, because drop structures differ by room and
 * change without notice. Rake and the jackpot/promotional drop are kept as
 * separate figures throughout so the pot breakdown can show both.
 */
export function RakeEditor({
  value,
  onChange,
  presets,
  onSavePreset,
}: {
  value: RakeStructure
  onChange: (rake: RakeStructure) => void
  presets: readonly RakeStructure[]
  onSavePreset?: (rake: RakeStructure) => void
}) {
  const presetId = useId()
  const capId = useId()
  const jackpotStreetId = useId()
  const nameId = useId()
  const notesId = useId()

  const set = <K extends keyof RakeStructure>(key: K, next: RakeStructure[K]) =>
    onChange({ ...value, [key]: next })

  return (
    <div className="space-y-4">
      <div>
        <label className="label" htmlFor={presetId}>
          Preset
        </label>
        <select
          id={presetId}
          className="field"
          value={presets.some((preset) => preset.id === value.id) ? value.id : ''}
          onChange={(event) => {
            const preset = presets.find((entry) => entry.id === event.target.value)
            if (preset) onChange({ ...preset })
          }}
        >
          <option value="">Custom</option>
          {presets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-room-400">{rakeStructureSummary(value)}</p>
      </div>

      <div>
        <label className="label" htmlFor={nameId}>
          Name
        </label>
        <input
          id={nameId}
          className="field"
          value={value.name}
          maxLength={120}
          onChange={(event) => set('name', event.target.value)}
        />
      </div>

      <fieldset>
        <legend className="label">Drop taken as each street is reached</legend>
        <div className="grid grid-cols-2 gap-3">
          <MoneyField label="Preflop" value={value.preflop} onChange={(next) => set('preflop', next)} />
          <MoneyField label="Flop" value={value.flop} onChange={(next) => set('flop', next)} />
          <MoneyField label="Turn" value={value.turn} onChange={(next) => set('turn', next)} />
          <MoneyField label="River" value={value.river} onChange={(next) => set('river', next)} />
        </div>
        <p className="mt-2 text-xs text-room-400">
          Amounts are additive. A $1 preflop and $3.50 flop drop takes $4.50 in total by the flop.
        </p>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <MoneyField
          label="Jackpot / promo drop"
          value={value.jackpot}
          onChange={(next) => set('jackpot', next)}
        />
        <div>
          <label className="label" htmlFor={jackpotStreetId}>
            Jackpot taken on
          </label>
          <select
            id={jackpotStreetId}
            className="field"
            value={value.jackpotStreet}
            onChange={(event) => set('jackpotStreet', event.target.value as Street)}
          >
            <option value="preflop">Preflop</option>
            <option value="flop">Flop</option>
            <option value="turn">Turn</option>
            <option value="river">River</option>
          </select>
        </div>
      </div>

      <div>
        <label className="flex items-center gap-3 py-2">
          <input
            type="checkbox"
            className="h-5 w-5 rounded border-room-700 bg-room-850 accent-felt-500"
            checked={value.cap !== null}
            onChange={(event) => set('cap', event.target.checked ? value.cap ?? 500 : null)}
          />
          <span className="text-sm">Cap the rake (the jackpot drop sits outside the cap)</span>
        </label>
        {value.cap !== null && (
          <div id={capId}>
            <MoneyField label="Rake cap" value={value.cap} onChange={(next) => set('cap', next)} />
          </div>
        )}
      </div>

      <label className="flex items-center gap-3 py-2">
        <input
          type="checkbox"
          className="h-5 w-5 rounded border-room-700 bg-room-850 accent-felt-500"
          checked={value.noFlopNoDrop}
          onChange={(event) => set('noFlopNoDrop', event.target.checked)}
        />
        <span className="text-sm">No flop, no drop</span>
      </label>

      <div>
        <label className="label" htmlFor={notesId}>
          Notes
        </label>
        <textarea
          id={notesId}
          className="field min-h-20"
          rows={2}
          maxLength={4000}
          value={value.notes ?? ''}
          onChange={(event) => set('notes', event.target.value)}
          placeholder="Anything worth remembering about this room's drop."
        />
      </div>

      {onSavePreset && (
        <button
          type="button"
          className="btn-secondary w-full"
          onClick={() => onSavePreset({ ...value, id: value.id || crypto.randomUUID() })}
        >
          Save as preset
        </button>
      )}
    </div>
  )
}
