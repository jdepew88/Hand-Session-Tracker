import { describe, expect, it, vi } from 'vitest'
import { MAX_NARRATION_LENGTH } from './context'
import { response } from './fixtures/corpus'
import { corpusTable } from './fixtures/table'
import { interpretLocally, onDeviceParser } from './local'
import { NarrationUnavailableError, interpretNarration, type HandNarrationParser } from './parser'

const { context } = corpusTable()

const parserReturning = (value: unknown | (() => Promise<unknown>), kind: HandNarrationParser['kind'] = 'service'): HandNarrationParser => ({
  kind,
  description: 'test',
  parse: vi.fn(async () => (typeof value === 'function' ? (value as () => Promise<unknown>)() : value)),
})

describe('asking a parser to read a narration', () => {
  it('returns a checked interpretation', async () => {
    const result = await interpretNarration(parserReturning(response({})), { text: 'I fold.', context })
    expect(result.ok).toBe(true)
  })

  it('rejects a malformed response instead of using any of it', async () => {
    const parser = parserReturning({ ...response({}), streets: 'all of them' })
    expect(await interpretNarration(parser, { text: 'I fold.', context })).toEqual({ ok: false, reason: 'malformed' })
    expect(await interpretNarration(parserReturning('<b>prose</b>'), { text: 'I fold.', context })).toEqual({ ok: false, reason: 'malformed' })
  })

  it('reports an unreachable service, offline and oversized text without calling or losing anything', async () => {
    const failing = parserReturning(() => Promise.reject(new NarrationUnavailableError('unavailable')))
    expect(await interpretNarration(failing, { text: 'I fold.', context })).toEqual({ ok: false, reason: 'unavailable' })
    const crashing = parserReturning(() => Promise.reject(new TypeError('Failed to fetch')))
    expect(await interpretNarration(crashing, { text: 'I fold.', context })).toEqual({ ok: false, reason: 'unavailable' })

    const service = parserReturning(response({}))
    expect(await interpretNarration(service, { text: 'I fold.', context }, { online: false })).toEqual({ ok: false, reason: 'offline' })
    expect(await interpretNarration(service, { text: 'x'.repeat(MAX_NARRATION_LENGTH + 1), context })).toEqual({ ok: false, reason: 'too-long' })
    expect(await interpretNarration(service, { text: '   ', context })).toEqual({ ok: false, reason: 'empty' })
    expect(service.parse).not.toHaveBeenCalled()
  })

  it('works offline with the on-device parser', async () => {
    const result = await interpretNarration(onDeviceParser, { text: "I'm cutoff with AK. Raise 17, BB calls.", context }, { online: false })
    expect(result.ok).toBe(true)
  })
})

describe('the on-device practice parser', () => {
  it('reads the example hand into the response contract', () => {
    const result = interpretLocally(
      "I'm in the cutoff with about 400 behind. Folds to me and I raise to 17. Big blind calls. Flop ace king queen all spades. I have jack ten of hearts. He checks, I bet 10, he calls. Turn was a brick. He bets two thirds pot, I call. River nine of clubs. He bets about 1.2x pot. I jam, he tanks and calls. I show jack ten. He mucks. I win.",
      context,
    )
    expect(result.heroPositions).toEqual([{ position: 'CO', said: "I'm in the cutoff with about 400 behind" }])
    expect(result.people).toEqual([{ id: 'p1', phrases: ['Big blind', 'He', 'he'], position: 'BB', seat: null }])
    expect(result.heroCards).toMatchObject({ said: 'jack ten of hearts' })
    expect(result.streets.map((entry) => entry.street)).toEqual(['preflop', 'flop', 'turn', 'river'])
    expect(result.streets[2]!.board).toMatchObject({ description: 'brick' })
    const river = result.streets[3]!.items
    expect(river[0]).toMatchObject({ type: 'action', actor: 'p1', action: 'bet', size: { kind: 'pot', ratio: 1.2 } })
    expect(river[2]).toMatchObject({ type: 'action', actor: 'p1', action: 'call', timing: 'tank', said: 'he tanks and calls' })
    expect(result.result).toEqual({ winners: ['hero'], said: 'I win' })
    expect(result.unplaced).toEqual(['about 400 behind'])
  })

  it('leaves who acted open when the words do not say', () => {
    const result = interpretLocally('Flop K72. Bet 50 call.', context)
    expect(result.streets[1]!.items.map((entry) => (entry.type === 'action' ? entry.actor : 'other'))).toEqual([null, null])
  })

  it('reads "checks two-thirds" as two possible readings, not one', () => {
    const result = interpretLocally('Flop K72. Big blind checks two-thirds.', context)
    expect(result.streets[1]!.items[0]).toMatchObject({ type: 'unclear', options: [{ action: 'check' }, { action: 'bet', size: { kind: 'pot', ratio: 0.67 } }] })
  })
})
