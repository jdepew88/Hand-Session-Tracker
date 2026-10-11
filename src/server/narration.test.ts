import { describe, expect, it, vi } from 'vitest'
import { response, act, person, street, to } from '../domain/poker/narration/fixtures/corpus'
import { SECRET_NOTE, corpusTable } from '../domain/poker/narration/fixtures/table'
import { MAX_REQUEST_BYTES, handleNarrationRequest, readNarrationRequest } from './narration'

/** The narration endpoint, against a fake AI provider. No network, no key. */

const ORIGIN = 'https://sessiontracker.pages.dev'
const { context } = corpusTable()
const KEY = 'test-key-not-real'

function request(body: unknown, init: { method?: string; origin?: string | null; type?: string; raw?: string } = {}) {
  const headers = new Headers({ 'Content-Type': init.type ?? 'application/json' })
  if (init.origin !== null) headers.set('Origin', init.origin ?? ORIGIN)
  return new Request(`${ORIGIN}/api/narration`, {
    method: init.method ?? 'POST',
    headers,
    ...(init.method === 'GET' ? {} : { body: init.raw ?? JSON.stringify(body) }),
  })
}

const goodInterpretation = response({
  people: [person('p1', ['BB'], 'BB')],
  streets: [street('preflop', [act('hero', 'raise', 'raise 17', { size: to(17) }), act('p1', 'call', 'BB calls')])],
})

const provider = (status: number, body: unknown) =>
  vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }))

const toolReply = (input: unknown) => ({ content: [{ type: 'tool_use', name: 'record_hand_narration', input }] })

const body = { text: "I'm cutoff with AK. Raise 17, BB calls.", context }

describe('POST /api/narration', () => {
  it('turns a narration into a checked interpretation', async () => {
    const fetchSpy = provider(200, toolReply(goodInterpretation))
    const res = await handleNarrationRequest(request(body), { ANTHROPIC_API_KEY: KEY }, fetchSpy)
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect((await res.json()).interpretation).toEqual(goodInterpretation)
  })

  it('keeps the key in the provider request header only, and sends no notes', async () => {
    const fetchSpy = provider(200, toolReply(goodInterpretation))
    await handleNarrationRequest(request(body), { ANTHROPIC_API_KEY: KEY }, fetchSpy)
    const [url, init] = fetchSpy.mock.calls[0]!
    expect(String(url)).toBe('https://api.anthropic.com/v1/messages')
    expect((init!.headers as Record<string, string>)['x-api-key']).toBe(KEY)
    const sent = init!.body as string
    expect(sent).not.toContain(KEY)
    expect(sent).not.toContain(SECRET_NOTE)
    expect(sent).toContain('Hoodie Guy')
    const payload = JSON.parse(sent)
    expect(payload.tool_choice).toEqual({ type: 'tool', name: 'record_hand_narration' })
    expect(payload.messages[0].content).toContain("I'm cutoff with AK")
  })

  it('answers 503 without a key, and never calls the provider', async () => {
    const fetchSpy = provider(200, toolReply(goodInterpretation))
    const res = await handleNarrationRequest(request(body), {}, fetchSpy)
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'not-configured' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('rejects other methods, other origins, other content types', async () => {
    const env = { ANTHROPIC_API_KEY: KEY }
    const fetchSpy = provider(200, toolReply(goodInterpretation))
    expect((await handleNarrationRequest(request(null, { method: 'GET' }), env, fetchSpy)).status).toBe(405)
    expect((await handleNarrationRequest(request(body, { origin: 'https://evil.example' }), env, fetchSpy)).status).toBe(403)
    expect((await handleNarrationRequest(request(body, { type: 'text/plain' }), env, fetchSpy)).status).toBe(415)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('limits the request size before reading it', async () => {
    const fetchSpy = provider(200, toolReply(goodInterpretation))
    const huge = JSON.stringify({ text: 'a'.repeat(MAX_REQUEST_BYTES), context })
    const res = await handleNarrationRequest(request(null, { raw: huge }), { ANTHROPIC_API_KEY: KEY }, fetchSpy)
    expect(res.status).toBe(413)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('rejects a body that is not exactly a narration and a valid context', async () => {
    const env = { ANTHROPIC_API_KEY: KEY }
    const fetchSpy = provider(200, toolReply(goodInterpretation))
    for (const bad of [{ text: '' , context }, { text: 'x', context, notes: SECRET_NOTE }, { text: 'x' }, { text: 'x', context: { ...context, seats: [] } }]) {
      expect((await handleNarrationRequest(request(bad), env, fetchSpy)).status).toBe(400)
    }
    expect((await handleNarrationRequest(request(null, { raw: '{not json' }), env, fetchSpy)).status).toBe(400)
    expect(readNarrationRequest(body)).not.toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('refuses a malformed model response rather than passing it on', async () => {
    const env = { ANTHROPIC_API_KEY: KEY }
    const cases = [
      provider(200, toolReply({ ...goodInterpretation, version: 9 })),
      provider(200, toolReply({ ...goodInterpretation, html: '<script>alert(1)</script>' })),
      provider(200, { content: [{ type: 'text', text: 'Sure! Here is the hand…' }] }),
      provider(200, 'not json at all'),
    ]
    for (const fetchSpy of cases) {
      const res = await handleNarrationRequest(request(body), env, fetchSpy)
      expect(res.status).toBe(502)
      expect(await res.json()).toEqual({ error: 'malformed' })
    }
  })

  it('reports a provider failure without leaking its details', async () => {
    const env = { ANTHROPIC_API_KEY: KEY }
    const failing = provider(500, { error: { message: `invalid x-api-key ${KEY}` } })
    const res = await handleNarrationRequest(request(body), env, failing)
    expect(res.status).toBe(502)
    expect(await res.text()).toBe('{"error":"provider"}')
    const unreachable = vi.fn(async () => {
      throw new TypeError('network down')
    })
    expect((await handleNarrationRequest(request(body), env, unreachable)).status).toBe(502)
  })
})
