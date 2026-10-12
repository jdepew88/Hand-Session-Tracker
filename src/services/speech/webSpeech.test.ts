import { describe, expect, it, vi } from 'vitest'
import { joinFinalPieces, type TranscriberHandlers } from './transcriber'
import { recognitionConstructor, recognitionLanguage, speechErrorCode, webSpeechTranscriber } from './webSpeech'

/** The browser's speech recognition, against a stand-in: no microphone, no network. */

class FakeRecognition {
  static last: FakeRecognition | null = null
  continuous = false
  interimResults = false
  lang = ''
  maxAlternatives = 0
  onstart: (() => void) | null = null
  onresult: ((event: unknown) => void) | null = null
  onspeechstart: (() => void) | null = null
  onspeechend: (() => void) | null = null
  onerror: ((event: { error: string }) => void) | null = null
  onend: (() => void) | null = null
  start = vi.fn()
  stop = vi.fn(() => this.onend?.())
  abort = vi.fn()
  constructor() {
    FakeRecognition.last = this
  }
  /** Results so far: [words, settled]. */
  results(...items: [string, boolean][]) {
    const list = items.map(([transcript, isFinal]) => Object.assign([{ transcript }], { isFinal }))
    this.onresult?.({ results: list })
  }
}

const handlers = () =>
  ({ onStart: vi.fn(), onUpdate: vi.fn(), onHearing: vi.fn(), onError: vi.fn(), onEnd: vi.fn() }) satisfies TranscriberHandlers

const scope = (extra: object = {}) => ({ webkitSpeechRecognition: FakeRecognition, navigator: { language: 'en-GB' }, ...extra })

describe('the Web Speech transcriber', () => {
  it('is unsupported where the browser has no speech recognition, and never throws on load', () => {
    expect(recognitionConstructor({})).toBeNull()
    const transcriber = webSpeechTranscriber({})
    expect(transcriber.supported).toBe(false)
    expect(() => transcriber.start(handlers())).toThrow()
  })

  it('uses the standard name when present, else the prefixed one', () => {
    class Standard {}
    expect(recognitionConstructor({ SpeechRecognition: Standard, webkitSpeechRecognition: FakeRecognition })).toBe(Standard)
    expect(recognitionConstructor(scope())).toBe(FakeRecognition)
  })

  it('listens continuously with interim results, in English', () => {
    webSpeechTranscriber(scope()).start(handlers())
    const recognition = FakeRecognition.last!
    expect(recognition).toMatchObject({ continuous: true, interimResults: true, maxAlternatives: 1, lang: 'en-GB' })
    expect(recognition.start).toHaveBeenCalledTimes(1)
    expect(recognitionLanguage('fr-FR')).toBe('en-US')
    expect(recognitionLanguage(undefined)).toBe('en-US')
    expect(recognitionLanguage('en')).toBe('en')
  })

  it('reports settled words and the unsettled guess separately', () => {
    const h = handlers()
    webSpeechTranscriber(scope()).start(h)
    const recognition = FakeRecognition.last!
    recognition.onstart?.()
    expect(h.onStart).toHaveBeenCalled()
    recognition.results(['okay im cutoff', true], [' four hundred eff', false])
    expect(h.onUpdate).toHaveBeenLastCalledWith({ final: 'okay im cutoff', interim: 'four hundred eff' })
    recognition.results(['okay im cutoff', true], [' four hundred effective', true])
    expect(h.onUpdate).toHaveBeenLastCalledWith({ final: 'okay im cutoff four hundred effective', interim: '' })
    recognition.onspeechstart?.()
    recognition.onspeechend?.()
    expect(h.onHearing.mock.calls).toEqual([[true], [false]])
  })

  it('maps browser errors to plain reasons, and ignores the "aborted" it reports for a drop', () => {
    const h = handlers()
    webSpeechTranscriber(scope()).start(h)
    const recognition = FakeRecognition.last!
    recognition.onerror?.({ error: 'aborted' })
    expect(h.onError).not.toHaveBeenCalled()
    recognition.onerror?.({ error: 'not-allowed' })
    expect(h.onError).toHaveBeenCalledWith('denied')
    expect(speechErrorCode('no-speech')).toBe('no-speech')
    expect(speechErrorCode('network')).toBe('network')
    expect(speechErrorCode('audio-capture')).toBe('no-microphone')
    expect(speechErrorCode('service-not-allowed')).toBe('service')
    expect(speechErrorCode('language-not-supported')).toBe('service')
    expect(speechErrorCode('bad-grammar')).toBe('unknown')
  })

  it('stop lets the service finish; abort goes silent at once', () => {
    const h = handlers()
    const session = webSpeechTranscriber(scope()).start(h)
    session.stop()
    expect(h.onEnd).toHaveBeenCalledTimes(1)

    const quiet = handlers()
    const dropped = webSpeechTranscriber(scope()).start(quiet)
    const recognition = FakeRecognition.last!
    dropped.abort()
    expect(recognition.abort).toHaveBeenCalled()
    recognition.results(['late words', true])
    recognition.onend?.()
    expect(quiet.onUpdate).not.toHaveBeenCalled()
    expect(quiet.onEnd).not.toHaveBeenCalled()
  })

  it('tells the player where audio may go, and that none is kept', () => {
    const { disclosure } = webSpeechTranscriber(scope())
    expect(disclosure).toContain('may be processed by its maker’s speech service')
    expect(disclosure).toContain('never records or keeps audio')
  })
})

describe('joining settled speech', () => {
  it('joins pieces with single spaces and drops empties', () => {
    expect(joinFinalPieces([' flop ace king queen ', '', 'all  spades'])).toBe('flop ace king queen all spades')
  })

  it('replaces a piece repeated and extended by the next (some mobile browsers report both)', () => {
    expect(joinFinalPieces(['I raise', 'I raise to seventeen', 'big blind calls'])).toBe('I raise to seventeen big blind calls')
    expect(joinFinalPieces(['he calls', 'he calls'])).toBe('he calls')
  })

  it('keeps self-corrections: a different piece is never dropped', () => {
    expect(joinFinalPieces(['turn nine clubs', 'no sorry river nine clubs', 'turn low diamond'])).toBe(
      'turn nine clubs no sorry river nine clubs turn low diamond',
    )
  })
})
