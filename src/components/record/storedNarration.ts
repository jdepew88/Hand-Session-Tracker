import { MAX_NARRATION_LENGTH } from '../../domain/poker/narration/context'
import type { NarrationAnswers } from '../../domain/poker/narration/normalize'
import { readInterpretation, type NarrationInterpretation } from '../../domain/poker/narration/schema'
import { PREFERENCE_KEYS, readPreference, writePreference } from '../../storage/preferences'

/**
 * A hand description being turned into a draft, kept in this browser so a
 * locked phone, a failed request or a reload never loses the player's
 * words. The parser's response and the answers to its questions are kept
 * too, so clarifying never needs a second request. Everything is read back
 * as untrusted input.
 */

export interface StoredNarration {
  text: string
  interpretation: NarrationInterpretation | null
  answers: NarrationAnswers
}

const MAX_ANSWERS = 64

export function readStoredNarration(sessionId: string): StoredNarration | null {
  const raw = readPreference(PREFERENCE_KEYS.narration)
  if (!raw || raw.length > 256 * 1024) return null
  try {
    const stored = JSON.parse(raw) as Record<string, unknown>
    if (stored?.sessionId !== sessionId || typeof stored.text !== 'string') return null
    const text = stored.text.slice(0, MAX_NARRATION_LENGTH)
    let interpretation: NarrationInterpretation | null = null
    if (stored.interpretation !== null && stored.interpretation !== undefined) {
      try {
        interpretation = readInterpretation(stored.interpretation)
      } catch {
        interpretation = null
      }
    }
    const answers: Record<string, string> = {}
    if (typeof stored.answers === 'object' && stored.answers !== null && !Array.isArray(stored.answers)) {
      for (const [key, value] of Object.entries(stored.answers).slice(0, MAX_ANSWERS)) {
        if (typeof value === 'string' && key.length <= 64 && value.length <= 32) answers[key] = value
      }
    }
    return { text, interpretation, answers: interpretation ? answers : {} }
  } catch {
    return null
  }
}

export function writeStoredNarration(sessionId: string, narration: StoredNarration | null) {
  if (!narration || (narration.text.trim() === '' && !narration.interpretation)) {
    writePreference(PREFERENCE_KEYS.narration, null)
    return
  }
  writePreference(
    PREFERENCE_KEYS.narration,
    JSON.stringify({ sessionId, text: narration.text, interpretation: narration.interpretation, answers: narration.answers }),
  )
}
