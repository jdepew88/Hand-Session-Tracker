import { describe, expect, it } from 'vitest'
import { act, board, card, hole, person, response, street, to } from '../../src/domain/poker/narration/fixtures/corpus'
import { corpusTable } from '../../src/domain/poker/narration/fixtures/table'
import { interpretLocally } from '../../src/domain/poker/narration/local'
import { readInterpretation } from '../../src/domain/poker/narration/schema'
import { EVAL_CASES } from './cases'
import { numbersIn, positionsIn, ranksIn, scoreCase, seatsIn, suitsIn } from './score'

/** The scorer itself, with hand-made responses. Deterministic: no provider. */

const caseOf = (id: string) => EVAL_CASES.find((entry) => entry.id === id)!

describe('what the narration supports', () => {
  it('reads amounts however they are said', () => {
    const numbers = numbersIn('i make it sixty five, he bets one twenty, a hundred, 1.25x, 2k and 420')
    for (const value of [65, 120, 100, 1.25, 2000, 420]) expect(numbers.has(value)).toBe(true)
    expect(numbers.has(300)).toBe(false)
  })

  it('reads ranks, suits, positions and seats from words and shorthand', () => {
    expect([...ranksIn('Flop T82cc, I have AKss')].sort()).toEqual(['2', '8', 'A', 'K', 'T'])
    expect([...suitsIn('T82cc and AKss')].sort()).toEqual(['c', 's'])
    expect([...suitsIn('red tens')].sort()).toEqual(['d', 'h'])
    expect(suitsIn('As I said, ace king').size).toBe(1)
    expect(suitsIn('ace king off').size).toBe(0)
    expect([...positionsIn('UTG plus one opens, I call on the button')].sort()).toEqual(['BTN', 'UTG', 'UTG+1'])
    expect(positionsIn('old man coffee limps').has('CO')).toBe(false)
    expect([...seatsIn('Seat four opens, seat 9 calls')].sort()).toEqual([4, 9])
  })
})

describe('scoring a response', () => {
  it('a faithful response is fully correct', () => {
    const interpretation = response({
      heroPositions: [{ position: 'BTN', said: 'from the button' }],
      people: [person('p1', ['UTG', 'he'], 'UTG')],
      heroCards: { cards: [card('Ah'), card('Kh')], suited: true, said: 'AhKh' },
      streets: [
        street('preflop', [
          act('p1', 'raise', 'UTG opens 15', { size: to(15), shorthand: true, actorSaid: 'UTG' }),
          act('hero', 'raise', 'I 3-bet to 50', { size: to(50) }),
          act('p1', 'call', 'he calls', { actorSaid: 'he' }),
        ]),
        street(
          'flop',
          [act('p1', 'check', 'He checks', { actorSaid: 'He' }), act('hero', 'bet', 'I bet 40', { size: to(40) }), act('p1', 'fold', 'he folds', { actorSaid: 'he' })],
          board('Kd 7c 2h', 'Kd 7c 2h'),
        ),
      ],
    })
    const score = scoreCase(caseOf('e18'), interpretation)
    expect(score.problems).toEqual([])
    expect(score.inventions).toEqual([])
    expect(score.verdict).toBe('correct')
  })

  it('records invented suits and amounts; the hand keeps only the amount', () => {
    const interpretation = response({
      heroPositions: [{ position: 'SB', said: 'in the small blind' }],
      people: [person('p1', ['Button', 'he'], 'BTN')],
      // "Ace king off" names no suits.
      heroCards: { cards: [card('As'), card('Kd')], suited: false, said: 'Ace king off' },
      streets: [
        street('preflop', [
          act('p1', 'raise', 'Button opens to 15', { size: to(15), shorthand: true, actorSaid: 'Button' }),
          act('hero', 'raise', 'I 3-bet to 60', { size: to(60) }),
          act('p1', 'call', 'he calls', { actorSaid: 'he' }),
        ]),
        // $55 was never said.
        street('flop', [act('hero', 'bet', 'I bet 45', { size: to(55) }), act('p1', 'fold', 'he folds', { actorSaid: 'he' })], board('A 8 4', 'A 8 4 two diamonds', 'two-tone', 'd')),
      ],
    })
    const score = scoreCase(caseOf('e22'), interpretation)
    expect(score.inventions).toEqual(['suit s in Hero\'s cards', 'amount $55 (flop: I bet 45)'])
    // The deterministic layer re-reads "Ace king off" and drops the suit; the amount gets through.
    expect(score.draftInventions).toEqual(['amount $55 on the flop'])
    expect(score.checks.heroCards).toBe(true)
    expect(score.verdict).toBe('wrong')
  })

  it('an ambiguous reference asked about is acceptable with clarification; one silently resolved is not', () => {
    const asked = response({
      people: [person('p1', ['The reg'])],
      streets: [street('preflop', [act('p1', 'raise', 'The reg raises', { actorSaid: 'The reg' }), act('hero', 'call', 'I call')])],
    })
    expect(scoreCase(caseOf('e07'), asked)).toMatchObject({ verdict: 'clarified', asked: ['who'], inventions: [] })

    const guessed = response({
      people: [person('p1', ['The reg'], null, 3)],
      streets: [street('preflop', [act('p1', 'raise', 'The reg raises', { actorSaid: 'The reg' }), act('hero', 'call', 'I call')])],
    })
    const score = scoreCase(caseOf('e07'), guessed)
    expect(score.inventions).toEqual(['seat 3 for The reg'])
    expect(score.overInterpretations).toEqual(['resolved itself what needed a who question'])
    expect(score.verdict).toBe('wrong')
  })

  it('a computed amount is over-interpretation, not invention', () => {
    const interpretation = response({
      heroPositions: [{ position: 'BTN', said: 'on the button' }],
      people: [person('p1', ['Mike', 'he'])],
      streets: [
        street('preflop', [
          act('p1', 'raise', 'Mike opens to 15', { size: to(15), shorthand: true, actorSaid: 'Mike' }),
          act('hero', 'raise', 'I raise about three times his bet', { size: to(45, true) }),
          act('p1', 'call', 'he calls', { actorSaid: 'he' }),
        ]),
      ],
    })
    const score = scoreCase(caseOf('e11'), interpretation)
    expect(score.inventions).toEqual([])
    expect(score.overInterpretations).toEqual(['computed $45 (preflop: I raise about three times his bet)'])
    expect(score.verdict).toBe('correct')
  })

  it('a failed parse is a failure, not a crash', () => {
    expect(scoreCase(caseOf('e01'), null, '502 malformed')).toMatchObject({ verdict: 'failed', failure: '502 malformed' })
  })

  it('every case scores whatever a parser returns without throwing (practice parser as a stand-in)', () => {
    const table = corpusTable()
    for (const entry of EVAL_CASES) {
      const interpretation = readInterpretation(JSON.parse(JSON.stringify(interpretLocally(entry.text, table.context))))
      expect(() => scoreCase(entry, interpretation)).not.toThrow()
    }
  })

  it('the corpus is big and varied enough', () => {
    expect(EVAL_CASES.length).toBeGreaterThanOrEqual(50)
    expect(new Set(EVAL_CASES.map((entry) => entry.id)).size).toBe(EVAL_CASES.length)
    const kinds = new Set(EVAL_CASES.flatMap((entry) => entry.kinds))
    for (const kind of ['short', 'rambling', 'self-correction', 'pronoun', 'incomplete', 'ambiguous', 'contradictory', 'pot-relative', 'stack', 'showdown', 'card-shorthand', 'board-shorthand', 'player-ref', 'noisy', 'voice']) {
      expect(kinds.has(kind as never), kind).toBe(true)
    }
  })
})

void hole
