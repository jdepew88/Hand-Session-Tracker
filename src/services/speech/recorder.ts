import { MAX_NARRATION_LENGTH } from '../../domain/poker/narration/context'
import type { SpeechErrorCode } from './transcriber'

/**
 * The recording screen's state, as one value.
 *
 *   idle ──tap──▶ requesting ──began──▶ listening ──tap / limit / left app──▶ stopping ──ended──▶ stopped
 *                     │                    │  └──────── service ended on its own ─────────────────▶ stopped
 *                     └────── error ───────┴──▶ error
 *
 * `stopped` and `error` are where the transcript is reviewed and edited; a
 * tap from either records more, added after what is there. `unsupported`
 * never changes. The words themselves are not here: settled text lives in
 * the hand description (and is saved with it), and only the unsettled
 * guess (`interim`) is held, for display.
 */

/** Long enough to tell any hand, short enough to stop a forgotten microphone. */
export const MAX_RECORDING_MS = 3 * 60_000
/** "30 seconds left" from here. */
export const RECORDING_WARNING_MS = MAX_RECORDING_MS - 30_000

export type StopReason =
  /** The player tapped Stop. */
  | 'user'
  /** The time limit. */
  | 'limit'
  /** The description is full. */
  | 'full'
  /** The player left the app or locked the phone. */
  | 'hidden'
  /** The speech service ended the recording itself, usually after a silence. */
  | 'ended'

export type RecorderState =
  | { kind: 'unsupported' }
  | { kind: 'idle' }
  | { kind: 'requesting' }
  | { kind: 'listening'; startedAt: number; hearing: boolean; interim: string }
  | { kind: 'stopping'; reason: StopReason; interim: string }
  | { kind: 'stopped'; reason: StopReason }
  | { kind: 'error'; error: SpeechErrorCode }

export type RecorderEvent =
  | { type: 'request' }
  | { type: 'began'; at: number }
  | { type: 'interim'; text: string }
  | { type: 'hearing'; on: boolean }
  | { type: 'stop'; reason: StopReason }
  | { type: 'error'; error: SpeechErrorCode }
  | { type: 'ended' }
  /** The browser already says the microphone is blocked: show that without asking again. */
  | { type: 'blocked' }

export const initialRecorderState = (supported: boolean): RecorderState => (supported ? { kind: 'idle' } : { kind: 'unsupported' })

/** A recording is going: the microphone may be open. */
export const isRecording = (state: RecorderState) => state.kind === 'requesting' || state.kind === 'listening' || state.kind === 'stopping'

export function recorderReducer(state: RecorderState, event: RecorderEvent): RecorderState {
  if (state.kind === 'unsupported') return state
  switch (event.type) {
    case 'request':
      return isRecording(state) ? state : { kind: 'requesting' }
    case 'began':
      return state.kind === 'requesting' ? { kind: 'listening', startedAt: event.at, hearing: false, interim: '' } : state
    case 'interim':
      if (state.kind === 'listening' || state.kind === 'stopping') return { ...state, interim: event.text }
      return state
    case 'hearing':
      return state.kind === 'listening' ? { ...state, hearing: event.on } : state
    case 'stop':
      if (state.kind === 'listening') return { kind: 'stopping', reason: event.reason, interim: state.interim }
      // Stopped before listening began (a permission prompt still showing): nothing was heard.
      if (state.kind === 'requesting') return { kind: 'stopping', reason: event.reason, interim: '' }
      return state
    case 'error':
      return isRecording(state) ? { kind: 'error', error: event.error } : state
    case 'ended':
      if (state.kind === 'stopping') return { kind: 'stopped', reason: state.reason }
      if (state.kind === 'listening') return { kind: 'stopped', reason: 'ended' }
      if (state.kind === 'requesting') return { kind: 'idle' }
      return state
    case 'blocked':
      return state.kind === 'idle' ? { kind: 'error', error: 'denied' } : state
  }
}

/**
 * The description after this recording: what was there when it began, then
 * what has been settled since. Nothing is rewritten; a space separates the
 * two. `full` says the words no longer fit.
 */
export function appendTranscript(before: string, heard: string): { text: string; full: boolean } {
  const words = heard.trim()
  if (words === '') return { text: before, full: false }
  const joined = before.trim() === '' ? words : `${before}${/\s$/.test(before) ? '' : ' '}${words}`
  return joined.length > MAX_NARRATION_LENGTH ? { text: joined.slice(0, MAX_NARRATION_LENGTH), full: true } : { text: joined, full: false }
}

/** m:ss */
export function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export const SPEECH_ERROR_TEXT: Record<SpeechErrorCode, string> = {
  denied: 'Microphone access is blocked. Allow microphone access in your browser settings, or type the hand instead.',
  'no-speech': 'Didn’t hear anything. Try again, a little closer to the phone, or type the hand instead.',
  network: 'Voice transcription in this browser needs a connection, and it couldn’t reach its speech service. Check the connection, or type the hand instead.',
  'no-microphone': 'No microphone was found, or it was disconnected.',
  service: 'This browser’s speech service isn’t available. On an iPhone, Dictation may need to be switched on in Settings.',
  unknown: 'Recording stopped unexpectedly.',
}

export const STOP_TEXT: Record<StopReason, string> = {
  user: 'Stopped. Check the transcript, fix anything misheard, then build the draft.',
  limit: 'Stopped at the 3-minute limit. Everything heard is kept.',
  full: 'Stopped: the description is full. Everything heard is kept.',
  hidden: 'Stopped when you left the app. Everything heard is kept.',
  ended: 'Recording stopped on its own, usually after a pause. Everything heard is kept — tap the microphone to carry on.',
}
