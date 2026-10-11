import { describe, expect, it } from 'vitest'
import { flowFor } from '../draft/flow'
import { boardText, holeCardsText, streetActionWords } from '../draft/text'
import type { Street } from '../models'
import { CORPUS } from './fixtures/corpus'
import { corpusTable } from './fixtures/table'
import { interpretLocally } from './local'
import { buildNarrationDraft, openQuestions } from './normalize'
import { readInterpretation } from './schema'

/**
 * The narration corpus, end to end through the deterministic layer: each
 * model response is checked by the strict reader (as if it had just arrived
 * from the network), normalised against the corpus table, and compared with
 * what the hand must say.
 */

const roundTrip = <T>(value: T): unknown => JSON.parse(JSON.stringify(value))

describe('narration corpus', () => {
  it.each(CORPUS.map((entry) => [entry.id, entry] as const))('%s', (_id, entry) => {
    const table = corpusTable(entry.table)
    const interpretation = readInterpretation(roundTrip(entry.response))
    const outcome = buildNarrationDraft(interpretation, table.context, table.setup, entry.answers ?? {})
    const { expect: want } = entry
    const fact = (id: string) => outcome.facts.find((item) => item.id === id)

    if (want.button !== undefined) expect(outcome.setup.buttonSeat).toBe(want.button)
    if (want.participants) expect([...outcome.draft.participants].sort((a, b) => a - b)).toEqual(want.participants)
    if (want.heroCards) expect(holeCardsText(outcome.draft.hero)).toBe(want.heroCards)
    for (const [street, words] of Object.entries(want.boards ?? {})) {
      expect(boardText(outcome.draft.streets.find((item) => item.street === street)!)).toBe(words)
    }
    for (const [street, words] of Object.entries(want.actions ?? {})) {
      const flow = flowFor(outcome.setup, outcome.draft, street as Street)
      expect(streetActionWords(outcome.setup, flow).map((word) => word.short)).toEqual(words)
    }
    if (want.showdown) {
      expect(Object.fromEntries(outcome.draft.showdown.filter((item) => item.seat !== outcome.setup.heroSeat).map((item) => [item.seat, item.status]))).toEqual(
        want.showdown,
      )
    }
    if (want.winners !== undefined) expect(outcome.draft.winners).toEqual(want.winners)
    if (want.pot !== undefined) expect(outcome.draft.pot).toBe(want.pot)
    expect(openQuestions(outcome).map((question) => question.id)).toEqual(want.open ?? [])
    for (const id of want.optional ?? []) expect(outcome.questions.find((question) => question.id === id)?.required).toBe(false)
    for (const [id, state] of Object.entries(want.states ?? {})) expect(fact(id)?.state, `fact ${id}`).toBe(state)
    for (const note of want.notes ?? []) expect(outcome.notes).toContain(note)
    expect(outcome.errors).toHaveLength(want.errors ?? 0)

    // Never: an opponent's cards that were not described.
    for (const entry of outcome.draft.showdown) if (entry.status !== 'shown') expect(entry.cards).toBeNull()
    // Never: the table's own setup changed.
    expect(table.setup.buttonSeat).toBe(5)
  })

  it('every corpus narration also goes through the on-device parser without a malformed response', () => {
    for (const entry of CORPUS) {
      const table = corpusTable(entry.table)
      const raw = interpretLocally(entry.text, table.context)
      const interpretation = readInterpretation(roundTrip(raw))
      expect(() => buildNarrationDraft(interpretation, table.context, table.setup)).not.toThrow()
    }
  })
})
