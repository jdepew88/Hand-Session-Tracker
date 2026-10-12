import type { ShowdownStatus } from '../../src/domain/poker/draft/model'
import type { Street } from '../../src/domain/poker/models'
import { VOICE_TRANSCRIPTS } from '../../src/domain/poker/narration/fixtures/voice'

/**
 * The provider-evaluation corpus: hands told the way players actually tell
 * them -- shorthand, rambling, self-corrections, pronouns, gaps, speech-
 * transcription noise -- for scoring a REAL model's output.
 *
 * SYNTHETIC INPUT. Every narration here was written for this corpus; none
 * is a real player's hand or a production narration.
 *
 * Unlike the deterministic corpus (`src/domain/poker/narration/fixtures/
 * corpus.ts`), there is no hand-written model response: expectations are
 * tolerant facts about the hand SessionTracker builds (positions, cards,
 * action words, showdown), so any response that means the same thing
 * passes.
 *
 * Every case is told at `corpusTable()`: nine-handed $2/$5, Hero in seat 5,
 * every chair occupied. Players: 3 Tom [Reg], 4 Hoodie Guy ("hoodie",
 * "sunglasses guy") [Aggressive, Reg], 7 Quiet Reg [Tight, Reg], 8 Old Man
 * Coffee ("OMC", "coffee") [Tight, Passive], 9 Mike [Loose]. Seats 1, 2, 6
 * are unnamed.
 *
 * Positions for a button on seat b: SB b+1, BB b+2, UTG b+3, UTG+1 b+4,
 * UTG+2 b+5, LJ b+6, HJ b+7, CO b+8 (round the table). The table's button
 * is on Hero (5), so unless the narration places Hero elsewhere: SB 6,
 * BB 7, UTG 8, UTG+1 9, UTG+2 1, LJ 2, HJ 3, CO 4.
 */

export type CaseKind =
  | 'short'
  | 'rambling'
  | 'self-correction'
  | 'pronoun'
  | 'incomplete'
  | 'ambiguous'
  | 'contradictory'
  | 'pot-relative'
  | 'stack'
  | 'showdown'
  | 'card-shorthand'
  | 'board-shorthand'
  | 'player-ref'
  | 'noisy'
  | 'terminology'
  /** A browser speech-recognition transcript: no punctuation, spoken numbers, misheard words. */
  | 'voice'

/** A question the narrator's answer must find: matched against the question's id, wording and quoted words. */
export interface AnswerRule {
  ask: RegExp
  /** An option id ("7", "CO", "none"), a pattern on the option label, or one id per matching question in order. */
  pick: string | RegExp | string[]
}

/** Kinds of question, by id prefix. "who|actor" means either. */
export type AskKind = 'who' | 'actor' | 'hero-position' | 'button' | 'meaning' | 'card' | 'estimate' | 'who|actor' | 'hero-position|button'

export type Expected = string | RegExp

export interface EvalExpect {
  /** The hand's button seat, after answers. */
  button?: number
  /** Seats in the hand. Extra seats are tolerated only if all they did was fold. */
  participants?: number[]
  /** `holeCardsText` of Hero's cards. */
  heroCards?: Expected
  /** `boardText` per street; null = nothing recorded for that card. */
  boards?: Partial<Record<Exclude<Street, 'preflop'>, Expected | null>>
  /** `streetActionWords(...).short` per street. Folds by seats never mentioned are ignored. */
  actions?: Partial<Record<Street, Expected[]>>
  /** Pot fractions that must survive as fractions (not dollars). */
  ratios?: { street: Street; ratio: number }[]
  showdown?: Record<number, ShowdownStatus>
  /** `holeCardsText` of a shown opponent hand. */
  shownCards?: Record<number, Expected>
  winners?: number[]
  /** The narration contradicts itself: it must be flagged, not silently resolved. */
  contradiction?: boolean
  /** Questions that must be asked before any answers: the app cannot know. */
  asks?: AskKind[]
}

export interface EvalCase {
  id: string
  kinds: CaseKind[]
  text: string
  answers?: AnswerRule[]
  expect: EvalExpect
  /** Positions the narration implies without naming ("two to my left" of the button is the BB). */
  allowPositions?: string[]
  /** Amounts a model may compute from what was said (3x, "three times his bet"): over-interpretation, not invention. */
  derivedAmounts?: number[]
}

/** A voice transcript from the shared fixtures, by id. */
function spoken(id: string): string {
  const found = VOICE_TRANSCRIPTS.find((entry) => entry.id === id)
  if (!found) throw new Error(`No voice transcript ${id}.`)
  return found.text
}

/** Run several times to see whether the same words give the same hand. */
export const REPEAT_IDS = ['e01', 'e05', 'e07', 'e08', 'e36', 'e52']

export const EVAL_CASES: EvalCase[] = [
  {
    id: 'e01',
    kinds: ['short', 'card-shorthand', 'board-shorthand'],
    text: 'CO makes it 20, I 3bet button to 65, call. T82 two clubs, bet 50 call, K club turn, bet 120 he makes it 300 I call, river 9d jam call he mucks.',
    answers: [
      { ask: /^actor:preflop/, pick: '4' },
      { ask: /^actor:flop/, pick: ['5', '4'] },
      { ask: /^actor:turn/, pick: ['5'] },
      { ask: /^actor:river/, pick: ['5', '4'] },
    ],
    expect: {
      button: 5,
      participants: [4, 5],
      boards: { flop: 'T 8 2 · two clubs', turn: 'K♣', river: '9♦' },
      actions: {
        preflop: ['CO raise to $20', 'Hero 3-bet to $65', 'CO call'],
        flop: ['Hero bet $50', 'CO call'],
        turn: ['Hero bet $120', 'CO raise to $300', 'Hero call'],
        river: ['Hero all-in', 'CO call'],
      },
      showdown: { 4: 'mucked' },
    },
  },
  {
    id: 'e02',
    kinds: ['rambling'],
    text: "So I'm at Commerce playing two five, although you already know that, and old man coffee is in the big blind. I'm cutoff I think — yeah cutoff. It folds to me, I make it seventeen, he calls. Flop comes jack seven four with two hearts, he checks, I bet twenty five, he folds.",
    expect: {
      button: 6,
      participants: [5, 8],
      boards: { flop: 'J 7 4 · two hearts' },
      actions: { preflop: ['Hero raise to $17', 'BB call'], flop: ['BB check', 'Hero bet $25', 'BB fold'] },
    },
  },
  {
    id: 'e03',
    kinds: ['self-correction'],
    text: 'Button vs big blind. I raise to 15 with queen jack of spades, he calls. Flop king ten four, two spades. He checks, I bet 20, he calls. Turn was nine clubs — no sorry, river was nine clubs. Turn was some low diamond. He checks turn, I check. River he bets 40 and I call. He shows ace king.',
    expect: {
      button: 5,
      participants: [5, 7],
      heroCards: 'Q♠ J♠',
      boards: { flop: 'K T 4 · two spades', turn: '?♦', river: '9♣' },
      actions: {
        preflop: ['Hero raise to $15', 'BB call'],
        flop: ['BB check', 'Hero bet $20', 'BB call'],
        turn: ['BB check', 'Hero check'],
        river: ['BB bet $40', 'Hero call'],
      },
      showdown: { 7: 'shown' },
      shownCards: { 7: 'AK' },
    },
  },
  {
    id: 'e04',
    kinds: ['pronoun'],
    text: 'Hoodie guy opens to 15 from the cutoff, I call on the button. Flop A 9 3. He checks, I bet thirty, he calls. Then he leads turn and I call. River he checks and I jam.',
    expect: {
      participants: [4, 5],
      boards: { flop: 'A 9 3' },
      actions: {
        preflop: ['CO raise to $15', 'Hero call'],
        flop: ['CO check', 'Hero bet $30', 'CO call'],
        turn: ['CO bet', 'Hero call'],
        river: ['CO check', 'Hero all-in'],
      },
    },
  },
  {
    id: 'e05',
    kinds: ['pronoun', 'player-ref'],
    text: 'Old man coffee limps, Mike limps, I raise to 25 on the button and they both call. Flop eight six two, both check, I bet 40, coffee folds and he calls.',
    answers: [
      { ask: /^actor:preflop/, pick: ['8', '9'] },
      { ask: /^actor:flop/, pick: ['8', '9', '9'] },
      { ask: /^who:/, pick: '9' },
    ],
    expect: {
      participants: [5, 8, 9],
      boards: { flop: '8 6 2' },
      actions: {
        preflop: ['UTG limp', 'UTG+1 limp', 'Hero raise to $25', 'UTG call', 'UTG+1 call'],
        flop: ['UTG check', 'UTG+1 check', 'Hero bet $40', 'UTG fold', 'UTG+1 call'],
      },
    },
  },
  {
    id: 'e06',
    kinds: ['incomplete', 'board-shorthand'],
    text: "Don't remember pre. Flop K72 rainbow, I bet, he calls. Turn brick, checks through, river ace and I win.",
    answers: [{ ask: /^who:|^actor:/, pick: '4' }],
    expect: {
      boards: { flop: 'K 7 2 · rainbow', turn: null, river: 'A' },
      actions: { preflop: [], flop: ['Hero bet', 'CO call'], turn: ['CO check', 'Hero check'] },
      winners: [5],
      asks: ['who|actor'],
    },
  },
  {
    id: 'e07',
    kinds: ['ambiguous', 'player-ref'],
    text: 'The reg raises and I call.',
    answers: [{ ask: /^who:/, pick: '3' }],
    expect: { participants: [3, 5], actions: { preflop: ['HJ raise', 'Hero call'] }, asks: ['who'] },
  },
  {
    id: 'e08',
    kinds: ['contradictory'],
    text: 'I was UTG... actually I think I was cutoff. Anyway I open to 15 with pocket nines and the button calls. Flop Q 8 3, I check, he bets 20, I fold.',
    answers: [{ ask: /^hero-position/, pick: 'CO' }, { ask: /^button/, pick: '6' }],
    expect: {
      button: 6,
      participants: [5, 6],
      heroCards: '99',
      actions: { preflop: ['Hero raise to $15', 'BTN call'], flop: ['Hero check', 'BTN bet $20', 'Hero fold'] },
      contradiction: true,
    },
  },
  {
    id: 'e09',
    kinds: ['pot-relative'],
    text: 'Hoodie guy opens to 20 from the cutoff, I call on the button. Flop jack nine five. He bets around half pot, I call.',
    expect: {
      participants: [4, 5],
      boards: { flop: 'J 9 5' },
      actions: { preflop: ['CO raise to $20', 'Hero call'], flop: ['CO bet', 'Hero call'] },
      ratios: [{ street: 'flop', ratio: 0.5 }],
    },
  },
  {
    id: 'e10',
    kinds: ['pot-relative'],
    text: 'I raise to 15 on the button, big blind calls. Flop K 8 4 checks through. Turn 2. He overbets 1.3x and I fold.',
    expect: {
      participants: [5, 7],
      boards: { flop: 'K 8 4', turn: '2' },
      actions: { preflop: ['Hero raise to $15', 'BB call'], flop: ['BB check', 'Hero check'], turn: ['BB bet', 'Hero fold'] },
      ratios: [{ street: 'turn', ratio: 1.3 }],
    },
  },
  {
    id: 'e11',
    kinds: ['pot-relative'],
    text: 'Mike opens to 15, I raise about three times his bet on the button, he calls.',
    derivedAmounts: [45],
    expect: { participants: [5, 9], actions: { preflop: ['UTG+1 raise to $15', /^Hero 3-bet( to \$45)?$/, 'UTG+1 call'] } },
  },
  {
    id: 'e12',
    kinds: ['stack'],
    text: 'I started about 600 deep. I open to 15 on the button, big blind calls. He had maybe 500 back. Flop 7 6 5, he checks, I jam for 420, he calls.',
    expect: {
      participants: [5, 7],
      boards: { flop: '7 6 5' },
      actions: { preflop: ['Hero raise to $15', 'BB call'], flop: ['BB check', 'Hero all-in for $420', 'BB call'] },
    },
  },
  {
    id: 'e13',
    kinds: ['stack'],
    text: 'We were both about 300 deep. UTG opens 15, I call in the big blind. Flop A K 4, I check, he bets 25, I call. Turn 9, I check, he shoves, I fold.',
    expect: {
      button: 3,
      participants: [5, 6],
      boards: { flop: 'A K 4', turn: '9' },
      actions: {
        preflop: ['UTG raise to $15', 'Hero call'],
        flop: ['Hero check', 'UTG bet $25', 'Hero call'],
        turn: ['Hero check', 'UTG all-in', 'Hero fold'],
      },
    },
  },
  {
    id: 'e14',
    kinds: ['showdown'],
    text: "I raise to 15 on the button, big blind calls. Flop T 7 2, I bet 10, he calls. Turn Q, check check. River 3, he checks, I bet 40, he calls. I show tens, he says you're good and mucks.",
    expect: {
      participants: [5, 7],
      actions: {
        preflop: ['Hero raise to $15', 'BB call'],
        flop: ['Hero bet $10', 'BB call'],
        turn: ['BB check', 'Hero check'],
        river: ['BB check', 'Hero bet $40', 'BB call'],
      },
      showdown: { 7: 'mucked' },
    },
  },
  {
    id: 'e15',
    kinds: ['showdown'],
    text: 'Cutoff opens 20, I call on the button. Flop 9 5 2 rainbow. He bets 25, I raise to 80, he calls. Turn K. Check check. River 4. He checks, I bet 150, he calls and shows queens. I have nines for a set.',
    expect: {
      participants: [4, 5],
      heroCards: '99',
      boards: { flop: '9 5 2 · rainbow', turn: 'K', river: '4' },
      actions: {
        preflop: ['CO raise to $20', 'Hero call'],
        flop: ['CO bet $25', 'Hero raise to $80', 'CO call'],
        turn: ['CO check', 'Hero check'],
        river: ['CO check', 'Hero bet $150', 'CO call'],
      },
      showdown: { 4: 'shown' },
      shownCards: { 4: 'QQ' },
    },
  },
  {
    id: 'e16',
    kinds: ['showdown', 'terminology'],
    text: 'I open 15 from the button, big blind 3-bets to 50, I fold. No showdown.',
    expect: { participants: [5, 7], actions: { preflop: ['Hero raise to $15', 'BB 3-bet to $50', 'Hero fold'] } },
  },
  {
    id: 'e17',
    kinds: ['showdown', 'player-ref'],
    // "small blind folds" may come back without a person: the narrator would tap the small blind (seat 4).
    answers: [{ ask: /^actor:preflop/, pick: '4' }],
    text: 'Mike limps from lojack, small blind folds, I check my option in the big blind. Flop ace five five. Check check. Turn ten. I bet 10, he calls. River ace. Check check. We both have a five, we chop.',
    expect: {
      button: 3,
      participants: [5, 9],
      boards: { flop: 'A 5 5', turn: 'T', river: 'A' },
      actions: {
        preflop: ['LJ limp', 'SB fold', 'Hero check'],
        flop: ['Hero check', 'LJ check'],
        turn: ['Hero bet $10', 'LJ call'],
        river: ['Hero check', 'LJ check'],
      },
      winners: [5, 9],
    },
  },
  {
    id: 'e18',
    kinds: ['card-shorthand', 'board-shorthand'],
    text: 'UTG opens 15, I 3-bet to 50 from the button with AhKh, he calls. Flop Kd 7c 2h. He checks, I bet 40, he folds.',
    expect: {
      participants: [5, 8],
      heroCards: 'A♥ K♥',
      boards: { flop: 'K♦ 7♣ 2♥' },
      actions: { preflop: ['UTG raise to $15', 'Hero 3-bet to $50', 'UTG call'], flop: ['UTG check', 'Hero bet $40', 'UTG fold'] },
    },
  },
  {
    id: 'e19',
    kinds: ['card-shorthand'],
    text: 'Hero AKss on the button. Cutoff limps, I raise to 25, he folds.',
    expect: { participants: [4, 5], heroCards: 'A♠ K♠', actions: { preflop: ['CO limp', 'Hero raise to $25', 'CO fold'] } },
  },
  {
    id: 'e20',
    kinds: ['card-shorthand'],
    text: 'Pocket jacks under the gun, I open to 15, big blind calls. Flop 8 4 2, he checks, I bet 20, he folds.',
    expect: {
      button: 2,
      participants: [4, 5],
      heroCards: 'JJ',
      actions: { preflop: ['Hero raise to $15', 'BB call'], flop: ['BB check', 'Hero bet $20', 'BB fold'] },
    },
  },
  {
    id: 'e21',
    kinds: ['card-shorthand', 'showdown'],
    text: 'Red tens in the hijack. I open to 15, the button calls. Flop 9 6 3 rainbow, I bet 20, he calls. Turn jack, check check. River 2, I check, he checks, I show tens, he mucks.',
    expect: {
      button: 7,
      participants: [5, 7],
      heroCards: /^T[♥♦] T[♥♦]$/,
      boards: { flop: '9 6 3 · rainbow', turn: 'J', river: '2' },
      actions: {
        preflop: ['Hero raise to $15', 'BTN call'],
        flop: ['Hero bet $20', 'BTN call'],
        turn: ['Hero check', 'BTN check'],
        river: ['Hero check', 'BTN check'],
      },
      showdown: { 7: 'mucked' },
    },
  },
  {
    id: 'e22',
    kinds: ['card-shorthand'],
    text: 'Ace king off in the small blind. Button opens to 15, I 3-bet to 60, he calls. Flop A 8 4 two diamonds, I bet 45 he folds.',
    expect: {
      button: 4,
      participants: [4, 5],
      heroCards: 'AK offsuit',
      boards: { flop: 'A 8 4 · two diamonds' },
      actions: { preflop: ['BTN raise to $15', 'Hero 3-bet to $60', 'BTN call'], flop: ['Hero bet $45', 'BTN fold'] },
    },
  },
  {
    id: 'e23',
    kinds: ['card-shorthand', 'player-ref', 'terminology'],
    text: 'Queen ten suited on the button, old man coffee limps, I limp behind, big blind checks. Flop Q 7 4. Checks to me, I bet 10, big blind folds, coffee calls.',
    answers: [{ ask: /^actor:flop/, pick: ['7', '8'] }],
    expect: {
      participants: [5, 7, 8],
      heroCards: 'QT suited',
      actions: {
        preflop: ['UTG limp', 'Hero limp', 'BB check'],
        flop: ['BB check', 'UTG check', 'Hero bet $10', 'BB fold', 'UTG call'],
      },
    },
  },
  {
    id: 'e24',
    kinds: ['board-shorthand', 'card-shorthand'],
    text: 'I raise 15 button, BB calls. Flop AsKsQs. He checks, I check. Turn 4h, he bets 20, I call. River 7d, check check.',
    expect: {
      participants: [5, 7],
      boards: { flop: 'A♠ K♠ Q♠', turn: '4♥', river: '7♦' },
      actions: {
        preflop: ['Hero raise to $15', 'BB call'],
        flop: ['BB check', 'Hero check'],
        turn: ['BB bet $20', 'Hero call'],
        river: ['BB check', 'Hero check'],
      },
    },
  },
  {
    id: 'e25',
    kinds: ['board-shorthand', 'terminology'],
    text: 'Hoodie opens 20 in the cutoff, I call button. Flop T82r. He c-bets 25, I call. Turn 3, he checks, I check. River K, he bets 60, I fold.',
    expect: {
      participants: [4, 5],
      boards: { flop: 'T 8 2 · rainbow', turn: '3', river: 'K' },
      actions: {
        preflop: ['CO raise to $20', 'Hero call'],
        flop: ['CO bet $25', 'Hero call'],
        turn: ['CO check', 'Hero check'],
        river: ['CO bet $60', 'Hero fold'],
      },
    },
  },
  {
    id: 'e26',
    kinds: ['board-shorthand', 'terminology'],
    text: 'Button vs BB, I raised to 15 and he called. Flop T82cc, he check-raised my 10 bet to 35 and I folded.',
    expect: {
      participants: [5, 7],
      boards: { flop: 'T 8 2 · two clubs' },
      actions: { preflop: ['Hero raise to $15', 'BB call'], flop: ['BB check', 'Hero bet $10', 'BB raise to $35', 'Hero fold'] },
    },
  },
  {
    id: 'e27',
    kinds: ['board-shorthand', 'player-ref'],
    text: "UTG plus one opens to 15 that's Mike, I call on the button. Flop queen seven deuce rainbow, Mike bets 20, I raise to 60, he folds.",
    expect: {
      participants: [5, 9],
      boards: { flop: 'Q 7 2 · rainbow' },
      actions: { preflop: ['UTG+1 raise to $15', 'Hero call'], flop: ['UTG+1 bet $20', 'Hero raise to $60', 'UTG+1 fold'] },
    },
  },
  {
    id: 'e28',
    kinds: ['player-ref'],
    text: 'Seat four opens to 20, I 3-bet to 70 on the button, he folds.',
    expect: { participants: [4, 5], actions: { preflop: ['CO raise to $20', 'Hero 3-bet to $70', 'CO fold'] } },
  },
  {
    id: 'e29',
    kinds: ['player-ref', 'ambiguous'],
    text: 'I open the button to 15 and the guy two to my left calls. Flop J 4 4, he checks, I bet 15, he folds.',
    answers: [{ ask: /^who:|^actor:/, pick: '7' }],
    allowPositions: ['BB'],
    expect: {
      participants: [5, 7],
      boards: { flop: 'J 4 4' },
      actions: { preflop: ['Hero raise to $15', 'BB call'], flop: ['BB check', 'Hero bet $15', 'BB fold'] },
    },
  },
  {
    id: 'e30',
    kinds: ['player-ref', 'showdown'],
    text: 'Mike limps, I raise to 25 on the button, Mike calls. Flop 6 6 3, Mike checks, I bet 20, Mike calls. Turn 9, check check. River K, Mike bets 50, I call. Mike shows king six.',
    expect: {
      participants: [5, 9],
      boards: { flop: '6 6 3', turn: '9', river: 'K' },
      actions: {
        preflop: ['UTG+1 limp', 'Hero raise to $25', 'UTG+1 call'],
        flop: ['UTG+1 check', 'Hero bet $20', 'UTG+1 call'],
        turn: ['UTG+1 check', 'Hero check'],
        river: ['UTG+1 bet $50', 'Hero call'],
      },
      showdown: { 9: 'shown' },
      shownCards: { 9: 'K6' },
    },
  },
  {
    id: 'e31',
    kinds: ['player-ref', 'terminology'],
    text: 'Sunglasses guy opens to 15 in the cutoff, I 3-bet to 45 on the button, big blind cold calls, sunglasses guy folds. Flop 9 8 7 two spades, big blind checks, I check. Turn 2 of hearts, big blind bets 60, I fold.',
    expect: {
      participants: [4, 5, 7],
      boards: { flop: '9 8 7 · two spades', turn: '2♥' },
      actions: {
        preflop: ['CO raise to $15', 'Hero 3-bet to $45', 'BB call', 'CO fold'],
        flop: ['BB check', 'Hero check'],
        turn: ['BB bet $60', 'Hero fold'],
      },
    },
  },
  {
    id: 'e32',
    kinds: ['noisy'],
    text: 'okay so cutoff opens twenty i make sixty five on button big blind gets out of the way cutoff calls flop ten eight deuce two clubs he checks i bet fifty he calls turn king of clubs he checks i check river nine of diamonds he bets a hundred i call he shows ace ten',
    expect: {
      participants: [4, 5],
      boards: { flop: 'T 8 2 · two clubs', turn: 'K♣', river: '9♦' },
      actions: {
        preflop: ['CO raise to $20', 'Hero 3-bet to $65', 'BB fold', 'CO call'],
        flop: ['CO check', 'Hero bet $50', 'CO call'],
        turn: ['CO check', 'Hero check'],
        river: ['CO bet $100', 'Hero call'],
      },
      showdown: { 4: 'shown' },
      shownCards: { 4: 'AT' },
    },
  },
  {
    id: 'e33',
    kinds: ['noisy', 'showdown'],
    text: 'um so im in the big blind with uh king jack and the button min raises to ten i call flop comes king high king nine four i check he bets fifteen i call turn is a seven i check he checks river is the ace of spades i check he bets forty i call and he has ace nine so i lose',
    expect: {
      button: 3,
      participants: [3, 5],
      heroCards: 'KJ',
      boards: { flop: 'K 9 4', turn: '7', river: 'A♠' },
      actions: {
        preflop: ['BTN raise to $10', 'Hero call'],
        flop: ['Hero check', 'BTN bet $15', 'Hero call'],
        turn: ['Hero check', 'BTN check'],
        river: ['Hero check', 'BTN bet $40', 'Hero call'],
      },
      showdown: { 3: 'shown' },
      shownCards: { 3: 'A9' },
      winners: [3],
    },
  },
  {
    id: 'e34',
    kinds: ['noisy', 'player-ref'],
    text: 'old man coffee limps hijack raises to 20 i call on button coffee calls flop jack ten three rainbow coffee checks hijack bets 30 i call coffee folds turn queen hijack checks i bet 75 he folds',
    expect: {
      participants: [3, 5, 8],
      boards: { flop: 'J T 3 · rainbow', turn: 'Q' },
      actions: {
        preflop: ['UTG limp', 'HJ raise to $20', 'Hero call', 'UTG call'],
        flop: ['UTG check', 'HJ bet $30', 'Hero call', 'UTG fold'],
        turn: ['HJ check', 'Hero bet $75', 'HJ fold'],
      },
    },
  },
  {
    id: 'e35',
    kinds: ['noisy', 'showdown'],
    text: 'folds to me on the button i make it fifteen small blind folds big blind calls flop seven seven two he checks i bet twenty he raises to sixty i call turn five he bets one twenty i call river jack he checks i check he shows pocket eights i show ace seven i win',
    expect: {
      participants: [5, 7],
      boards: { flop: '7 7 2', turn: '5', river: 'J' },
      actions: {
        preflop: ['Hero raise to $15', 'SB fold', 'BB call'],
        flop: ['BB check', 'Hero bet $20', 'BB raise to $60', 'Hero call'],
        turn: ['BB bet $120', 'Hero call'],
        river: ['BB check', 'Hero check'],
      },
      showdown: { 7: 'shown' },
      shownCards: { 7: '88' },
      winners: [5],
    },
  },
  {
    id: 'e36',
    kinds: ['pronoun', 'ambiguous', 'player-ref'],
    text: 'Tom opens 15, hoodie guy calls, I call on the button. Flop K Q 2. Tom bets 25, hoodie calls, I call. Turn 8. He bets 70.',
    answers: [{ ask: /^who:|^actor:/, pick: '3' }],
    expect: {
      participants: [3, 4, 5],
      boards: { flop: 'K Q 2', turn: '8' },
      actions: {
        preflop: ['HJ raise to $15', 'CO call', 'Hero call'],
        flop: ['HJ bet $25', 'CO call', 'Hero call'],
        turn: ['HJ bet $70'],
      },
      asks: ['who|actor'],
    },
  },
  {
    id: 'e37',
    kinds: ['ambiguous', 'player-ref'],
    text: 'The tight guy limps, I raise to 25 on the button, he folds.',
    answers: [{ ask: /^who:/, pick: '8' }],
    expect: { participants: [5, 8], actions: { preflop: ['UTG limp', 'Hero raise to $25', 'UTG fold'] }, asks: ['who'] },
  },
  {
    id: 'e38',
    kinds: ['self-correction'],
    text: 'I raise to 15 on the button, big blind calls. Flop K 9 2. He bets 20, I call. Wait no, he bet 30. Turn 5, check check.',
    expect: {
      participants: [5, 7],
      actions: { preflop: ['Hero raise to $15', 'BB call'], flop: [/^BB bet( \$30)?$/, 'Hero call'], turn: ['BB check', 'Hero check'] },
    },
  },
  {
    id: 'e39',
    kinds: ['contradictory', 'player-ref'],
    text: 'I raise to 15 on the button and hoodie guy calls from the big blind. Flop 9 9 4, he checks, I check. Turn 6, he bets 20, I fold.',
    // Asked where the button was, the narrator says on them, as they said.
    answers: [{ ask: /^who:/, pick: '7' }, { ask: /^button/, pick: '5' }],
    expect: {
      participants: [5, 7],
      actions: { preflop: ['Hero raise to $15', 'BB call'], flop: ['BB check', 'Hero check'], turn: ['BB bet $20', 'Hero fold'] },
      contradiction: true,
    },
  },
  {
    id: 'e40',
    kinds: ['contradictory', 'showdown'],
    text: 'Pocket kings on the button, I raise to 15, big blind calls. Flop A 6 2, he bets 20, I call. Turn 3, check check. River 3, check check. I show ace king, he shows ace jack.',
    expect: {
      participants: [5, 7],
      actions: { preflop: ['Hero raise to $15', 'BB call'], flop: ['BB bet $20', 'Hero call'], turn: ['BB check', 'Hero check'], river: ['BB check', 'Hero check'] },
      shownCards: { 7: 'AJ' },
      contradiction: true,
    },
  },
  {
    id: 'e41',
    kinds: ['incomplete'],
    text: "Raised the button to 15, big blind called. Don't remember the flop action. Turn queen, he bet 40 and I called. River 2, he checks, I check, he wins with a flush.",
    expect: {
      participants: [5, 7],
      boards: { turn: 'Q', river: '2' },
      actions: { preflop: ['Hero raise to $15', 'BB call'], flop: [], turn: ['BB bet $40', 'Hero call'], river: ['BB check', 'Hero check'] },
      winners: [7],
    },
  },
  {
    id: 'e42',
    kinds: ['incomplete', 'ambiguous'],
    text: 'Some guy raised, I called, he c-bet the flop and I folded.',
    answers: [{ ask: /^who:|^actor:/, pick: '3' }],
    expect: { participants: [3, 5], actions: { preflop: ['HJ raise', 'Hero call'], flop: ['HJ bet', 'Hero fold'] }, asks: ['who|actor'] },
  },
  {
    id: 'e43',
    kinds: ['incomplete', 'pot-relative'],
    text: 'Button versus big blind, I raised to 15, he called. Skipping to the river, pot was about 200. River jack, he bets 150, I call. He shows a bluff.',
    expect: { participants: [5, 7], actions: { preflop: ['Hero raise to $15', 'BB call'], river: ['BB bet $150', 'Hero call'] } },
  },
  {
    id: 'e44',
    kinds: ['terminology'],
    text: 'Hoodie guy opens 20 cutoff, I 3-bet 70 on the button, he tanks and calls. Flop 4 4 2, he checks, I bet 50, he snap calls. Turn 9, he checks, I check. River 4, he bets 200, I tank fold.',
    expect: {
      participants: [4, 5],
      boards: { flop: '4 4 2', turn: '9', river: '4' },
      actions: {
        preflop: ['CO raise to $20', 'Hero 3-bet to $70', 'CO call'],
        flop: ['CO check', 'Hero bet $50', 'CO call'],
        turn: ['CO check', 'Hero check'],
        river: ['CO bet $200', 'Hero fold'],
      },
    },
  },
  {
    id: 'e45',
    kinds: ['terminology', 'player-ref'],
    text: 'Old man coffee opens to 15 from UTG, Mike flats, I flat on the button, big blind squeezes to 75, coffee folds, Mike folds, I fold.',
    expect: {
      participants: [5, 7, 8, 9],
      actions: { preflop: ['UTG raise to $15', 'UTG+1 call', 'Hero call', 'BB 3-bet to $75', 'UTG fold', 'UTG+1 fold', 'Hero fold'] },
    },
  },
  {
    id: 'e46',
    kinds: ['terminology', 'board-shorthand'],
    text: 'I open 15 on the button, big blind clicks it back to 30, I call. Flop A J 9 monotone hearts, he leads 25, I call. Turn 2 of spades, he checks, I check. River 5 of hearts, he jams for 300, I fold.',
    expect: {
      participants: [5, 7],
      // "Monotone hearts" fixes every flop suit.
      boards: { flop: 'A♥ J♥ 9♥', turn: '2♠', river: '5♥' },
      actions: {
        preflop: ['Hero raise to $15', 'BB 3-bet to $30', 'Hero call'],
        flop: ['BB bet $25', 'Hero call'],
        turn: ['BB check', 'Hero check'],
        river: ['BB all-in for $300', 'Hero fold'],
      },
    },
  },
  {
    id: 'e47',
    kinds: ['terminology'],
    text: 'I raise to 15 on the button, big blind calls. Flop Q 9 4, he checks, I bet 40, he raises another 80, I call. Turn 2, he bets 100, I fold.',
    expect: {
      participants: [5, 7],
      actions: {
        preflop: ['Hero raise to $15', 'BB call'],
        flop: ['BB check', 'Hero bet $40', 'BB raise to $120', 'Hero call'],
        turn: ['BB bet $100', 'Hero fold'],
      },
    },
  },
  {
    id: 'e48',
    kinds: ['pot-relative'],
    text: 'Hoodie opens 20 cutoff, I call button. Flop 7 5 3, he bets 30, I call. Turn 7, check check. River 9, he bets pot, I fold.',
    expect: {
      participants: [4, 5],
      actions: {
        preflop: ['CO raise to $20', 'Hero call'],
        flop: ['CO bet $30', 'Hero call'],
        turn: ['CO check', 'Hero check'],
        river: ['CO bet', 'Hero fold'],
      },
      ratios: [{ street: 'river', ratio: 1 }],
    },
  },
  {
    id: 'e49',
    kinds: ['pot-relative', 'short'],
    text: 'I raise 15 button, BB calls. Flop K J 5, he checks, I bet two thirds pot, he calls. Turn 8, he checks, I bet 1.25x, he folds.',
    expect: {
      participants: [5, 7],
      actions: {
        preflop: ['Hero raise to $15', 'BB call'],
        flop: ['BB check', 'Hero bet', 'BB call'],
        turn: ['BB check', 'Hero bet', 'BB fold'],
      },
      ratios: [
        { street: 'flop', ratio: 0.67 },
        { street: 'turn', ratio: 1.25 },
      ],
    },
  },
  {
    id: 'e50',
    kinds: ['pot-relative', 'showdown'],
    text: 'Button vs BB, I opened to 15, he called. Flop 6 5 4, he bets ⅔ pot and I raise to 60, he calls. Turn A, check check. River K, check check, he shows 7 3 for the straight.',
    expect: {
      participants: [5, 7],
      actions: {
        preflop: ['Hero raise to $15', 'BB call'],
        flop: ['BB bet', 'Hero raise to $60', 'BB call'],
        turn: ['BB check', 'Hero check'],
        river: ['BB check', 'Hero check'],
      },
      ratios: [{ street: 'flop', ratio: 0.67 }],
      showdown: { 7: 'shown' },
      shownCards: { 7: '73' },
    },
  },
  {
    id: 'e51',
    kinds: ['player-ref', 'stack', 'showdown'],
    text: 'Seat nine limps, I raise to 25 on the button with jack jack, he calls. Flop T 6 2 rainbow, he checks, I bet 30, he jams for 210, I call. Board runs out 3 and 8, he shows ten nine, I win.',
    expect: {
      participants: [5, 9],
      heroCards: 'JJ',
      boards: { flop: 'T 6 2 · rainbow', turn: '3', river: '8' },
      actions: {
        preflop: ['UTG+1 limp', 'Hero raise to $25', 'UTG+1 call'],
        flop: ['UTG+1 check', 'Hero bet $30', 'UTG+1 all-in for $210', 'Hero call'],
      },
      showdown: { 9: 'shown' },
      shownCards: { 9: 'T9' },
      winners: [5],
    },
  },
  {
    id: 'e52',
    kinds: ['rambling', 'self-correction'],
    text: "Okay this one's long. I'm under the gun, no wait, I'm in the hijack, with ace jack of clubs. I open to 15. The cutoff 3-bets to 45. Everyone else folds, I call. Flop jack eight three, two clubs I think, maybe rainbow, honestly not sure. I check, he bets 40, I call. Turn 2. Check check. River 5. I bet 60, he folds.",
    // "Everyone else folds" may come back as one fold with no actor: the narrator leaves it out.
    answers: [{ ask: /^hero-position/, pick: 'HJ' }, { ask: /^button/, pick: '7' }, { ask: /^actor:preflop/, pick: 'skip' }],
    expect: {
      button: 7,
      participants: [5, 6],
      heroCards: 'A♣ J♣',
      boards: { flop: 'J 8 3', turn: '2', river: '5' },
      actions: {
        preflop: ['Hero raise to $15', 'CO 3-bet to $45', 'Hero call'],
        flop: ['Hero check', 'CO bet $40', 'Hero call'],
        turn: ['Hero check', 'CO check'],
        river: ['Hero bet $60', 'CO fold'],
      },
    },
  },
  {
    id: 'e53',
    kinds: ['short', 'terminology'],
    text: 'BTN vs BB single raised pot, I open 3x, he calls. Flop A 6 6, he x, I bet 10, he folds.',
    derivedAmounts: [15],
    expect: {
      participants: [5, 7],
      boards: { flop: 'A 6 6' },
      actions: { preflop: [/^Hero raise( to \$15)?$/, 'BB call'], flop: ['BB check', 'Hero bet $10', 'BB fold'] },
    },
  },
  {
    id: 'e54',
    kinds: ['terminology', 'showdown'],
    text: 'Folds to the button who opens to 12, small blind folds, I defend my big blind. Flop K 5 3 two spades, I check, he bets 10, I call. Turn 5, I check, he checks. River Q, I bet 30, he calls, I show king queen, he shows king jack.',
    expect: {
      button: 3,
      participants: [3, 5],
      boards: { flop: 'K 5 3 · two spades', turn: '5', river: 'Q' },
      actions: {
        preflop: ['BTN raise to $12', 'SB fold', 'Hero call'],
        flop: ['Hero check', 'BTN bet $10', 'Hero call'],
        turn: ['Hero check', 'BTN check'],
        river: ['Hero bet $30', 'BTN call'],
      },
      showdown: { 3: 'shown' },
      shownCards: { 3: 'KJ' },
    },
  },

  // Voice transcripts (src/domain/poker/narration/fixtures/voice.ts), as speech recognition returns them.
  {
    id: 'v01',
    kinds: ['voice', 'noisy', 'stack'],
    text: spoken('v01'),
    expect: {
      button: 6,
      participants: [5, 8],
      boards: { flop: 'A♠ K♠ Q♠' },
      actions: { preflop: ['Hero raise to $17', 'BB call'], flop: ['BB check', 'Hero bet $10', 'BB call'] },
    },
  },
  {
    id: 'v02',
    kinds: ['voice', 'noisy', 'player-ref'],
    // The spoken form of e01: the same questions, the same answers.
    text: spoken('v02'),
    answers: [
      { ask: /^actor:preflop/, pick: '4' },
      { ask: /^actor:flop/, pick: ['5', '4'] },
      { ask: /^actor:turn/, pick: ['5'] },
    ],
    expect: {
      button: 5,
      participants: [4, 5],
      boards: { flop: 'T 8 2 · two clubs', turn: 'K♣' },
      actions: {
        preflop: ['CO raise to $20', 'Hero 3-bet to $65', 'CO call'],
        flop: ['Hero bet $50', 'CO call'],
        turn: ['Hero bet $120', 'CO raise to $300', 'Hero call'],
      },
    },
  },
  {
    id: 'v03',
    kinds: ['voice', 'self-correction'],
    text: spoken('v03'),
    expect: {
      participants: [5, 7],
      boards: { flop: 'J 7 3 · rainbow', river: '9♣' },
      actions: {
        preflop: ['Hero raise to $15', 'BB call'],
        flop: ['BB check', 'Hero check'],
        turn: ['BB check', 'Hero check'],
        river: ['BB bet $20', 'Hero fold'],
      },
    },
  },
  {
    id: 'v04',
    kinds: ['voice', 'terminology'],
    text: spoken('v04'),
    expect: {
      participants: [3, 5],
      heroCards: 'AQ suited',
      boards: { flop: 'Q 7 2 · rainbow' },
      actions: { preflop: ['HJ raise to $15', 'Hero 3-bet to $45', 'HJ call'], flop: ['HJ check', 'Hero bet $30', 'HJ fold'] },
    },
  },
  {
    id: 'v05',
    kinds: ['voice', 'noisy'],
    text: spoken('v05'),
    expect: {
      button: 5,
      participants: [4, 5],
      boards: { flop: 'T 8 2 · two clubs' },
      actions: { preflop: ['CO raise to $20', 'Hero 3-bet to $65', 'BB fold', 'CO call'] },
    },
  },
  {
    id: 'v06',
    kinds: ['voice', 'pot-relative', 'showdown', 'stack'],
    text: spoken('v06'),
    expect: {
      button: 6,
      participants: [5, 8],
      heroCards: 'J♥ T♥',
      boards: { flop: 'A♠ K♠ Q♠', turn: null, river: '9♣' },
      actions: { preflop: ['Hero raise to $17', 'BB call'], flop: ['BB check', 'Hero bet $10', 'BB call'], turn: ['BB bet', 'Hero call'] },
      ratios: [
        { street: 'turn', ratio: 0.67 },
        { street: 'river', ratio: 1.2 },
      ],
      showdown: { 8: 'mucked' },
      winners: [5],
    },
  },
  {
    id: 'v07',
    kinds: ['voice', 'noisy', 'rambling', 'showdown'],
    // Hero UTG puts the button on seat 2: SB 3, BB 4 (Hoodie Guy), coffee (8) in the lojack.
    // The river's bare "check" names nobody: asking who is right (only the big blind acts before Hero).
    text: spoken('v07'),
    answers: [{ ask: /^actor:river/, pick: '4' }],
    expect: {
      button: 2,
      participants: [4, 5, 8],
      heroCards: 'JJ',
      boards: { flop: 'J 6 2 · two hearts', turn: '8♠', river: 'A' },
      actions: {
        preflop: ['Hero raise to $15', 'LJ call', 'BB call'],
        flop: ['BB check', 'Hero bet $40', 'LJ call', 'BB call'],
        turn: ['BB check', 'Hero check', 'LJ check'],
        river: ['BB check', 'Hero bet $110', 'LJ fold', 'BB call'],
      },
      showdown: { 4: 'mucked' },
      winners: [5],
    },
  },
  {
    id: 'v08',
    kinds: ['voice', 'noisy', 'card-shorthand'],
    // "for tree" is a mishearing of "four three": reading it as 4 3 is right; asking is acceptable.
    text: spoken('v08'),
    expect: {
      participants: [5, 7],
      heroCards: 'KQ offsuit',
      boards: { flop: /^K( 4 3)?/ },
      actions: { preflop: ['Hero raise to $12', 'BB 3-bet to $40', 'Hero call'], flop: ['BB bet $30', 'Hero call'] },
    },
  },
  {
    id: 'v09',
    kinds: ['voice', 'terminology', 'player-ref'],
    // Hero in the big blind puts the button on seat 3: Hoodie Guy (4) is the small blind.
    text: spoken('v09'),
    expect: {
      button: 3,
      participants: [4, 5],
      boards: { flop: '7 7 2' },
      actions: {
        preflop: ['SB raise to $30', 'Hero call'],
        flop: ['Hero check', 'SB bet $25', 'Hero raise to $80', 'SB all-in', 'Hero fold'],
      },
    },
  },
]
