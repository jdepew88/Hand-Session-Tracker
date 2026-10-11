import { describe, expect, it } from 'vitest'
import { holeCardsText } from '../draft/text'
import { act, board, hole, person, potRatio, response, street, to } from './fixtures/corpus'
import { corpusTable } from './fixtures/table'
import { REVIEW_STATE_WORD, buildNarrationDraft, openQuestions } from './normalize'
import type { NarrationInterpretation } from './schema'

/*
 * Corpus table: nine-handed, Hero seat 5 on the button. SB 6, BB 7 (Quiet Reg, Tight Reg),
 * UTG 8 (Old Man Coffee, Tight Passive), UTG+1 9 (Mike), HJ 3 (Tom, Reg), CO 4 (Hoodie Guy).
 */

const build = (interpretation: NarrationInterpretation, answers: Record<string, string> = {}) => {
  const table = corpusTable()
  return { table, outcome: buildNarrationDraft(interpretation, table.context, table.setup, answers) }
}

const calls = (phrase: string) =>
  response({ people: [person('p1', [phrase])], streets: [street('preflop', [act('hero', 'raise', 'I raise to 15', { size: to(15) }), act('p1', 'call', `${phrase} calls`, { actorSaid: phrase })])] })

describe('who a phrase means', () => {
  it('resolves a unique alias', () => {
    const { outcome } = build(calls('sunglasses guy'))
    expect(outcome.draft.participants).toEqual([4, 5])
    expect(outcome.facts.find((fact) => fact.id === 'who:p1')).toMatchObject({ state: 'confirmed', source: 'explicit' })
  })

  it('asks when a phrase fits several players, offering exactly those', () => {
    const { outcome } = build(calls('the tight guy'))
    const question = outcome.questions.find((entry) => entry.id === 'who:p1')!
    expect(question.required).toBe(true)
    expect(question.options.map((option) => option.id)).toEqual(['7', '8', 'none'])
    expect(question.options[0]!.label).toBe('Seat 7 · Quiet Reg · BB')
    expect(outcome.draft.participants).toEqual([5])
  })

  it('keeps a phrase that matches nobody unresolved, with what waits on it listed once', () => {
    const { outcome } = build(calls('the guy in the hat'))
    expect(openQuestions(outcome).map((entry) => entry.id)).toEqual(['who:p1'])
    const who = outcome.facts.find((fact) => fact.id === 'who:p1')!
    expect(who.detail).toContain('matched nobody at the table')
    expect(who.detail).toContain('One part of the hand waits on this: “the guy in the hat calls”.')
    // Not a separate problem per action.
    expect(outcome.facts.filter((fact) => fact.state === 'clarify')).toHaveLength(1)
  })

  it('rebuilds from the answer, without asking the parser again', () => {
    const interpretation = calls('the tight guy')
    const { outcome } = build(interpretation, { 'who:p1': '8' })
    expect(openQuestions(outcome)).toEqual([])
    expect(outcome.draft.participants).toEqual([5, 8])
    expect(outcome.facts.find((fact) => fact.id === 'who:p1')).toMatchObject({ state: 'confirmed', detail: 'You chose this.' })
    // An answer that is not one of the options is ignored.
    expect(openQuestions(build(interpretation, { 'who:p1': '3' }).outcome).map((entry) => entry.id)).toEqual(['who:p1'])
  })

  it('drops a player the narrator leaves out, along with their actions', () => {
    const { outcome } = build(calls('the guy in the hat'), { 'who:p1': 'none' })
    expect(outcome.draft.participants).toEqual([5])
    expect(outcome.facts.find((fact) => fact.id === 'preflop:1')).toBeUndefined()
    expect(outcome.facts.find((fact) => fact.id === 'who:p1')!.detail).toContain('Left out with them: “the guy in the hat calls”.')
  })

  it('flags a label and a stated position that point to different players', () => {
    const interpretation = response({
      heroPositions: [{ position: 'BTN', said: 'on the button' }],
      people: [person('p1', ['Old man coffee'], 'CO')],
      streets: [street('preflop', [act('p1', 'raise', 'Old man coffee raises from the cutoff', { actorSaid: 'Old man coffee' })])],
    })
    const { outcome } = build(interpretation)
    // Hero's button fixes the hand's button at seat 5, where the cutoff is seat 4, not Old Man Coffee (seat 8).
    const question = outcome.questions.find((entry) => entry.id === 'who:p1')!
    expect(question.options.map((option) => option.id)).toEqual(['4', '8', 'none'])
    expect(outcome.facts.find((fact) => fact.id === 'who:p1')).toMatchObject({ state: 'clarify', source: 'conflict' })
  })
})

describe('pronouns', () => {
  it('heads-up, "he" is the one opponent', () => {
    const { outcome } = build(
      response({
        people: [person('p1', ['big blind', 'he'], 'BB')],
        streets: [street('preflop', [act('hero', 'raise', 'I raise to 15', { size: to(15) }), act('p1', 'call', 'he calls', { actorSaid: 'he' })])],
      }),
    )
    expect(outcome.facts.find((fact) => fact.id === 'preflop:1')).toMatchObject({ state: 'confirmed' })
  })

  it('multiway, a "he" the parser linked is shown as interpreted, never as fact', () => {
    const { outcome } = build(
      response({
        people: [person('p1', ['Old man coffee']), person('p2', ['hoodie guy', 'he'])],
        streets: [
          street('preflop', [
            act('p1', 'call', 'Old man coffee limps', { shorthand: true, actorSaid: 'Old man coffee' }),
            act('p2', 'raise', 'hoodie guy raises to 20', { size: to(20), actorSaid: 'hoodie guy' }),
            act('hero', 'call', 'I call'),
            act('p1', 'call', 'Old man coffee calls', { actorSaid: 'Old man coffee' }),
          ]),
          street('flop', [act('p1', 'check', 'Old man coffee checks', { actorSaid: 'Old man coffee' }), act('p2', 'bet', 'he bets', { actorSaid: 'he' })]),
        ],
      }),
    )
    expect(outcome.facts.find((fact) => fact.id === 'flop:1')).toMatchObject({ state: 'interpreted' })
    expect(outcome.facts.find((fact) => fact.id === 'flop:1')!.detail).toContain('“he” taken to be CO (Hoodie Guy)')
  })

  it('multiway, an unclear "he" becomes a question listing who could have acted', () => {
    const { outcome } = build(
      response({
        people: [person('p1', ['Old man coffee']), person('p2', ['hoodie guy'])],
        streets: [
          street('preflop', [
            act('p1', 'call', 'limps', { actorSaid: 'Old man coffee' }),
            act('p2', 'raise', 'raises to 20', { size: to(20), actorSaid: 'hoodie guy' }),
            act('hero', 'call', 'I call'),
            act('p1', 'call', 'calls', { actorSaid: 'Old man coffee' }),
          ]),
          street('flop', [act(null, 'bet', 'He bets', { actorSaid: 'He' })]),
        ],
      }),
    )
    const question = outcome.questions.find((entry) => entry.id === 'actor:flop:0')!
    expect(question.required).toBe(true)
    // Postflop from the button: UTG (8), CO (4), then Hero.
    expect(question.options.map((option) => option.id)).toEqual(['8', '4', '5', 'skip'])
  })
})

describe('cards, boards and sizes survive as said', () => {
  it('keeps a rank-only hand and a shown hand without inventing suits', () => {
    const { outcome } = build(
      response({
        people: [person('p1', ['BB', 'he'], 'BB')],
        heroCards: hole('Q ?', 'a queen and something'),
        streets: [street('preflop', [act('hero', 'raise', 'raise', { size: to(15) }), act('p1', 'call', 'BB calls')])],
        showdown: [{ who: 'p1', status: 'shown', cards: { cards: [{ rank: 'K', suit: 'h' }, { rank: 'K', suit: 'd' }], suited: null, said: 'he shows kings' }, said: 'he shows kings' }],
      }),
    )
    expect(holeCardsText(outcome.draft.hero)).toBe('Q? ?')
    expect(outcome.facts.find((fact) => fact.id === 'hero-cards')).toMatchObject({ state: 'interpreted' })
    // "kings" names no suits: the parser's K♥ K♦ is not kept.
    expect(holeCardsText(outcome.draft.showdown.find((entry) => entry.seat === 7)!.cards)).toBe('KK')
  })

  it('an unknown turn offers "Enter card", which opens the recorder there', () => {
    const interpretation = response({
      people: [person('p1', ['BB'], 'BB')],
      streets: [street('preflop', [act('hero', 'raise', 'raise', { size: to(15) }), act('p1', 'call', 'BB calls')]), street('flop', []), street('turn', [], board('?', 'turn was a brick', null, null, 'brick'))],
    })
    const { outcome } = build(interpretation)
    expect(outcome.questions.find((entry) => entry.id === 'card:turn')).toMatchObject({ required: false })
    expect(outcome.editAt).toBeNull()
    expect(build(interpretation, { 'card:turn': 'enter' }).outcome.editAt).toBe('turn')
  })

  it('never turns a pot fraction into dollars on its own', () => {
    const interpretation = response({
      heroPositions: [{ position: 'BTN', said: 'button' }],
      people: [person('p1', ['cutoff', 'he'], 'CO')],
      streets: [
        street('preflop', [act('p1', 'raise', 'opens to 15', { size: to(15), shorthand: true }), act('hero', 'call', 'I call')]),
        street('flop', [act('p1', 'bet', 'he bets two thirds', { size: potRatio(0.67), actorSaid: 'he' })], board('K 7 2', 'K72')),
      ],
    })
    const { outcome } = build(interpretation)
    const bet = outcome.draft.streets.find((entry) => entry.street === 'flop')!.actions[0]!
    expect(bet.amount).toBeNull()
    const fact = outcome.facts.find((entry) => entry.id === 'flop:0')!
    expect(fact).toMatchObject({ state: 'interpreted', text: 'CO (Hoodie Guy) bets 2/3 pot' })
    expect(`${REVIEW_STATE_WORD[fact.state]}: ${fact.spoken}`).toBe('Interpreted: Cutoff, Hoodie Guy, bets two-thirds pot.')
    expect(outcome.questions.find((entry) => entry.id === 'estimate:flop:0')!.question).toBe('Use $25 for “2/3 pot”?')
  })

  it('marks an approximate amount as interpreted', () => {
    const { outcome } = build(
      response({
        people: [person('p1', ['BB'], 'BB')],
        streets: [street('preflop', [act('hero', 'raise', 'I raise to about 20', { size: to(20, true) }), act('p1', 'call', 'BB calls')])],
      }),
    )
    expect(outcome.facts.find((fact) => fact.id === 'preflop:0')).toMatchObject({ state: 'interpreted', text: 'Hero raises to about $20' })
  })
})

describe('the table is context, never changed', () => {
  it('is deterministic and leaves the table setup alone', () => {
    const interpretation = response({
      heroPositions: [{ position: 'CO', said: 'I was cutoff' }],
      people: [person('p1', ['BB'], 'BB')],
      streets: [street('preflop', [act('hero', 'raise', 'raise', { size: to(15) }), act('p1', 'call', 'BB calls')])],
    })
    const table = corpusTable()
    const before = JSON.stringify(table.setup)
    const first = buildNarrationDraft(interpretation, table.context, table.setup)
    const second = buildNarrationDraft(interpretation, table.context, table.setup)
    expect(second).toEqual(first)
    expect(JSON.stringify(table.setup)).toBe(before)
    expect(first.setup.buttonSeat).toBe(6)
    expect(first.facts.find((fact) => fact.id === 'button')!.detail).toContain('The table has the button on seat 5 now.')
  })
})
