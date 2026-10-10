import { useMemo, useState } from 'react'
import { formatCents } from '../domain/money'
import { HAND_TAGS, type HandRecord, type HandResult } from '../domain/poker/models'
import { handFilename, serializeHand } from '../domain/poker/serialize'
import { handSummaryText } from '../domain/poker/summary'
import { copyText, downloadTextFile } from '../utils/files'

/**
 * The end-of-hand screen: a readable history, and the four things a player
 * actually wants to do with it -- copy it, keep the file, star it, annotate it.
 */
export function HandSummaryPanel({
  record,
  result,
  onChange,
  showText = true,
}: {
  record: HandRecord
  /** Null when a reconstructed hand does not say enough to work the money out. */
  result: HandResult | null
  onChange: (record: HandRecord) => void
  /** Show the plain-text history. Off where the hand is already drawn street by street. */
  showText?: boolean
}) {
  const [copied, setCopied] = useState(false)
  const [customTag, setCustomTag] = useState('')

  const summary = useMemo(() => handSummaryText(record), [record])

  const toggleTag = (tag: string) =>
    onChange({
      ...record,
      tags: record.tags.includes(tag)
        ? record.tags.filter((entry) => entry !== tag)
        : [...record.tags, tag],
    })

  return (
    <section className="space-y-4 px-3 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Hand summary</h2>
          {result && (
            <p className="mt-0.5 text-sm tabular">
              {!result.undetermined && (
                <span className={result.heroResult >= 0 ? 'text-felt-200' : 'text-chip-red'}>
                  {formatCents(result.heroResult, { sign: true })}
                  {' · '}
                </span>
              )}
              <span className="text-room-400">
                gross {formatCents(result.grossPot)} · drop {formatCents(result.rake.total)} · net{' '}
                {formatCents(result.netPot)}
              </span>
            </p>
          )}
        </div>
        <button
          type="button"
          aria-pressed={record.favorite}
          className={`tap rounded-lg border px-3 py-2 text-sm font-semibold ${
            record.favorite
              ? 'border-chip-amber bg-chip-amber/15 text-chip-amber'
              : 'border-room-700 bg-room-850 text-room-300'
          }`}
          onClick={() => onChange({ ...record, favorite: !record.favorite })}
        >
          <span aria-hidden="true">&#9733;</span> {record.favorite ? 'Favourite' : 'Favourite'}
        </button>
      </div>

      {showText && (
        <pre className="card-surface overflow-x-auto whitespace-pre-wrap p-3 text-sm leading-relaxed">
          {summary}
        </pre>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          className="btn-secondary h-12"
          onClick={async () => {
            setCopied(await copyText(summary))
          }}
        >
          {copied ? 'Copied' : 'Copy summary'}
        </button>
        <button
          type="button"
          className="btn-secondary h-12"
          onClick={() => downloadTextFile(handFilename(record), serializeHand(record))}
        >
          Export JSON
        </button>
      </div>

      <fieldset>
        <legend className="label">Tags</legend>
        <div className="flex flex-wrap gap-1.5">
          {[...new Set([...HAND_TAGS, ...record.tags])].map((tag) => {
            const selected = record.tags.includes(tag)
            return (
              <button
                key={tag}
                type="button"
                aria-pressed={selected}
                onClick={() => toggleTag(tag)}
                className={`tap rounded-lg border px-3 py-2 text-sm ${
                  selected
                    ? 'border-felt-400 bg-felt-500 text-room-950 font-semibold'
                    : 'border-room-700 bg-room-850'
                }`}
              >
                {tag}
              </button>
            )
          })}
        </div>
        <div className="mt-2 flex gap-2">
          <label className="sr-only" htmlFor="custom-tag">
            Custom tag
          </label>
          <input
            id="custom-tag"
            className="field"
            placeholder="Custom tag"
            maxLength={64}
            value={customTag}
            onChange={(event) => setCustomTag(event.target.value)}
          />
          <button
            type="button"
            className="btn-secondary"
            disabled={customTag.trim() === ''}
            onClick={() => {
              toggleTag(customTag.trim())
              setCustomTag('')
            }}
          >
            Add
          </button>
        </div>
      </fieldset>

      <label className="block">
        <span className="label">Notes</span>
        <textarea
          className="field min-h-24"
          rows={3}
          maxLength={4000}
          placeholder="What you were thinking, what you would do differently."
          value={record.notes}
          onChange={(event) => onChange({ ...record, notes: event.target.value })}
        />
      </label>
    </section>
  )
}
