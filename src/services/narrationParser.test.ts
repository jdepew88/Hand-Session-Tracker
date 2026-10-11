import { describe, expect, it, vi } from 'vitest'
import { response } from '../domain/poker/narration/fixtures/corpus'
import { SECRET_NOTE, corpusTable } from '../domain/poker/narration/fixtures/table'
import { interpretNarration } from '../domain/poker/narration/parser'
import { NARRATION_ENDPOINT, serviceParser } from './narrationParser'

const { context } = corpusTable()

describe('the service parser', () => {
  it('sends only the narration and the context, to the same-origin endpoint', async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ interpretation: response({}) }), { status: 200 }))
    const result = await interpretNarration(serviceParser(fetchSpy), { text: 'I fold.', context })
    expect(result.ok).toBe(true)
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(NARRATION_ENDPOINT)
    expect(init).toMatchObject({ method: 'POST', credentials: 'same-origin' })
    const body = JSON.parse(init.body as string)
    expect(Object.keys(body).sort()).toEqual(['context', 'text'])
    expect(init.body).not.toContain(SECRET_NOTE)
    expect(JSON.stringify(init.headers)).not.toMatch(/key|authorization/i)
  })

  it('treats errors, refusals and junk from the service as failures', async () => {
    const answer = (status: number, body: string) => serviceParser(async () => new Response(body, { status }))
    expect(await interpretNarration(answer(503, '{"error":"not-configured"}'), { text: 'x', context })).toEqual({ ok: false, reason: 'unavailable' })
    expect(await interpretNarration(answer(413, '{}'), { text: 'x', context })).toEqual({ ok: false, reason: 'too-long' })
    expect(await interpretNarration(answer(200, 'not json'), { text: 'x', context })).toEqual({ ok: false, reason: 'malformed' })
    expect(await interpretNarration(answer(200, '{"interpretation":{"version":1}}'), { text: 'x', context })).toEqual({ ok: false, reason: 'malformed' })
    const offline = serviceParser(async () => {
      throw new TypeError('Failed to fetch')
    })
    expect(await interpretNarration(offline, { text: 'x', context })).toEqual({ ok: false, reason: 'unavailable' })
  })
})
