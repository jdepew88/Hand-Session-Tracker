// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeTranscriber } from '../../services/speech/fakeTranscriber'
import { MAX_RECORDING_MS, RECORDING_WARNING_MS } from '../../services/speech/recorder'
import { useVoiceRecorder } from './useVoiceRecorder'

/** The recording clock: a warning 30 seconds out, then a clean stop that keeps every word. */

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

function setup(text = '') {
  const speech = fakeTranscriber()
  const onText = vi.fn()
  const hook = renderHook(({ value }) => useVoiceRecorder({ transcriber: speech.transcriber, text: value, onText }), { initialProps: { value: text } })
  return { speech, onText, hook }
}

describe('the recording time limit', () => {
  it('warns before the limit and stops at it, keeping what was heard', () => {
    const { speech, onText, hook } = setup()
    act(() => hook.result.current.start())
    act(() => speech.current().begin())
    act(() => speech.current().say('flop ace king queen'))
    expect(onText).toHaveBeenLastCalledWith('flop ace king queen')
    hook.rerender({ value: 'flop ace king queen' })

    act(() => vi.advanceTimersByTime(RECORDING_WARNING_MS - 1000))
    expect(hook.result.current.warning).toBe(false)
    expect(hook.result.current.elapsed).toBeGreaterThan(0)
    act(() => vi.advanceTimersByTime(2000))
    expect(hook.result.current.warning).toBe(true)
    expect(speech.current().stopped).toBe(false)

    act(() => vi.advanceTimersByTime(MAX_RECORDING_MS - RECORDING_WARNING_MS))
    expect(speech.current().stopped).toBe(true)
    expect(hook.result.current.state).toEqual({ kind: 'stopped', reason: 'limit' })
    expect(onText).toHaveBeenCalledTimes(1)
  })

  it('a stop before listening begins never reports elapsed time', () => {
    const { speech, hook } = setup()
    act(() => hook.result.current.start())
    expect(hook.result.current.state).toEqual({ kind: 'requesting' })
    act(() => hook.result.current.stop())
    expect(speech.current().stopped).toBe(true)
    expect(hook.result.current.state).toEqual({ kind: 'stopped', reason: 'user' })
    expect(hook.result.current.elapsed).toBe(0)
  })

  it('adds to text already there, and never starts a second recording on a double tap', () => {
    const { speech, onText, hook } = setup('I open 20.')
    act(() => {
      hook.result.current.start()
      hook.result.current.start()
    })
    expect(speech.recordings).toHaveLength(1)
    act(() => speech.current().begin())
    act(() => speech.current().say('big blind calls'))
    expect(onText).toHaveBeenLastCalledWith('I open 20. big blind calls')
  })

  it('stops when the description is full', () => {
    const { speech, onText, hook } = setup('x'.repeat(3990))
    act(() => hook.result.current.start())
    act(() => speech.current().begin())
    act(() => speech.current().say('and then the river came the nine of clubs'))
    expect((onText.mock.calls.at(-1)![0] as string).length).toBe(4000)
    expect(speech.current().stopped).toBe(true)
    expect(hook.result.current.state).toEqual({ kind: 'stopped', reason: 'full' })
  })
})
