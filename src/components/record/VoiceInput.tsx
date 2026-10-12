import { useId, useRef } from 'react'
import type { HandNarrationParser } from '../../domain/poker/narration/parser'
import { SPEECH_ERROR_TEXT, STOP_TEXT, formatElapsed, isRecording, type RecorderState } from '../../services/speech/recorder'
import type { SpeechTranscriber } from '../../services/speech/transcriber'
import { NarrationInput, type NarrationStatus } from './NarrationInput'
import { useVoiceRecorder } from './useVoiceRecorder'

/**
 * Speak a hand: one microphone control, then the transcript in the same box
 * a typed description uses, and the same "Build draft".
 *
 * Nothing is sent to the narration parser when a recording stops: the
 * player reads the transcript, fixes what was misheard, and builds the
 * draft themselves. The microphone is asked for only on a tap. Recording
 * state is told in words (and to screen readers), never by the red alone.
 */

const STATUS_WORD: Record<RecorderState['kind'], string> = {
  unsupported: 'Unavailable',
  idle: 'Ready',
  requesting: 'Waiting for the microphone…',
  listening: 'Listening…',
  stopping: 'Processing transcript…',
  stopped: 'Stopped',
  error: 'Not recording',
}

export function VoiceInput({
  transcriber,
  text,
  onText,
  parser,
  status,
  onBuild,
  onClear,
  onManual,
  onType,
}: {
  transcriber: SpeechTranscriber
  text: string
  onText: (text: string) => void
  parser: HandNarrationParser
  status: NarrationStatus
  onBuild: () => void
  onClear: () => void
  onManual: () => void
  onType: () => void
}) {
  const id = useId()
  const box = useRef<HTMLTextAreaElement>(null)
  const recorder = useVoiceRecorder({ transcriber, text, onText })
  const { state } = recorder
  const recording = isRecording(state)
  const working = status.kind === 'working'

  if (state.kind === 'unsupported') {
    return (
      <section aria-labelledby={`${id}-title`} className="space-y-3">
        <h2 id={`${id}-title`} className="text-lg font-semibold tracking-tight">
          Speak your hand
        </h2>
        <div role="status" className="rounded-lg border border-room-700 bg-room-900 px-3 py-3 text-sm">
          <p className="font-semibold text-room-50">Voice transcription isn’t available in this browser.</p>
          <p className="mt-1 text-room-300">Type or paste the hand instead — it builds the same draft.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn-primary h-12 px-4" onClick={onType}>
              Type / paste instead
            </button>
            <button type="button" className="btn-secondary h-12 px-4" onClick={onManual}>
              Build manually
            </button>
          </div>
        </div>
      </section>
    )
  }

  const listening = state.kind === 'listening'
  const control =
    state.kind === 'stopping'
      ? { label: 'Finishing the transcript', hint: 'Finishing…', action: undefined }
      : recording
        ? { label: 'Stop recording hand', hint: 'Tap to stop', action: recorder.stop }
        : { label: 'Start recording hand', hint: text.trim() === '' ? 'Tap to record' : 'Tap to record more', action: recorder.start }
  const interim = state.kind === 'listening' || state.kind === 'stopping' ? state.interim : ''

  const panel = (
    <div className="space-y-2">
      <div className={`rc-voice ${listening ? 'rc-voice--live' : ''}`}>
        <button
          type="button"
          className={`rc-mic ${recording ? 'rc-mic--live' : ''}`}
          aria-label={control.label}
          aria-describedby={`${id}-state`}
          disabled={control.action === undefined || working}
          onClick={control.action}
        >
          {recording ? <StopGlyph /> : <MicGlyph />}
        </button>
        <div className="min-w-0 flex-1">
          <p id={`${id}-state`} role="status" className="text-base font-semibold text-room-50">
            {STATUS_WORD[state.kind]}
            {recorder.warning && <span className="text-chip-amber"> 30 seconds left.</span>}
          </p>
          <p aria-hidden="true" className="mt-0.5 flex items-center gap-2 text-sm text-room-300">
            <span>{control.hint}</span>
            {listening && (
              <>
                <span className="tabular text-room-100">{formatElapsed(recorder.elapsed)}</span>
                <span className={`rc-hearing ${state.hearing ? 'rc-hearing--on' : ''}`}>{state.hearing ? 'hearing you' : 'quiet'}</span>
              </>
            )}
          </p>
        </div>
      </div>
      <p className="text-xs text-room-400">
        <span className="font-semibold text-room-300">Speech to text: </span>
        {transcriber.disclosure}
      </p>

      {state.kind === 'error' && (
        <div role="alert" className="rounded-lg border border-chip-amber/50 bg-chip-amber/10 px-3 py-2.5 text-sm">
          <p className="font-semibold text-chip-amber">{SPEECH_ERROR_TEXT[state.error]}</p>
          {text.trim() !== '' && <p className="mt-0.5 text-room-300">Everything already transcribed is kept.</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="btn-secondary px-4" disabled={working} onClick={recorder.start}>
              Retry recording
            </button>
            {text.trim() !== '' && (
              <button type="button" className="btn-secondary px-4" onClick={() => box.current?.focus()}>
                Continue editing
              </button>
            )}
            <button type="button" className="btn-secondary px-4" onClick={onType}>
              Type instead
            </button>
          </div>
        </div>
      )}
      {state.kind === 'stopped' && (
        <p className="rounded-lg border border-room-700 bg-room-900 px-3 py-2 text-sm text-room-300">{STOP_TEXT[state.reason]}</p>
      )}
    </div>
  )

  return (
    <NarrationInput
      text={text}
      onText={onText}
      parser={parser}
      status={status}
      onBuild={onBuild}
      onClear={onClear}
      onManual={onManual}
      title="Speak your hand"
      label="Transcript"
      placeholder="Tap the microphone and tell the hand the way you’d tell a friend. The words appear here, ready to fix."
      noticeLabel="Reading the hand:"
      before={panel}
      after={
        interim && (
          <p aria-hidden="true" className="rc-interim">
            <span className="font-semibold not-italic">Still hearing: </span>
            {interim}…
          </p>
        )
      }
      locked={recording}
      inputRef={box}
    />
  )
}

function MicGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" />
    </svg>
  )
}

function StopGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  )
}
