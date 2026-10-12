import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import {
  MAX_RECORDING_MS,
  RECORDING_WARNING_MS,
  appendTranscript,
  initialRecorderState,
  isRecording,
  recorderReducer,
  type StopReason,
} from '../../services/speech/recorder'
import type { SpeechTranscriber, TranscriptionSession } from '../../services/speech/transcriber'

/**
 * One recording at a time, wired to the hand description.
 *
 * Settled words go straight into the description through `onText` (which
 * saves it), added after whatever was there when the recording began. The
 * unsettled guess is only shown. The microphone opens only from `start`,
 * which the screen calls from a tap; it closes on Stop, at the time limit,
 * when the description is full, when the player leaves the app, and when
 * the screen goes away.
 */
export function useVoiceRecorder({
  transcriber,
  text,
  onText,
  limitMs = MAX_RECORDING_MS,
  warningMs = RECORDING_WARNING_MS,
}: {
  transcriber: SpeechTranscriber
  text: string
  onText: (text: string) => void
  limitMs?: number
  warningMs?: number
}) {
  const [state, dispatch] = useReducer(recorderReducer, transcriber.supported, initialRecorderState)
  const [now, setNow] = useState(() => Date.now())
  const session = useRef<TranscriptionSession | null>(null)
  const before = useRef('')
  const textRef = useRef(text)
  const onTextRef = useRef(onText)
  useEffect(() => {
    textRef.current = text
    onTextRef.current = onText
  })

  const stop = useCallback((reason: StopReason = 'user') => {
    dispatch({ type: 'stop', reason })
    session.current?.stop()
  }, [])

  const start = useCallback(() => {
    if (!transcriber.supported || session.current) return
    before.current = textRef.current
    dispatch({ type: 'request' })
    try {
      session.current = transcriber.start({
        onStart: () => dispatch({ type: 'began', at: Date.now() }),
        onUpdate: ({ final, interim }) => {
          const next = appendTranscript(before.current, final)
          if (next.text !== textRef.current) onTextRef.current(next.text)
          dispatch({ type: 'interim', text: next.full ? '' : interim })
          if (next.full) stop('full')
        },
        onHearing: (on) => dispatch({ type: 'hearing', on }),
        onError: (error) => dispatch({ type: 'error', error }),
        onEnd: () => {
          session.current = null
          dispatch({ type: 'ended' })
        },
      })
    } catch {
      session.current = null
      dispatch({ type: 'error', error: 'unknown' })
    }
  }, [transcriber, stop])

  // A blocked microphone is shown as blocked, without asking again. Querying never prompts.
  useEffect(() => {
    if (!transcriber.supported || transcriber.kind !== 'browser') return
    let live = true
    navigator.permissions
      ?.query({ name: 'microphone' as PermissionName })
      .then((status) => {
        if (live && status.state === 'denied') dispatch({ type: 'blocked' })
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [transcriber])

  // The clock, the warning and the limit.
  const listening = state.kind === 'listening'
  const startedAt = listening ? state.startedAt : 0
  useEffect(() => {
    if (!listening) return
    const tick = () => {
      const at = Date.now()
      setNow(at)
      if (at - startedAt >= limitMs) stop('limit')
    }
    const timer = setInterval(tick, 250)
    return () => clearInterval(timer)
  }, [listening, startedAt, limitMs, stop])

  // Leaving the app or locking the phone ends the recording; the words stay.
  const recording = isRecording(state)
  useEffect(() => {
    if (!recording) return
    const onHide = () => {
      if (document.visibilityState === 'hidden') stop('hidden')
    }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [recording, stop])

  // Leaving the screen drops the recording. Settled words are already saved.
  useEffect(
    () => () => {
      session.current?.abort()
      session.current = null
    },
    [],
  )

  const elapsed = listening ? Math.max(0, now - startedAt) : 0
  return {
    state,
    elapsed,
    /** Time is nearly up. */
    warning: listening && elapsed >= warningMs,
    start,
    stop: () => stop('user'),
  }
}
