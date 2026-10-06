import { useId } from 'react'
import {
  ALL_RESULTS,
  DATE_PRESETS,
  isFiltered,
  type DatePreset,
  type FilterOption,
  type ResultsFilter,
} from '../../domain/results/filters'

/**
 * Date, casino, game and stakes, as four plain selects. Options come from the
 * data, so nothing is offered that would show an empty page.
 */
export function ResultsFilters({
  filter,
  onChange,
  options,
  summary,
}: {
  filter: ResultsFilter
  onChange: (filter: ResultsFilter) => void
  options: { locations: FilterOption[]; games: FilterOption[]; stakes: FilterOption[] }
  /** "Showing 23 of 41 sessions" */
  summary: string
}) {
  const id = useId()
  const set = (patch: Partial<ResultsFilter>) => onChange({ ...filter, ...patch })

  return (
    <section aria-labelledby={`${id}-heading`} className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id={`${id}-heading`} className="text-sm font-semibold text-bone-50">
          Filter results
        </h2>
        <p className="text-xs text-room-400 tabular" aria-live="polite">
          {summary}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
        <Select
          label="Dates"
          value={filter.preset}
          onChange={(value) => set({ preset: value as DatePreset })}
          options={DATE_PRESETS}
        />
        <Select
          label="Casino"
          value={filter.location ?? ''}
          onChange={(value) => set({ location: value || null })}
          options={[{ value: '', label: 'All casinos' }, ...options.locations]}
        />
        <Select
          label="Game"
          value={filter.game ?? ''}
          onChange={(value) => set({ game: value || null })}
          options={[{ value: '', label: 'All games' }, ...options.games]}
        />
        <Select
          label="Stakes"
          value={filter.stakes ?? ''}
          onChange={(value) => set({ stakes: value || null })}
          options={[{ value: '', label: 'All stakes' }, ...options.stakes]}
        />
        {isFiltered(filter) && (
          <button
            type="button"
            onClick={() => onChange(ALL_RESULTS)}
            className="btn-ghost col-span-2 h-11 self-end lg:col-span-1"
          >
            Clear filters
          </button>
        )}
      </div>
      {filter.preset === 'custom' && (
        <div className="grid grid-cols-2 gap-2 sm:max-w-md">
          <DateInput label="From" value={filter.from ?? ''} max={filter.to ?? undefined} onChange={(from) => set({ from: from || null })} />
          <DateInput label="To" value={filter.to ?? ''} min={filter.from ?? undefined} onChange={(to) => set({ to: to || null })} />
        </div>
      )}
    </section>
  )
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: readonly { value: string; label: string }[]
}) {
  const id = useId()
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="label">
        {label}
      </label>
      <select id={id} className="field" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}

function DateInput({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  min?: string
  max?: string
}) {
  const id = useId()
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="label">
        {label}
      </label>
      <input id={id} type="date" className="field" value={value} min={min} max={max} onChange={(event) => onChange(event.target.value)} />
    </div>
  )
}
