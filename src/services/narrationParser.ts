import { onDeviceParser } from '../domain/poker/narration/local'
import { NarrationUnavailableError, type HandNarrationParser } from '../domain/poker/narration/parser'
import { InterpretationError } from '../domain/poker/narration/schema'

/**
 * Which parser reads hand narrations in this build.
 *
 * By default it is the on-device practice parser: nothing leaves the
 * browser. A build made with `VITE_NARRATION_PARSER=service` sends the
 * narration to SessionTracker's own endpoint (`/api/narration`, same
 * origin), which holds the AI provider key server-side. The setting is not
 * a secret; the key never comes near the browser.
 */

export const NARRATION_ENDPOINT = '/api/narration'
const MAX_RESPONSE_CHARS = 128 * 1024

export const SERVICE_NOTICE = 'Your hand description will be sent to the AI service to turn it into a draft. Review everything before saving.'

export function serviceParser(fetchImpl: typeof fetch = (input, init) => fetch(input, init)): HandNarrationParser {
  return {
    kind: 'service',
    description: SERVICE_NOTICE,
    async parse(request, signal) {
      let response: Response
      try {
        response = await fetchImpl(NARRATION_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ text: request.text, context: request.context }),
          ...(signal ? { signal } : {}),
        })
      } catch {
        throw new NarrationUnavailableError('unavailable')
      }
      if (response.status === 413) throw new NarrationUnavailableError('too-long')
      if (!response.ok) throw new NarrationUnavailableError('unavailable')
      const text = await response.text()
      if (text.length > MAX_RESPONSE_CHARS) throw new NarrationUnavailableError('unavailable')
      let body: { interpretation?: unknown }
      try {
        body = JSON.parse(text) as { interpretation?: unknown }
      } catch {
        throw new InterpretationError(['The service did not answer with JSON.'])
      }
      // Untrusted: checked by `interpretNarration` before anything uses it.
      return body?.interpretation
    },
  }
}

export function activeNarrationParser(): HandNarrationParser {
  return import.meta.env.VITE_NARRATION_PARSER === 'service' ? serviceParser() : onDeviceParser
}
