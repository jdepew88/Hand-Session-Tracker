/**
 * Speech to text, and nothing else.
 *
 * A transcriber turns the player's voice into words. It knows nothing about
 * poker: it never picks seats, positions, cards, actions, amounts or
 * winners. Its words go into the same editable description a typed hand
 * uses, and the narration parser reads them from there.
 *
 * The recording screen talks only to this interface, so a server-side
 * transcription provider can be added later without touching the screen.
 * No implementation keeps or uploads audio of its own.
 */

/** Why a recording stopped early. Every one keeps the words already heard. */
export type SpeechErrorCode =
  /** The browser or the player blocked the microphone. */
  | 'denied'
  /** Nothing was heard. */
  | 'no-speech'
  /** The browser's speech service needs the network and could not reach it. */
  | 'network'
  /** No microphone, or it was disconnected. */
  | 'no-microphone'
  /** The browser's speech service refused or is switched off. */
  | 'service'
  /** Anything else. */
  | 'unknown'

/**
 * What has been heard in this recording so far. `final` is settled text;
 * `interim` is a guess the service may still change and is never kept.
 */
export interface TranscriptUpdate {
  final: string
  interim: string
}

export interface TranscriberHandlers {
  /** Listening has begun (after any permission prompt). */
  onStart: () => void
  onUpdate: (update: TranscriptUpdate) => void
  /** Speech heard / gone quiet, when the service says so. */
  onHearing: (hearing: boolean) => void
  onError: (error: SpeechErrorCode) => void
  /** The recording is over, for whatever reason. Always the last call. */
  onEnd: () => void
}

export interface TranscriptionSession {
  /** Finish: the service settles what it has heard, then ends. */
  stop: () => void
  /** Drop it now: no further calls to the handlers. */
  abort: () => void
}

export interface SpeechTranscriber {
  readonly kind: 'browser' | 'fake'
  /** False when this browser has no speech recognition at all. */
  readonly supported: boolean
  /** Where the audio goes, said plainly beside the microphone. */
  readonly disclosure: string
  /** Begin a recording. Called only from a tap on the microphone. */
  start: (handlers: TranscriberHandlers) => TranscriptionSession
}

/**
 * Settled pieces of speech, in order, joined with single spaces. A piece
 * that repeats and extends the one before it replaces it: some mobile
 * browsers report "I raise", then "I raise to seventeen", both as settled.
 */
export function joinFinalPieces(pieces: readonly string[]): string {
  const kept: string[] = []
  for (const raw of pieces) {
    const piece = raw.trim().replace(/\s+/g, ' ')
    if (piece === '') continue
    const last = kept[kept.length - 1]
    if (last !== undefined && piece.toLowerCase().startsWith(last.toLowerCase())) kept[kept.length - 1] = piece
    else kept.push(piece)
  }
  return kept.join(' ')
}
