import { joinFinalPieces, type SpeechErrorCode, type SpeechTranscriber } from './transcriber'

/**
 * The browser's own speech recognition (the Web Speech API).
 *
 * Chrome and Edge expose it as `webkitSpeechRecognition` / `SpeechRecognition`;
 * Safari exposes `webkitSpeechRecognition`; Firefox does not have it. How
 * the audio is transcribed is up to the browser: Chrome, for one, may send
 * it to its maker's speech service, so it is not assumed to work offline.
 * SessionTracker never sees the audio -- only the words come back.
 *
 * No phrase hints are given: the standard way (`SpeechGrammarList`) does
 * nothing in current browsers. Poker words the service mishears are fixed
 * in the transcript, and the narration parser reads loose wording anyway.
 */

/** The small part of the API used here; DOM typings do not include it. */
interface RecognitionResult {
  readonly isFinal: boolean
  readonly length: number
  readonly [index: number]: { readonly transcript: string } | undefined
}

interface RecognitionResultEvent {
  readonly results: { readonly length: number; readonly [index: number]: RecognitionResult | undefined }
}

interface Recognition {
  continuous: boolean
  interimResults: boolean
  lang: string
  maxAlternatives: number
  onstart: (() => void) | null
  onresult: ((event: RecognitionResultEvent) => void) | null
  onspeechstart: (() => void) | null
  onspeechend: (() => void) | null
  onerror: ((event: { readonly error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

type RecognitionConstructor = new () => Recognition

export const SPEECH_DISCLOSURE =
  'Your browser turns your speech into text. Depending on the browser, the audio may be processed by its maker’s speech service. SessionTracker never records or keeps audio — only the text below.'

export function recognitionConstructor(scope: object = globalThis): RecognitionConstructor | null {
  const found = (scope as Record<string, unknown>).SpeechRecognition ?? (scope as Record<string, unknown>).webkitSpeechRecognition
  return typeof found === 'function' ? (found as RecognitionConstructor) : null
}

export function speechErrorCode(error: string): SpeechErrorCode {
  switch (error) {
    case 'not-allowed':
      return 'denied'
    case 'no-speech':
      return 'no-speech'
    case 'network':
      return 'network'
    case 'audio-capture':
      return 'no-microphone'
    case 'service-not-allowed':
    case 'language-not-supported':
      return 'service'
    default:
      return 'unknown'
  }
}

/** English, the language the narration parser reads; the player's own English variant when they use one. */
export function recognitionLanguage(language: string | undefined): string {
  return language && /^en(-|$)/i.test(language) ? language : 'en-US'
}

export function webSpeechTranscriber(scope: object = globalThis): SpeechTranscriber {
  const Constructor = recognitionConstructor(scope)
  return {
    kind: 'browser',
    supported: Constructor !== null,
    disclosure: SPEECH_DISCLOSURE,
    start(handlers) {
      if (!Constructor) throw new Error('Speech recognition is not available.')
      const recognition = new Constructor()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.maxAlternatives = 1
      recognition.lang = recognitionLanguage((scope as { navigator?: { language?: string } }).navigator?.language)

      let ended = false
      recognition.onstart = () => handlers.onStart()
      recognition.onspeechstart = () => handlers.onHearing(true)
      recognition.onspeechend = () => handlers.onHearing(false)
      recognition.onresult = (event) => {
        // The event carries the whole recording so far; rebuild from it rather than patching.
        const final: string[] = []
        const interim: string[] = []
        for (let index = 0; index < event.results.length; index += 1) {
          const result = event.results[index]
          const words = result?.[0]?.transcript ?? ''
          if (result?.isFinal) final.push(words)
          else interim.push(words)
        }
        handlers.onUpdate({ final: joinFinalPieces(final), interim: interim.join(' ').trim().replace(/\s+/g, ' ') })
      }
      // The browser reports "aborted" for a recording it was told to drop; that is not a failure.
      recognition.onerror = (event) => {
        if (event.error !== 'aborted') handlers.onError(speechErrorCode(event.error))
      }
      recognition.onend = () => {
        if (ended) return
        ended = true
        handlers.onEnd()
      }

      const detach = () => {
        ended = true
        recognition.onstart = recognition.onresult = recognition.onspeechstart = recognition.onspeechend = recognition.onerror = recognition.onend = null
      }

      recognition.start()
      return {
        stop: () => recognition.stop(),
        abort: () => {
          detach()
          recognition.abort()
        },
      }
    },
  }
}
