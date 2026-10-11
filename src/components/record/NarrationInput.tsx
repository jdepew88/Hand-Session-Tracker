import { useId } from 'react'
import { MAX_NARRATION_LENGTH } from '../../domain/poker/narration/context'
import { PARSE_FAILURE_TEXT, type HandNarrationParser, type NarrationParseResult } from '../../domain/poker/narration/parser'

export type NarrationStatus = { kind: 'idle' } | { kind: 'working' } | { kind: 'failed'; reason: Exclude<NarrationParseResult, { ok: true }>['reason'] }

/**
 * Paste or type a hand the way you would tell it. The words are kept as
 * typed -- through a failed request, a reload, or a trip to the manual
 * recorder -- until the hand is saved or cleared.
 *
 * "Build draft" sits above the box as well as below it, so the phone
 * keyboard never hides it.
 */
export function NarrationInput({
  text,
  onText,
  parser,
  status,
  onBuild,
  onClear,
  onManual,
}: {
  text: string
  onText: (text: string) => void
  parser: HandNarrationParser
  status: NarrationStatus
  onBuild: () => void
  onClear: () => void
  onManual: () => void
}) {
  const id = useId()
  const working = status.kind === 'working'
  const empty = text.trim() === ''
  const build = (
    <button type="button" className="btn-primary px-4" disabled={working || empty} onClick={onBuild}>
      {working ? 'Building…' : 'Build draft'}
    </button>
  )

  return (
    <section aria-labelledby={`${id}-title`} className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id={`${id}-title`} className="text-lg font-semibold tracking-tight">
          Tell me the hand however you remember it.
        </h2>
        <div className="shrink-0">{build}</div>
      </div>

      <div>
        <label htmlFor={`${id}-text`} className="label">
          Hand description
        </label>
        <textarea
          id={`${id}-text`}
          className="field min-h-40 text-base leading-relaxed"
          rows={7}
          maxLength={MAX_NARRATION_LENGTH}
          value={text}
          placeholder="I’m on the button with ace-king suited. Cutoff opens to 20, I make it 65…"
          aria-describedby={`${id}-privacy ${id}-count`}
          disabled={working}
          onChange={(event) => onText(event.target.value)}
        />
        <p id={`${id}-count`} className="mt-1 text-right text-xs text-room-400 tabular">
          {text.length.toLocaleString('en-US')} / {MAX_NARRATION_LENGTH.toLocaleString('en-US')}
        </p>
      </div>

      <p id={`${id}-privacy`} className="rounded-lg border border-room-700 bg-room-900 px-3 py-2 text-sm text-room-300">
        {parser.description}
      </p>

      <div className="flex gap-2">
        <button type="button" className="btn-ghost px-4" disabled={working || empty} onClick={onClear}>
          Clear
        </button>
        <div className="flex-1" />
        {build}
      </div>

      <div aria-live="polite" role="status">
        {working && <p className="text-sm text-room-300">Building the draft…</p>}
      </div>

      {status.kind === 'failed' && (
        <div role="alert" className="rounded-lg border border-chip-amber/50 bg-chip-amber/10 px-3 py-2.5 text-sm">
          <p className="font-semibold text-chip-amber">Couldn’t build the draft right now.</p>
          <p className="mt-0.5 text-room-300">{PARSE_FAILURE_TEXT[status.reason]} Your description is kept.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {status.reason !== 'empty' && status.reason !== 'too-long' && (
              <button type="button" className="btn-secondary px-4" onClick={onBuild}>
                Retry
              </button>
            )}
            <button type="button" className="btn-secondary px-4" onClick={onManual}>
              Continue manually
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
