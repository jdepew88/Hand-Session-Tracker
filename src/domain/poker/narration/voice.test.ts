import { describe, expect, it } from 'vitest'
import { appendTranscript } from '../../../services/speech/recorder'
import { joinFinalPieces } from '../../../services/speech/transcriber'
import { VOICE_TRANSCRIPTS } from './fixtures/voice'
import { corpusTable } from './fixtures/table'
import { interpretLocally } from './local'
import { buildNarrationDraft } from './normalize'
import { readInterpretation } from './schema'

/**
 * Voice transcripts reach the narration parser exactly as heard: the
 * speech layer adds no punctuation and corrects no poker words. Through the
 * on-device practice parser they always make a valid (if partial) reading;
 * reading them well is the AI parser's job, measured by the live
 * evaluation (eval/narration, kind "voice").
 */

describe('voice-style transcripts', () => {
  it.each(VOICE_TRANSCRIPTS.map((entry) => [entry.id, entry] as const))('%s passes through the speech layer untouched', (_id, entry) => {
    expect(appendTranscript('', joinFinalPieces([entry.text])).text).toBe(entry.text)
    expect(entry.text).not.toMatch(/[.,;!?]/)
  })

  it.each(VOICE_TRANSCRIPTS.map((entry) => [entry.id, entry] as const))('%s makes a valid draft through the practice parser', (_id, entry) => {
    const { context, setup } = corpusTable()
    const interpretation = readInterpretation(JSON.parse(JSON.stringify(interpretLocally(entry.text, context))))
    const outcome = buildNarrationDraft(interpretation, context, setup, {})
    expect(outcome.draft).toBeTruthy()
    // Never: an opponent's cards that were not said.
    for (const item of outcome.draft.showdown) if (item.status !== 'shown') expect(item.cards).toBeNull()
  })

  it('covers the spoken forms a speech service hands back', () => {
    const all = VOICE_TRANSCRIPTS.map((entry) => entry.text).join(' ')
    for (const form of ['no sorry', 'one point two x pot', 'two thirds', 'deuce', 'three bet', 'um', 'hi jack', 'cut off', 'off suit', 'suit it', 'check raise', 'jam', 'mucks']) {
      expect(all, form).toContain(form)
    }
    expect(VOICE_TRANSCRIPTS.some((entry) => entry.misheard.length > 0)).toBe(true)
  })
})
