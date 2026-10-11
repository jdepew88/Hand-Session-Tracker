import type { NarrationContext } from './context'
import { MAX_NARRATION_LENGTH } from './context'
import { InterpretationError, readInterpretation, type NarrationInterpretation } from './schema'

/**
 * The boundary between SessionTracker and whatever reads a narration.
 *
 * A parser takes the narration and the minimum table context and returns
 * an UNTRUSTED value. Nothing else in the app knows which parser it is: the
 * same checks run on whatever comes back, and the same deterministic
 * normaliser turns it into a draft. Swapping the model, the provider or the
 * on-device practice parser changes nothing downstream.
 */

export interface NarrationRequest {
  text: string
  context: NarrationContext
}

export interface HandNarrationParser {
  /** "on-device" never sends anything anywhere; "service" sends the request to SessionTracker's server. */
  readonly kind: 'on-device' | 'service'
  /** Shown beside the input so the player knows where the text goes. */
  readonly description: string
  parse(request: NarrationRequest, signal?: AbortSignal): Promise<unknown>
}

/** The parser could not be reached or declined the request. The narration is never lost. */
export class NarrationUnavailableError extends Error {
  constructor(
    readonly reason: 'offline' | 'unavailable' | 'too-long',
    message = 'The parser is not available.',
  ) {
    super(message)
    this.name = 'NarrationUnavailableError'
  }
}

export type NarrationParseResult =
  | { ok: true; interpretation: NarrationInterpretation }
  | { ok: false; reason: 'empty' | 'too-long' | 'offline' | 'unavailable' | 'malformed' }

/** Plain-language reasons, for the screen. */
export const PARSE_FAILURE_TEXT: Record<Exclude<NarrationParseResult, { ok: true }>['reason'], string> = {
  empty: 'Describe the hand first.',
  'too-long': `That description is too long. Keep it under ${MAX_NARRATION_LENGTH.toLocaleString('en-US')} characters.`,
  offline: 'You appear to be offline.',
  unavailable: 'The service did not respond.',
  malformed: 'The service sent back something that could not be used.',
}

/**
 * Ask a parser to read a narration, and check what comes back. Never
 * throws: every failure is a reason the screen can show while keeping the
 * player's text.
 */
export async function interpretNarration(
  parser: HandNarrationParser,
  request: NarrationRequest,
  options: { signal?: AbortSignal; online?: boolean } = {},
): Promise<NarrationParseResult> {
  const text = request.text.trim()
  if (text === '') return { ok: false, reason: 'empty' }
  if (text.length > MAX_NARRATION_LENGTH) return { ok: false, reason: 'too-long' }
  if (parser.kind === 'service' && options.online === false) return { ok: false, reason: 'offline' }
  let raw: unknown
  try {
    raw = await parser.parse({ text, context: request.context }, options.signal)
  } catch (error) {
    if (error instanceof NarrationUnavailableError) return { ok: false, reason: error.reason }
    if (error instanceof InterpretationError) return { ok: false, reason: 'malformed' }
    return { ok: false, reason: 'unavailable' }
  }
  try {
    return { ok: true, interpretation: readInterpretation(raw) }
  } catch {
    return { ok: false, reason: 'malformed' }
  }
}
