import { describe, expect, it } from 'vitest'
import { MAX_NARRATION_LENGTH } from '../../domain/poker/narration/context'
import {
  MAX_RECORDING_MS,
  RECORDING_WARNING_MS,
  appendTranscript,
  formatElapsed,
  initialRecorderState,
  isRecording,
  recorderReducer,
  type RecorderEvent,
  type RecorderState,
} from './recorder'

const run = (events: RecorderEvent[], from: RecorderState = { kind: 'idle' }) => events.reduce(recorderReducer, from)

describe('the recorder state machine', () => {
  it('starts unsupported or idle, and unsupported never changes', () => {
    expect(initialRecorderState(true)).toEqual({ kind: 'idle' })
    expect(initialRecorderState(false)).toEqual({ kind: 'unsupported' })
    expect(run([{ type: 'request' }, { type: 'began', at: 1 }], { kind: 'unsupported' })).toEqual({ kind: 'unsupported' })
  })

  it('goes idle → requesting → listening → stopping → stopped', () => {
    expect(run([{ type: 'request' }])).toEqual({ kind: 'requesting' })
    expect(run([{ type: 'request' }, { type: 'began', at: 5 }])).toEqual({ kind: 'listening', startedAt: 5, hearing: false, interim: '' })
    const stopping = run([{ type: 'request' }, { type: 'began', at: 5 }, { type: 'interim', text: 'big blind' }, { type: 'stop', reason: 'user' }])
    expect(stopping).toEqual({ kind: 'stopping', reason: 'user', interim: 'big blind' })
    expect(recorderReducer(stopping, { type: 'ended' })).toEqual({ kind: 'stopped', reason: 'user' })
  })

  it('tracks speech heard and the unsettled guess only while listening', () => {
    const listening = run([{ type: 'request' }, { type: 'began', at: 0 }, { type: 'hearing', on: true }, { type: 'interim', text: 'flop ace' }])
    expect(listening).toMatchObject({ hearing: true, interim: 'flop ace' })
    expect(run([{ type: 'interim', text: 'x' }, { type: 'hearing', on: true }])).toEqual({ kind: 'idle' })
  })

  it('an end the player did not ask for is a stop, not a failure', () => {
    expect(run([{ type: 'request' }, { type: 'began', at: 0 }, { type: 'ended' }])).toEqual({ kind: 'stopped', reason: 'ended' })
    // Ended before listening began (the prompt was dismissed): back to ready.
    expect(run([{ type: 'request' }, { type: 'ended' }])).toEqual({ kind: 'idle' })
  })

  it('an error ends the recording, and the end that follows keeps the error', () => {
    const failed = run([{ type: 'request' }, { type: 'began', at: 0 }, { type: 'error', error: 'network' }, { type: 'ended' }])
    expect(failed).toEqual({ kind: 'error', error: 'network' })
    expect(run([{ type: 'request' }, { type: 'error', error: 'denied' }])).toEqual({ kind: 'error', error: 'denied' })
    // Not recording: an error from nowhere changes nothing.
    expect(run([{ type: 'error', error: 'unknown' }])).toEqual({ kind: 'idle' })
  })

  it('can record again from stopped or error, but never twice at once', () => {
    expect(run([{ type: 'request' }], { kind: 'stopped', reason: 'user' })).toEqual({ kind: 'requesting' })
    expect(run([{ type: 'request' }], { kind: 'error', error: 'no-speech' })).toEqual({ kind: 'requesting' })
    const listening = run([{ type: 'request' }, { type: 'began', at: 3 }])
    expect(recorderReducer(listening, { type: 'request' })).toBe(listening)
  })

  it('a stop while the permission prompt is up asks the service to stop', () => {
    expect(run([{ type: 'request' }, { type: 'stop', reason: 'user' }, { type: 'ended' }])).toEqual({ kind: 'stopped', reason: 'user' })
  })

  it('shows a blocked microphone only when nothing is going', () => {
    expect(run([{ type: 'blocked' }])).toEqual({ kind: 'error', error: 'denied' })
    const listening = run([{ type: 'request' }, { type: 'began', at: 0 }])
    expect(recorderReducer(listening, { type: 'blocked' })).toBe(listening)
  })

  it('names the states in which the microphone may be open', () => {
    expect(isRecording({ kind: 'requesting' })).toBe(true)
    expect(isRecording({ kind: 'listening', startedAt: 0, hearing: false, interim: '' })).toBe(true)
    expect(isRecording({ kind: 'stopping', reason: 'user', interim: '' })).toBe(true)
    for (const kind of ['idle', 'unsupported'] as const) expect(isRecording({ kind })).toBe(false)
    expect(isRecording({ kind: 'stopped', reason: 'limit' })).toBe(false)
    expect(isRecording({ kind: 'error', error: 'network' })).toBe(false)
  })
})

describe('adding a recording to the description', () => {
  it('adds after what was there, with one space, rewriting nothing', () => {
    expect(appendTranscript('', 'okay im cutoff')).toEqual({ text: 'okay im cutoff', full: false })
    expect(appendTranscript('I open 20.', 'he calls')).toEqual({ text: 'I open 20. he calls', full: false })
    expect(appendTranscript('I open 20.\n', 'he calls')).toEqual({ text: 'I open 20.\nhe calls', full: false })
    expect(appendTranscript('kept as is  ', '')).toEqual({ text: 'kept as is  ', full: false })
  })

  it('keeps self-corrections exactly as spoken', () => {
    const said = 'turn nine clubs no sorry river nine clubs turn low diamond'
    expect(appendTranscript('', said).text).toBe(said)
  })

  it('stops at the description limit and says it is full', () => {
    const before = 'a'.repeat(MAX_NARRATION_LENGTH - 5)
    const result = appendTranscript(before, 'big blind calls')
    expect(result.full).toBe(true)
    expect(result.text).toHaveLength(MAX_NARRATION_LENGTH)
    expect(result.text.startsWith(before)).toBe(true)
  })

  it('formats the clock, with a three-minute limit and a warning 30 seconds before', () => {
    expect(formatElapsed(0)).toBe('0:00')
    expect(formatElapsed(65_400)).toBe('1:05')
    expect(MAX_RECORDING_MS).toBe(180_000)
    expect(RECORDING_WARNING_MS).toBe(150_000)
  })
})
