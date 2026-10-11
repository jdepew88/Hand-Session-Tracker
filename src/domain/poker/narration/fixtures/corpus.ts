import type { Rank, Suit } from '../../cards'
import type { ShowdownStatus } from '../../draft/model'
import type { Street } from '../../models'
import type { NarrationAnswers, ReviewState } from '../normalize'
import {
  emptyInterpretation,
  type ActorRef,
  type NarrationAction,
  type NarrationActionKind,
  type NarrationBoard,
  type NarrationCard,
  type NarrationHole,
  type NarrationInterpretation,
  type NarrationItem,
  type NarrationPerson,
  type NarrationPosition,
  type NarrationSize,
  type NarrationStreet,
} from '../schema'

/**
 * The narration corpus: hands told the way players tell them, each with the
 * response a well-behaved model should give and what SessionTracker must
 * make of it. Test-only.
 *
 * Every case is told at `corpusTable()`: nine-handed, Hero in seat 5, the
 * table's button on Hero. Right now that makes SB 6, BB 7 (Quiet Reg),
 * UTG 8 (Old Man Coffee, "OMC"), UTG+1 9 (Mike), UTG+2 1, LJ 2, HJ 3 (Tom),
 * CO 4 (Hoodie Guy). Players tagged Reg: 3, 4 and 7.
 *
 * Responses are written by hand, not recorded from a provider. They model
 * what the prompt asks for -- including the ways a model can over-reach
 * (inventing suits) -- so the deterministic layer is tested against both.
 */

/* ------------------------------------------------------------- builders */

export function card(text: string): NarrationCard {
  const [rank, suit] = [...text]
  return { rank: rank && rank !== '?' ? (rank as Rank) : null, suit: suit && suit !== '?' ? (suit as Suit) : null }
}

const cards = (text: string) => text.split(' ').map(card)

export const hole = (text: string, said: string, suited: boolean | null = null): NarrationHole => {
  const [first, second] = cards(text)
  return { cards: [first!, second!], suited, said }
}

export const to = (dollars: number, approximate = false): NarrationSize => ({ kind: 'to', dollars, approximate })
export const more = (dollars: number): NarrationSize => ({ kind: 'more', dollars, approximate: false })
export const potRatio = (ratio: number): NarrationSize => ({ kind: 'pot', ratio })

export function act(
  actor: ActorRef | null,
  action: NarrationActionKind,
  said: string,
  extra: Partial<Pick<NarrationAction, 'size' | 'shorthand' | 'timing' | 'actorSaid'>> = {},
): NarrationAction {
  return {
    type: 'action',
    actor,
    actorSaid: extra.actorSaid ?? (actor === 'hero' ? 'I' : ''),
    action,
    size: extra.size ?? null,
    said,
    shorthand: extra.shorthand ?? false,
    timing: extra.timing ?? null,
  }
}

export const board = (
  text: string,
  said: string,
  pattern: NarrationBoard['pattern'] = null,
  patternSuit: Suit | null = null,
  description: string | null = null,
): NarrationBoard => ({ cards: text === '' ? [] : cards(text), pattern, patternSuit, description, said })

export const street = (name: Street, items: NarrationItem[], boardSaid: NarrationBoard | null = null, forgotten = false): NarrationStreet => ({
  street: name,
  board: name === 'preflop' ? null : boardSaid,
  items,
  forgotten,
})

export const person = (id: string, phrases: string[], position: NarrationPosition | null = null, seat: number | null = null): NarrationPerson => ({
  id,
  phrases,
  position,
  seat,
})

export const response = (parts: Partial<NarrationInterpretation>): NarrationInterpretation => ({ ...emptyInterpretation(), ...parts })

/* ---------------------------------------------------------- expectations */

export interface CorpusExpect {
  /** The hand's button. */
  button?: number
  participants?: number[]
  /** `holeCardsText` of Hero's cards. */
  heroCards?: string
  /** `boardText` per street. */
  boards?: Partial<Record<Exclude<Street, 'preflop'>, string>>
  /** Short action words per street, e.g. "Hero raise to $17". */
  actions?: Partial<Record<Street, string[]>>
  showdown?: Record<number, ShowdownStatus>
  winners?: number[] | null
  pot?: number | null
  /** Ids of required questions still unanswered. Default: none. */
  open?: string[]
  /** Ids of optional questions offered. */
  optional?: string[]
  /** Review state of particular facts, by fact id. */
  states?: Record<string, ReviewState>
  /** Each must appear among the hand's notes. */
  notes?: string[]
  /** Draft errors. Default: none. */
  errors?: number
}

export interface CorpusCase {
  id: string
  text: string
  /** What a well-behaved model returns for `text`. */
  response: NarrationInterpretation
  answers?: NarrationAnswers
  table?: { heroSeat?: number; buttonSeat?: number }
  expect: CorpusExpect
}

/* ================================================================ cases */

export const CORPUS: CorpusCase[] = [
  {
    id: '01 cutoff AK, c-bet, fold',
    text: "I'm cutoff with AK. Raise 17, BB calls. Flop A72 rainbow. I bet 20, he folds.",
    response: response({
      heroPositions: [{ position: 'CO', said: "I'm cutoff" }],
      people: [person('p1', ['BB', 'he'], 'BB')],
      heroCards: hole('A K', 'AK'),
      streets: [
        street('preflop', [act('hero', 'raise', 'Raise 17', { size: to(17) }), act('p1', 'call', 'BB calls', { actorSaid: 'BB' })]),
        street('flop', [act('hero', 'bet', 'I bet 20', { size: to(20) }), act('p1', 'fold', 'he folds', { actorSaid: 'he' })], board('A 7 2', 'A72 rainbow', 'rainbow')),
      ],
    }),
    expect: {
      // The table has Hero on the button; "I'm cutoff" moves this hand's button to seat 6, so the BB is seat 8.
      button: 6,
      participants: [5, 8],
      heroCards: 'AK',
      boards: { flop: 'A 7 2 · rainbow' },
      actions: { preflop: ['Hero raise to $17', 'BB call'], flop: ['Hero bet $20', 'BB fold'] },
      states: { 'hero-position': 'confirmed', button: 'confirmed', 'who:p1': 'confirmed', 'flop:board': 'confirmed' },
    },
  },
  {
    id: '02 button AKs, 3-bet pot to showdown',
    text: 'Button with ace king suited, cutoff opens 20, I 3-bet 65, he calls. Ten eight two two clubs. Bet 50 call. King clubs turn. Bet 120, he raises 300, I call. Nine diamonds river. I jam, he calls, I show AK, he mucks.',
    response: response({
      heroPositions: [{ position: 'BTN', said: 'Button with ace king suited' }],
      people: [person('p1', ['cutoff', 'he'], 'CO')],
      heroCards: hole('A K', 'ace king suited', true),
      streets: [
        street('preflop', [
          act('p1', 'raise', 'cutoff opens 20', { size: to(20), shorthand: true, actorSaid: 'cutoff' }),
          act('hero', 'raise', 'I 3-bet 65', { size: to(65) }),
          act('p1', 'call', 'he calls', { actorSaid: 'he' }),
        ]),
        // "Bet 50 call" does not say who bet: the model leaves both actors open.
        street('flop', [act(null, 'bet', 'Bet 50 call', { size: to(50) }), act(null, 'call', 'Bet 50 call')], board('T 8 2', 'Ten eight two two clubs', 'two-tone', 'c')),
        street(
          'turn',
          [act('hero', 'bet', 'Bet 120', { size: to(120) }), act('p1', 'raise', 'he raises 300', { size: to(300), actorSaid: 'he' }), act('hero', 'call', 'I call')],
          board('Kc', 'King clubs turn'),
        ),
        street('river', [act('hero', 'allin', 'I jam', { shorthand: true }), act('p1', 'call', 'he calls', { actorSaid: 'he' })], board('9d', 'Nine diamonds river')),
      ],
      showdown: [
        { who: 'hero', status: 'shown', cards: hole('A K', 'AK'), said: 'I show AK' },
        { who: 'p1', status: 'mucked', cards: null, said: 'he mucks' },
      ],
    }),
    answers: { 'actor:flop:0': '5', 'actor:flop:1': '4' },
    expect: {
      button: 5,
      participants: [4, 5],
      heroCards: 'AK suited',
      boards: { flop: 'T 8 2 · two clubs', turn: 'K♣', river: '9♦' },
      actions: {
        preflop: ['CO raise to $20', 'Hero 3-bet to $65', 'CO call'],
        flop: ['Hero bet $50', 'CO call'],
        turn: ['Hero bet $120', 'CO raise to $300', 'Hero call'],
        river: ['Hero all-in', 'CO call'],
      },
      showdown: { 4: 'mucked' },
      states: { 'preflop:0': 'interpreted', 'flop:0': 'confirmed', 'river:0': 'interpreted' },
    },
  },
  {
    id: '03 multiway limped pot by name and alias',
    text: 'Old man coffee limps UTG, hoodie guy raises cutoff, I call button, OMC calls.',
    response: response({
      heroPositions: [{ position: 'BTN', said: 'I call button' }],
      people: [person('p1', ['Old man coffee', 'OMC'], 'UTG'), person('p2', ['hoodie guy'], 'CO')],
      streets: [
        street('preflop', [
          act('p1', 'call', 'Old man coffee limps UTG', { shorthand: true, actorSaid: 'Old man coffee' }),
          act('p2', 'raise', 'hoodie guy raises cutoff', { actorSaid: 'hoodie guy' }),
          act('hero', 'call', 'I call button'),
          act('p1', 'call', 'OMC calls', { actorSaid: 'OMC' }),
        ]),
      ],
    }),
    expect: {
      button: 5,
      participants: [4, 5, 8],
      actions: { preflop: ['UTG limp', 'CO raise', 'Hero call', 'UTG call'] },
      states: { 'who:p1': 'confirmed', 'who:p2': 'confirmed', 'preflop:0': 'interpreted' },
    },
  },
  {
    id: '04 checks through, brick turn, two-thirds pot',
    text: 'Flop queen jack five. Checks through. Turn brick. He bets two thirds, I call.',
    response: response({
      people: [person('p1', ['He'])],
      streets: [
        street('flop', [{ type: 'checks-through', said: 'Checks through' }], board('Q J 5', 'queen jack five')),
        street('turn', [act('p1', 'bet', 'He bets two thirds', { size: potRatio(0.67), actorSaid: 'He' }), act('hero', 'call', 'I call')], board('?', 'Turn brick', null, null, 'brick')),
      ],
    }),
    // Nothing says who "he" is: the player answers.
    answers: { 'who:p1': '7' },
    expect: {
      participants: [5, 7],
      boards: { flop: 'Q J 5' },
      actions: { preflop: [], flop: ['BB check', 'Hero check'], turn: ['BB bet', 'Hero call'] },
      states: { 'preflop:action': 'unrecorded', 'turn:board': 'unrecorded', 'turn:0': 'interpreted', 'flop:0': 'confirmed', 'who:p1': 'confirmed' },
      optional: ['card:turn'],
      notes: ['Turn: brick', 'Turn: BB (Quiet Reg) bets 2/3 pot'],
    },
  },
  {
    id: '05 river only: 1.2x pot, jam, tank call',
    text: 'River nine clubs, he bets 1.2x pot, I jam, tank call.',
    response: response({
      people: [person('p1', ['he'])],
      streets: [
        street(
          'river',
          [
            act('p1', 'bet', 'he bets 1.2x pot', { size: potRatio(1.2), actorSaid: 'he' }),
            act('hero', 'allin', 'I jam', { shorthand: true }),
            act('p1', 'call', 'tank call', { shorthand: true, timing: 'tank' }),
          ],
          board('9c', 'River nine clubs'),
        ),
      ],
    }),
    answers: { 'who:p1': '4' },
    expect: {
      participants: [4, 5],
      boards: { river: '9♣' },
      actions: { river: ['CO bet', 'Hero all-in', 'CO call'] },
      states: { 'river:0': 'interpreted', 'river:2': 'interpreted' },
      notes: ['River: CO (Hoodie Guy) bets 1.2x pot', 'River: CO (Hoodie Guy) tanked before acting'],
    },
  },
  {
    id: '06 contradiction: UTG and cutoff',
    text: 'I was UTG… folds to me in cutoff… I raise to 15, big blind calls.',
    response: response({
      heroPositions: [
        { position: 'UTG', said: 'I was UTG' },
        { position: 'CO', said: 'folds to me in cutoff' },
      ],
      people: [person('p1', ['big blind'], 'BB')],
      streets: [
        street('preflop', [
          { type: 'folds-to', target: 'hero', said: 'folds to me in cutoff' },
          act('hero', 'raise', 'I raise to 15', { size: to(15) }),
          act('p1', 'call', 'big blind calls', { actorSaid: 'big blind' }),
        ]),
      ],
      contradictions: [{ about: 'Hero is described as both UTG and the cutoff.', said: ['I was UTG', 'folds to me in cutoff'] }],
    }),
    expect: {
      open: ['hero-position'],
      states: { 'hero-position': 'clarify', 'contradiction:0': 'clarify' },
      actions: { preflop: ['Hero raise to $15', 'BB call'] },
    },
  },
  {
    id: '06b contradiction answered: cutoff',
    text: 'I was UTG… folds to me in cutoff… I raise to 15, big blind calls.',
    response: response({
      heroPositions: [
        { position: 'UTG', said: 'I was UTG' },
        { position: 'CO', said: 'folds to me in cutoff' },
      ],
      people: [person('p1', ['big blind'], 'BB')],
      streets: [
        street('preflop', [
          { type: 'folds-to', target: 'hero', said: 'folds to me in cutoff' },
          act('hero', 'raise', 'I raise to 15', { size: to(15) }),
          act('p1', 'call', 'big blind calls', { actorSaid: 'big blind' }),
        ]),
      ],
    }),
    answers: { 'hero-position': 'CO' },
    expect: { button: 6, participants: [5, 8], states: { 'hero-position': 'confirmed' } },
  },
  {
    id: '07 AK suited: exact suits stay unknown',
    text: 'AK suited',
    // An over-reaching model that invents spades. The words say no suits, so none are kept.
    response: response({ heroCards: { cards: [card('As'), card('Ks')], suited: true, said: 'AK suited' } }),
    // Nobody else is named, so the draft says who Hero played against is missing.
    expect: { heroCards: 'AK suited', states: { 'hero-cards': 'confirmed' }, errors: 1 },
  },
  {
    id: '08 T82 two clubs: suit allocation not invented',
    text: 'Flop T82 two clubs.',
    response: response({
      streets: [street('preflop', []), street('flop', [], { cards: [card('Tc'), card('8'), card('2c')], pattern: 'two-tone', patternSuit: 'c', description: null, said: 'T82 two clubs' })],
    }),
    expect: { boards: { flop: 'T 8 2 · two clubs' }, states: { 'flop:board': 'confirmed' }, errors: 1 },
  },
  {
    id: '09 opponent mucked: no cards created',
    text: 'I raise to 15 on the button, big blind calls. River I bet 50, he calls. I show red queens, opponent mucked.',
    response: response({
      heroPositions: [{ position: 'BTN', said: 'on the button' }],
      people: [person('p1', ['big blind', 'he', 'opponent'], 'BB')],
      streets: [
        street('preflop', [act('hero', 'raise', 'I raise to 15', { size: to(15) }), act('p1', 'call', 'big blind calls', { actorSaid: 'big blind' })]),
        street('river', [act('hero', 'bet', 'I bet 50', { size: to(50) }), act('p1', 'call', 'he calls', { actorSaid: 'he' })]),
      ],
      showdown: [
        { who: 'hero', status: 'shown', cards: hole('Qh Qd', 'red queens'), said: 'I show red queens' },
        { who: 'p1', status: 'mucked', cards: null, said: 'opponent mucked' },
      ],
    }),
    expect: {
      participants: [5, 7],
      heroCards: 'Q♥ Q♦',
      showdown: { 7: 'mucked' },
      actions: { preflop: ['Hero raise to $15', 'BB call'], flop: [], turn: [], river: ['Hero bet $50', 'BB call'] },
      states: { 'showdown:1': 'confirmed' },
    },
  },
  {
    id: '10 preflop not remembered: valid incomplete hand',
    text: "I don't remember preflop. Flop was K72 and I bet, he folded.",
    response: response({
      people: [person('p1', ['he'])],
      streets: [
        street('preflop', [], null, true),
        street('flop', [act('hero', 'bet', 'I bet'), act('p1', 'fold', 'he folded', { actorSaid: 'he' })], board('K 7 2', 'Flop was K72')),
      ],
    }),
    answers: { 'who:p1': '9' },
    expect: {
      participants: [5, 9],
      boards: { flop: 'K 7 2' },
      actions: { preflop: [], flop: ['Hero bet', 'UTG+1 fold'] },
      states: { 'preflop:forgotten': 'unrecorded' },
    },
  },
  {
    id: '11 hoodie guy: resolves only because the label is unique',
    text: 'Hoodie guy called.',
    response: response({ people: [person('p1', ['Hoodie guy'])], streets: [street('preflop', [act('p1', 'call', 'Hoodie guy called', { actorSaid: 'Hoodie guy' })])] }),
    expect: { participants: [4, 5], actions: { preflop: ['CO limp'] }, states: { 'who:p1': 'confirmed' } },
  },
  {
    id: '12 the reg: three players tagged Reg',
    text: 'The reg called.',
    response: response({ people: [person('p1', ['The reg'])], streets: [street('preflop', [act('p1', 'call', 'The reg called', { actorSaid: 'The reg' })])] }),
    expect: { participants: [5], open: ['who:p1'], states: { 'who:p1': 'clarify' }, errors: 1 },
  },
  {
    id: '13 seat six: a deterministic seat match',
    text: 'Seat six calls.',
    response: response({ people: [person('p1', ['Seat six'], null, 6)], streets: [street('preflop', [act('p1', 'call', 'Seat six calls', { actorSaid: 'Seat six' })])] }),
    expect: { participants: [5, 6], actions: { preflop: ['SB limp'] }, states: { 'who:p1': 'confirmed' } },
  },
  {
    id: '14 big blind: resolved against the table when the hand says nothing else',
    text: 'I raise to 15, big blind calls.',
    response: response({
      people: [person('p1', ['big blind'], 'BB')],
      streets: [street('preflop', [act('hero', 'raise', 'I raise to 15', { size: to(15) }), act('p1', 'call', 'big blind calls', { actorSaid: 'big blind' })])],
    }),
    expect: { button: 5, participants: [5, 7] },
  },
  {
    id: '14b big blind: resolved against the HAND when Hero was elsewhere',
    text: 'I was in the cutoff. I raise to 15, big blind calls.',
    response: response({
      heroPositions: [{ position: 'CO', said: 'I was in the cutoff' }],
      people: [person('p1', ['big blind'], 'BB')],
      streets: [street('preflop', [act('hero', 'raise', 'I raise to 15', { size: to(15) }), act('p1', 'call', 'big blind calls', { actorSaid: 'big blind' })])],
    }),
    // Seat 7 is the big blind at the table now; in this hand it was seat 8.
    expect: { button: 6, participants: [5, 8], states: { button: 'confirmed' } },
  },
  {
    id: '15 raise 40 more: converted because the open is known',
    text: 'Cutoff opens to 15, I raise 40 more, he calls.',
    response: response({
      people: [person('p1', ['Cutoff', 'he'], 'CO')],
      streets: [
        street('preflop', [
          act('p1', 'raise', 'Cutoff opens to 15', { size: to(15), shorthand: true, actorSaid: 'Cutoff' }),
          act('hero', 'raise', 'I raise 40 more', { size: more(40) }),
          act('p1', 'call', 'he calls', { actorSaid: 'he' }),
        ]),
      ],
    }),
    expect: { actions: { preflop: ['CO raise to $15', 'Hero 3-bet to $55', 'CO call'] }, states: { 'preflop:1': 'confirmed' } },
  },
  {
    id: '15b raise 80 more: not converted when the open is unknown',
    text: 'Cutoff opens, I raise 80 more, he calls.',
    response: response({
      people: [person('p1', ['Cutoff', 'he'], 'CO')],
      streets: [
        street('preflop', [
          act('p1', 'raise', 'Cutoff opens', { shorthand: true, actorSaid: 'Cutoff' }),
          act('hero', 'raise', 'I raise 80 more', { size: more(80) }),
          act('p1', 'call', 'he calls', { actorSaid: 'he' }),
        ]),
      ],
    }),
    expect: { actions: { preflop: ['CO raise', 'Hero 3-bet', 'CO call'] }, states: { 'preflop:1': 'confirmed', 'preflop:1:amount': 'unrecorded' }, notes: ['Preflop: Hero raises $80 more (total not known)'] },
  },
  {
    id: '16 half pot: the dollars are offered, never filled in',
    text: 'Cutoff opens to 15, I call on the button. Flop K72, he bets half pot, I call.',
    response: response({
      heroPositions: [{ position: 'BTN', said: 'on the button' }],
      people: [person('p1', ['Cutoff', 'he'], 'CO')],
      streets: [
        street('preflop', [act('p1', 'raise', 'Cutoff opens to 15', { size: to(15), shorthand: true, actorSaid: 'Cutoff' }), act('hero', 'call', 'I call on the button')]),
        street('flop', [act('p1', 'bet', 'he bets half pot', { size: potRatio(0.5), actorSaid: 'he' }), act('hero', 'call', 'I call')], board('K 7 2', 'Flop K72')),
      ],
    }),
    // Pot before the flop bet: $2 + $5 blinds, $15 + $15 = $37. Half is $18.50, offered as $19.
    expect: { actions: { flop: ['CO bet', 'Hero call'] }, optional: ['estimate:flop:0'], states: { 'flop:0': 'interpreted' } },
  },
  {
    id: '16b half pot, estimate accepted',
    text: 'Cutoff opens to 15, I call on the button. Flop K72, he bets half pot, I call.',
    response: response({
      heroPositions: [{ position: 'BTN', said: 'on the button' }],
      people: [person('p1', ['Cutoff', 'he'], 'CO')],
      streets: [
        street('preflop', [act('p1', 'raise', 'Cutoff opens to 15', { size: to(15), shorthand: true, actorSaid: 'Cutoff' }), act('hero', 'call', 'I call on the button')]),
        street('flop', [act('p1', 'bet', 'he bets half pot', { size: potRatio(0.5), actorSaid: 'he' }), act('hero', 'call', 'I call')], board('K 7 2', 'Flop K72')),
      ],
    }),
    answers: { 'estimate:flop:0': 'use' },
    expect: { actions: { flop: ['CO bet $19', 'Hero call'] }, states: { 'flop:0': 'confirmed' } },
  },
  {
    id: '17 we chop: a split pot',
    text: 'I raise to 15 on the button, Mike calls. We chop.',
    response: response({
      heroPositions: [{ position: 'BTN', said: 'on the button' }],
      people: [person('p1', ['Mike'])],
      streets: [street('preflop', [act('hero', 'raise', 'I raise to 15', { size: to(15) }), act('p1', 'call', 'Mike calls', { actorSaid: 'Mike' })])],
      result: { winners: ['hero', 'p1'], said: 'We chop' },
    }),
    expect: { participants: [5, 9], winners: [5, 9], states: { result: 'confirmed' } },
  },
  {
    id: '18 no showdown',
    text: 'I raise to 15 on the button, big blind folds.',
    response: response({
      heroPositions: [{ position: 'BTN', said: 'on the button' }],
      people: [person('p1', ['big blind'], 'BB')],
      streets: [street('preflop', [act('hero', 'raise', 'I raise to 15', { size: to(15) }), act('p1', 'fold', 'big blind folds', { actorSaid: 'big blind' })])],
    }),
    expect: { participants: [5, 7], actions: { preflop: ['Hero raise to $15', 'BB fold'] }, showdown: {}, winners: null },
  },
  {
    id: '19 "he checks two-thirds": two readings, the player picks',
    text: 'Flop K72. Big blind checks two-thirds.',
    response: response({
      people: [person('p1', ['Big blind'], 'BB')],
      streets: [
        street(
          'flop',
          [
            {
              type: 'unclear',
              said: 'Big blind checks two-thirds',
              options: [
                { label: 'Big blind checks', actor: 'p1', action: 'check', size: null },
                { label: 'Big blind bets 2/3 pot', actor: 'p1', action: 'bet', size: potRatio(0.67) },
              ],
            },
          ],
          board('K 7 2', 'Flop K72'),
        ),
      ],
    }),
    expect: { open: ['meaning:flop:0'], states: { 'flop:0': 'clarify' }, actions: { flop: [] } },
  },
  {
    id: '20 about $200 in the pot: kept as a note, not an exact pot',
    text: 'I raise to 15 on the button, big blind calls. There was about 200 in the pot.',
    response: response({
      heroPositions: [{ position: 'BTN', said: 'on the button' }],
      people: [person('p1', ['big blind'], 'BB')],
      streets: [street('preflop', [act('hero', 'raise', 'I raise to 15', { size: to(15) }), act('p1', 'call', 'big blind calls', { actorSaid: 'big blind' })])],
      pot: { dollars: 200, approximate: true, said: 'about 200 in the pot' },
    }),
    expect: { pot: null, states: { pot: 'unrecorded' }, notes: ['Pot: about $200'] },
  },
  {
    id: '21 "he" with two opponents: not guessed',
    text: 'Old man coffee limps, hoodie guy raises to 20, I call. Flop K72. He bets, I call.',
    response: response({
      people: [person('p1', ['Old man coffee']), person('p2', ['hoodie guy'])],
      streets: [
        street('preflop', [
          act('p1', 'call', 'Old man coffee limps', { shorthand: true, actorSaid: 'Old man coffee' }),
          act('p2', 'raise', 'hoodie guy raises to 20', { size: to(20), actorSaid: 'hoodie guy' }),
          act('hero', 'call', 'I call'),
        ]),
        street('flop', [act(null, 'bet', 'He bets', { actorSaid: 'He' }), act('hero', 'call', 'I call')], board('K 7 2', 'Flop K72')),
      ],
    }),
    // Until "he" is answered, Hero's call has nothing to call: the draft check says so.
    expect: { open: ['actor:flop:0'], states: { 'flop:0': 'clarify' }, errors: 1 },
  },
  {
    id: '22 hand positions that cannot share one button',
    text: 'I was on the button. Hoodie guy was in the big blind and called.',
    response: response({
      heroPositions: [{ position: 'BTN', said: 'I was on the button' }],
      people: [person('p1', ['Hoodie guy'], 'BB')],
      streets: [street('preflop', [act('p1', 'call', 'Hoodie guy ... called', { actorSaid: 'Hoodie guy' })])],
    }),
    // Hero on the button puts it on seat 5; Hoodie Guy (seat 4) in the big blind puts it on seat 2.
    expect: { open: ['button', 'who:p1'], states: { button: 'clarify' }, errors: 1 },
  },
  {
    id: '23 table moved on: the hand puts the button elsewhere',
    text: 'Hoodie guy was in the big blind and checked his option.',
    response: response({
      people: [person('p1', ['Hoodie guy'], 'BB')],
      streets: [street('preflop', [act('p1', 'check', 'Hoodie guy ... checked his option', { actorSaid: 'Hoodie guy' })])],
    }),
    // Hoodie Guy (seat 4) in the big blind means the button was seat 2 in this hand; the Table is untouched.
    expect: { button: 2, states: { button: 'confirmed', 'who:p1': 'confirmed' } },
  },
]
