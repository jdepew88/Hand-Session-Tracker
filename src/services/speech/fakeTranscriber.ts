import { joinFinalPieces, type SpeechErrorCode, type SpeechTranscriber, type TranscriberHandlers, type TranscriptionSession } from './transcriber'

/**
 * A transcriber driven by a test, for checking the recording screen without
 * a microphone. Each `start` opens a recording the test then plays: begin,
 * interim and settled words, speech heard, an error, an unexpected end.
 */

export interface FakeRecording {
  /** Listening began (the permission prompt, if any, was accepted). */
  begin: () => void
  /** A settled piece of speech. */
  say: (words: string) => void
  /** A guess still being worked on. */
  guess: (words: string) => void
  hearing: (on: boolean) => void
  fail: (error: SpeechErrorCode) => void
  /** The service stops on its own. */
  end: () => void
  readonly stopped: boolean
  readonly aborted: boolean
}

export interface FakeTranscriber {
  transcriber: SpeechTranscriber
  readonly recordings: FakeRecording[]
  /** The recording most recently started. */
  current: () => FakeRecording
}

function openRecording(handlers: TranscriberHandlers): { recording: FakeRecording; session: TranscriptionSession } {
  const pieces: string[] = []
  let live = true
  let stopped = false
  let aborted = false
  const send = (call: () => void) => {
    if (live) call()
  }
  const finish = () =>
    send(() => {
      live = false
      handlers.onEnd()
    })
  const recording: FakeRecording = {
    begin: () => send(() => handlers.onStart()),
    say: (words) =>
      send(() => {
        pieces.push(words)
        handlers.onUpdate({ final: joinFinalPieces(pieces), interim: '' })
      }),
    guess: (words) => send(() => handlers.onUpdate({ final: joinFinalPieces(pieces), interim: words })),
    hearing: (on) => send(() => handlers.onHearing(on)),
    fail: (error) => send(() => handlers.onError(error)),
    end: finish,
    get stopped() {
      return stopped
    },
    get aborted() {
      return aborted
    },
  }
  const session: TranscriptionSession = {
    stop: () => {
      stopped = true
      finish()
    },
    abort: () => {
      aborted = true
      live = false
    },
  }
  return { recording, session }
}

export function fakeTranscriber({ supported = true }: { supported?: boolean } = {}): FakeTranscriber {
  const recordings: FakeRecording[] = []
  const transcriber: SpeechTranscriber = {
    kind: 'fake',
    supported,
    disclosure: 'Test transcriber: nothing leaves this device.',
    start(handlers) {
      if (!supported) throw new Error('unsupported')
      const { recording, session } = openRecording(handlers)
      recordings.push(recording)
      return session
    },
  }
  return {
    transcriber,
    recordings,
    current: () => {
      const last = recordings[recordings.length - 1]
      if (!last) throw new Error('No recording has started.')
      return last
    },
  }
}
