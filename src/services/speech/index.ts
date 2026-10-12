import type { SpeechTranscriber } from './transcriber'
import { webSpeechTranscriber } from './webSpeech'

/**
 * The transcriber this build uses: the browser's own speech recognition.
 * A server-side transcription provider would be chosen here, behind the
 * same interface, without changing the recording screen.
 */
export function activeSpeechTranscriber(): SpeechTranscriber {
  return webSpeechTranscriber()
}
