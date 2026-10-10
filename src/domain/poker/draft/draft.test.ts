import { beforeEach, describe, expect, it } from 'vitest'
import { computeResult } from '../showdown'
import { withHandStack } from '../factories'
import { Hand, makeSetup, resetIds } from '../testSupport'
import { checkDraft } from './check'
import { flowFor, handFlow } from './flow'
import { exactHoleCards, rememberCard } from './memory'
import type { CardMemory, HandDraft } from './model'
import {
  addAction,
  addActions,
  createDraft,
  setActionAmount,
  setBoardCard,
  setFlopSuits,
  setHeroCard,
  setHeroSuited,
  setParticipant,
  setShowdown,
  setWinners,
  undoAction,
} from './ops'
import { parseDraft } from './parse'
import { draftFromEvents } from './project'
import { reconstructHand } from './reconstruct'
import { applyShortcut, preflopShortcuts, streetShortcuts } from './shortcuts'
import {
  boardSpoken,
  boardText,
  draftSummaryText,
  holeCardsSpoken,
  holeCardsText,
  participantsLine,
  summarizeDraft,
} from './text'

beforeEach(resetIds)

/*
 * $2/$5, six-handed, button on seat 6:
 * SB 1, BB 2, UTG 3, HJ 4, CO 5, BTN 6. Hero is on the button.
 */
const SB = 1
const BB = 2
const CO = 5
const HERO = 6

const table = () =>
  makeSetup({ seats: 6, buttonSeat: 6, heroSeat: HERO, smallBlind: 200, bigBlind: 500, stacks: 100_000 })

const card = (text: string): CardMemory => rememberCard(text)
const rank = (value: CardMemory['rank']): CardMemory => ({ rank: value, suit: null })

let ids = 0
const id = () => `a${(ids += 1)}`

/** Hero (BTN) vs CO, A♠ K♦, CO opens, Hero 3-bets, CO calls. */
function heroVsCo(): HandDraft {
  const setup = table()
  let draft = createDraft(setup)
  draft = setParticipant(draft, setup, CO, true)
  draft = setHeroCard(draft, 0, card('As'))
  draft = setHeroCard(draft, 1, card('Kd'))
  draft = addActions(draft, setup, 'preflop', [
    { seat: CO, action: 'raise', id: id() },
    { seat: HERO, action: 'raise', id: id() },
    { seat: CO, action: 'call', id: id() },
  ])
  return draft
}

describe('a new draft', () => {
  it('starts from the table: Hero in the hand, nothing invented', () => {
    const setup = table()
    const draft = createDraft(setup)
    expect(draft.participants).toEqual([HERO])
    expect(draft.hero.cards).toEqual([
      { rank: null, suit: null },
      { rank: null, suit: null },
    ])
    expect(draft.streets).toEqual([{ street: 'preflop', cards: [], suits: null, actions: [] }])
    expect(draft.winners).toBeNull()
    expect(draft.pot).toBeNull()
  })

  it('keeps Hero in the hand and drops what a removed player did', () => {
    const setup = table()
    let draft = heroVsCo()
    expect(setParticipant(draft, setup, HERO, false).participants).toContain(HERO)
    draft = setWinners(draft, [CO])
    draft = setParticipant(draft, setup, CO, false)
    expect(draft.participants).toEqual([HERO])
    expect(draft.streets[0]!.actions.every((action) => action.seat !== CO)).toBe(true)
    expect(draft.winners).toBeNull()
  })

  it('only seats players dealt in at the table', () => {
    const setup = { ...table(), seats: table().seats.filter((seat) => seat.seat !== 3) }
    const draft = setParticipant(createDraft(setup), setup, 3, true)
    expect(draft.participants).toEqual([HERO])
  })

  it('reads the matchup with positions and table names', () => {
    const setup = table()
    setup.seats = setup.seats.map((seat) => (seat.seat === CO ? { ...seat, label: 'Hoodie guy' } : seat))
    expect(participantsLine(setup, heroVsCo().participants)).toBe('Hero BTN vs CO (Hoodie guy)')
  })
})

describe('turn order without amounts', () => {
  it('knows who acts next preflop and after a raise', () => {
    const setup = table()
    let draft = setParticipant(createDraft(setup), setup, CO, true)
    expect(flowFor(setup, draft, 'preflop').toAct).toEqual([CO, HERO])
    draft = addAction(draft, setup, 'preflop', { seat: CO, action: 'raise' })
    expect(flowFor(setup, draft, 'preflop').toAct).toEqual([HERO])
    draft = addAction(draft, setup, 'preflop', { seat: HERO, action: 'raise' })
    expect(flowFor(setup, draft, 'preflop').toAct).toEqual([CO])
  })

  it('opens postflop action out of position, and closes the street on a call', () => {
    const setup = table()
    let draft = heroVsCo()
    expect(flowFor(setup, draft, 'flop').toAct).toEqual([CO, HERO])
    draft = addActions(draft, setup, 'flop', [
      { seat: CO, action: 'check' },
      { seat: HERO, action: 'bet' },
      { seat: CO, action: 'call' },
    ])
    expect(flowFor(setup, draft, 'flop').toAct).toEqual([])
  })

  it('names an aggressive action for the street: a bet into nothing, a raise over a bet', () => {
    const setup = table()
    let draft = heroVsCo()
    draft = addAction(draft, setup, 'flop', { seat: CO, action: 'raise' })
    expect(draft.streets[1]!.actions[0]!.action).toBe('bet')
    draft = addAction(draft, setup, 'flop', { seat: HERO, action: 'bet' })
    expect(draft.streets[1]!.actions[1]!.action).toBe('raise')
  })

  it('leaves the big blind its option in a limped pot', () => {
    const setup = table()
    let draft = setParticipant(createDraft(setup), setup, BB, true)
    draft = addAction(draft, setup, 'preflop', { seat: HERO, action: 'call' })
    expect(flowFor(setup, draft, 'preflop').toAct).toEqual([BB])
    draft = addAction(draft, setup, 'preflop', { seat: BB, action: 'check' })
    expect(checkDraft(setup, draft).errors).toEqual([])
    expect(summarizeDraft(setup, draft).streets[0]!.line).toBe('Hero limp → BB check')
  })
})

describe('optional amounts', () => {
  it('records a bet with no amount, and takes one later', () => {
    const setup = table()
    let draft = heroVsCo()
    draft = addAction(draft, setup, 'flop', { seat: CO, action: 'check' })
    draft = addAction(draft, setup, 'flop', { seat: HERO, action: 'bet', id: 'bet' })
    expect(draft.streets[1]!.actions[1]!.amount).toBeNull()
    expect(checkDraft(setup, draft).errors).toEqual([])
    expect(checkDraft(setup, draft).gaps).toContain("Flop: Hero's bet amount")

    draft = setActionAmount(draft, 'flop', 'bet', 4_000)
    expect(draft.streets[1]!.actions[1]!.amount).toBe(4_000)
    expect(summarizeDraft(setup, draft).streets[1]!.line).toBe('CO check → Hero bet $40')
  })

  it('never puts an amount on a check, call or fold', () => {
    const setup = table()
    const draft = addAction(heroVsCo(), setup, 'flop', { seat: CO, action: 'check', amount: 999 })
    expect(draft.streets[1]!.actions[0]!.amount).toBeNull()
  })

  it('words preflop raises the way players say them', () => {
    const setup = table()
    let draft = heroVsCo()
    draft = setActionAmount(draft, 'preflop', draft.streets[0]!.actions[0]!.id, 2_000)
    draft = setActionAmount(draft, 'preflop', draft.streets[0]!.actions[1]!.id, 6_000)
    const preflop = summarizeDraft(setup, draft).streets[0]!
    expect(preflop.line).toBe('CO raise to $20 → Hero 3-bet to $60 → CO call')
    expect(preflop.spoken).toBe('Preflop. Cutoff raised to $20. Hero 3-bet to $60. Cutoff called.')
  })

  it('rejects amounts that cannot have happened', () => {
    const setup = table()
    let draft = heroVsCo()
    draft = setActionAmount(draft, 'preflop', draft.streets[0]!.actions[0]!.id, 2_000)
    draft = setActionAmount(draft, 'preflop', draft.streets[0]!.actions[1]!.id, 1_500)
    expect(checkDraft(setup, draft).errors).toContain("Preflop: Hero's raise must be larger than the bet before it.")
    const base = heroVsCo()
    const tiny = setActionAmount(base, 'preflop', base.streets[0]!.actions[0]!.id, 400)
    expect(checkDraft(setup, tiny).errors.some((error) => error.includes('more than the big blind'))).toBe(true)
  })
})

describe('incomplete hands are valid', () => {
  it('saves a hand with no preflop detail, unknown amounts and unknown opponent cards', () => {
    const setup = table()
    let draft = setParticipant(createDraft(setup), setup, CO, true)
    draft = setHeroCard(draft, 0, rank('A'))
    draft = setHeroCard(draft, 1, rank('K'))
    draft = setBoardCard(draft, 'flop', 0, rank('T'))
    draft = setBoardCard(draft, 'flop', 1, rank('8'))
    draft = setBoardCard(draft, 'flop', 2, rank('2'))
    draft = addActions(draft, setup, 'flop', [
      { seat: CO, action: 'check' },
      { seat: HERO, action: 'bet' },
      { seat: CO, action: 'call' },
    ])
    draft = setWinners(draft, [HERO])

    const check = checkDraft(setup, draft)
    expect(check.errors).toEqual([])
    expect(check.gaps).toEqual(
      expect.arrayContaining(['Preflop action', "Flop: Hero's bet amount", "Hero's exact cards", 'Flop: exact cards']),
    )

    const text = draftSummaryText(summarizeDraft(setup, draft), '$2/$5 NLH')
    expect(text).toBe(
      ['$2/$5 NLH', 'Hero BTN vs CO', '', 'Hero: AK', '', 'Preflop', 'Details not recorded', '', 'Flop', 'T 8 2', 'CO check → Hero bet → CO call', '', 'Hero wins'].join('\n'),
    )
  })

  it('records a skipped action as a gap, not an error', () => {
    const setup = table()
    // CO's flop check is forgotten: "I bet, he calls".
    const draft = addActions(heroVsCo(), setup, 'flop', [
      { seat: HERO, action: 'bet' },
      { seat: CO, action: 'call' },
    ])
    const check = checkDraft(setup, draft)
    expect(check.errors).toEqual([])
    expect(check.gaps).toContain("Flop: CO's action")
  })

  it('says exactly what stops the pot being worked out', () => {
    const setup = table()
    const rebuilt = reconstructHand(setup, heroVsCo())
    expect(rebuilt.exact).toBe(false)
    if (!rebuilt.exact) expect(rebuilt.missing).toEqual(["Preflop: CO's raise amount not recorded"])
  })
})

describe('cards as remembered', () => {
  it('keeps "AK suited" without inventing suits', () => {
    const setup = table()
    let draft = setHeroCard(createDraft(setup), 0, rank('A'))
    draft = setHeroCard(draft, 1, rank('K'))
    draft = setHeroSuited(draft, true)
    expect(holeCardsText(draft.hero)).toBe('AK suited')
    expect(holeCardsSpoken(draft.hero)).toBe('Ace King suited, exact suits unknown')
    expect(exactHoleCards(draft.hero)).toBeNull()
    expect(draft.hero.cards.every((entry) => entry.suit === null)).toBe(true)
  })

  it('keeps "ten-eight-two, two clubs" as three ranks and a suit pattern', () => {
    let draft = heroVsCo()
    draft = setBoardCard(draft, 'flop', 0, rank('T'))
    draft = setBoardCard(draft, 'flop', 1, rank('8'))
    draft = setBoardCard(draft, 'flop', 2, rank('2'))
    draft = setFlopSuits(draft, { kind: 'two-tone', suit: 'c' })
    const flop = draft.streets[1]!
    expect(flop.cards.every((entry) => entry.suit === null)).toBe(true)
    expect(boardText(flop)).toBe('T 8 2 · two clubs')
    expect(boardSpoken(flop)).toBe('ten, eight, two, two clubs')
  })

  it('reads an exact flop aloud card by card', () => {
    const setup = table()
    let draft = heroVsCo()
    ;['Tc', '8h', '2c'].forEach((text, index) => (draft = setBoardCard(draft, 'flop', index, card(text))))
    draft = addActions(draft, setup, 'flop', [
      { seat: HERO, action: 'bet' },
      { seat: CO, action: 'call' },
    ])
    expect(summarizeDraft(setup, draft).streets[1]!.spoken).toBe(
      'Flop: ten of clubs, eight of hearts, two of clubs. Hero bet. Cutoff called.',
    )
  })

  it('rejects the same physical card twice, anywhere in the hand', () => {
    const setup = table()
    const draft = setBoardCard(heroVsCo(), 'flop', 0, card('As'))
    expect(checkDraft(setup, draft).errors).toContain('The same card appears more than once: As.')

    let shown = setBoardCard(heroVsCo(), 'flop', 0, card('Qh'))
    shown = setShowdown(shown, CO, 'shown', { cards: [card('Qh'), card('Qs')], suited: null })
    expect(checkDraft(setup, shown).errors.some((error) => error.includes('Qh'))).toBe(true)
  })

  it('rejects a fifth card of a rank, a suited pair and a flop pattern the cards contradict', () => {
    const setup = table()
    let aces = setHeroCard(createDraft(setup), 0, card('As'))
    aces = setHeroCard(aces, 1, card('Ah'))
    aces = setBoardCard(aces, 'flop', 0, card('Ad'))
    aces = setBoardCard(aces, 'flop', 1, card('Ac'))
    aces = setBoardCard(aces, 'flop', 2, rank('A'))
    expect(checkDraft(setup, aces).errors).toContain('There are only four Aces in a deck.')

    let pair = setHeroCard(createDraft(setup), 0, rank('Q'))
    pair = setHeroCard(pair, 1, rank('Q'))
    pair = setHeroSuited(pair, true)
    expect(checkDraft(setup, pair).errors).toContain("Hero's pair cannot be suited.")

    let flop = setBoardCard(heroVsCo(), 'flop', 0, card('Td'))
    flop = setBoardCard(flop, 'flop', 1, card('8h'))
    flop = setFlopSuits(flop, { kind: 'monotone', suit: 'c' })
    expect(checkDraft(setup, flop).errors).toContain('A monotone flop has one suit.')
  })
})

describe('impossible action is an error', () => {
  it('stops a check into a bet, acting after folding, and a street after the hand ended', () => {
    const setup = table()
    let draft = addActions(heroVsCo(), setup, 'flop', [
      { seat: CO, action: 'bet' },
      { seat: HERO, action: 'check' },
    ])
    expect(checkDraft(setup, draft).errors).toContain('Flop: Hero cannot check facing a bet.')

    draft = addActions(heroVsCo(), setup, 'flop', [
      { seat: CO, action: 'bet' },
      { seat: HERO, action: 'fold' },
    ])
    draft = addAction(draft, setup, 'turn', { seat: CO, action: 'bet' })
    expect(checkDraft(setup, draft).errors.some((error) => error.includes('everyone else folded on the flop'))).toBe(true)
  })

  it('does not let a folded player win', () => {
    const setup = table()
    let draft = addActions(heroVsCo(), setup, 'flop', [
      { seat: CO, action: 'bet' },
      { seat: HERO, action: 'fold' },
    ])
    expect(summarizeDraft(setup, draft).result).toBe('CO wins')
    draft = setWinners(draft, [HERO])
    expect(checkDraft(setup, draft).errors).toContain('Hero folded, so cannot have won.')
  })
})

describe('shortcuts', () => {
  it('offers heads-up postflop lines in the order of play, with names', () => {
    const setup = table()
    const shortcuts = streetShortcuts(setup, heroVsCo(), 'flop')
    expect(shortcuts.map((shortcut) => shortcut.label)).toEqual(
      expect.arrayContaining(['CO checks, Hero checks', 'CO bets, Hero calls', 'CO checks, Hero bets, CO calls', 'CO goes all-in, Hero calls']),
    )
    const line = shortcuts.find((shortcut) => shortcut.id === 'check-bet-call')!
    const draft = applyShortcut(heroVsCo(), setup, 'flop', line)
    expect(summarizeDraft(setup, draft).streets[1]!.line).toBe('CO check → Hero bet → CO call')
    expect(streetShortcuts(setup, draft, 'flop')).toEqual([])
  })

  it('offers preflop lines between the players in the hand', () => {
    const setup = table()
    const draft = setParticipant(createDraft(setup), setup, CO, true)
    const labels = preflopShortcuts(setup, draft).map((shortcut) => shortcut.label)
    expect(labels).toEqual(
      expect.arrayContaining(['CO raises, Hero calls', 'CO raises, Hero 3-bets, CO calls', 'CO raises, Hero 3-bets, CO 4-bets, Hero calls']),
    )
    const threeBet = preflopShortcuts(setup, draft).find((shortcut) => shortcut.id === '3bet-call')!
    expect(summarizeDraft(setup, applyShortcut(draft, setup, 'preflop', threeBet)).streets[0]!.line).toBe(
      'CO raise → Hero 3-bet → CO call',
    )
  })

  it('checks around a multiway street', () => {
    const setup = table()
    let draft = setParticipant(heroVsCo(), setup, BB, true)
    draft = { ...draft, streets: [{ ...draft.streets[0]!, actions: [] }] }
    draft = addActions(draft, setup, 'preflop', [
      { seat: CO, action: 'raise' },
      { seat: HERO, action: 'call' },
      { seat: BB, action: 'call' },
    ])
    const [around] = streetShortcuts(setup, draft, 'flop')
    expect(around!.id).toBe('check-around')
    const next = applyShortcut(draft, setup, 'flop', around!)
    expect(next.streets[1]!.actions.map((action) => action.seat)).toEqual([BB, CO, HERO])
  })
})

describe('showdown and result', () => {
  function toRiver(): HandDraft {
    const setup = table()
    let draft = heroVsCo()
    for (const street of ['flop', 'turn', 'river'] as const) {
      draft = addActions(draft, setup, street, [
        { seat: CO, action: 'check' },
        { seat: HERO, action: 'check' },
      ])
    }
    return draft
  }

  it('shows Hero, keeps a mucked opponent mucked, and names the winner', () => {
    const setup = table()
    let draft = setShowdown(toRiver(), CO, 'mucked')
    draft = setWinners(draft, [HERO])
    const summary = summarizeDraft(setup, draft)
    expect(summary.showdown.map((entry) => entry.text)).toEqual(['Hero shows A♠ K♦', 'CO mucks'])
    expect(summary.result).toBe('Hero wins')
    expect(checkDraft(setup, draft).gaps).not.toContain("CO's cards")
  })

  it('treats unseen opponent cards as unknown, never as a guess', () => {
    const setup = table()
    const summary = summarizeDraft(setup, toRiver())
    expect(summary.showdown.map((entry) => entry.text)).toContain('CO: cards unknown')
    expect(summary.result).toBe('Winner not recorded')
    expect(checkDraft(setup, toRiver()).gaps).toEqual(expect.arrayContaining(["CO's cards", 'Winner']))
  })

  it('records an opponent win and a split', () => {
    const setup = table()
    expect(summarizeDraft(setup, setWinners(toRiver(), [CO])).result).toBe('CO wins')
    expect(summarizeDraft(setup, setWinners(toRiver(), [CO, HERO])).result).toBe('Split pot: CO and Hero')
  })

  it('warns when the recorded winner disagrees with the cards', () => {
    const setup = table()
    let draft = toRiver()
    ;['Tc', '8h', '2c'].forEach((text, index) => (draft = setBoardCard(draft, 'flop', index, card(text))))
    draft = setBoardCard(draft, 'turn', 0, card('Kc'))
    draft = setBoardCard(draft, 'river', 0, card('9d'))
    draft = setShowdown(draft, CO, 'shown', { cards: [card('Qh'), card('Js')], suited: null })
    // CO has the straight.
    draft = setWinners(draft, [HERO])
    expect(checkDraft(setup, draft).warnings[0]).toMatch(/give the pot to CO/)
  })
})

describe('exact reconstruction through the engine', () => {
  function fullHand(): HandDraft {
    const setup = table()
    let draft = heroVsCo()
    const [open, threeBet] = draft.streets[0]!.actions
    draft = setActionAmount(draft, 'preflop', open!.id, 1_500)
    draft = setActionAmount(draft, 'preflop', threeBet!.id, 4_500)
    ;['Tc', '8h', '2c'].forEach((text, index) => (draft = setBoardCard(draft, 'flop', index, card(text))))
    draft = addActions(draft, setup, 'flop', [
      { seat: CO, action: 'check' },
      { seat: HERO, action: 'bet', amount: 5_000 },
      { seat: CO, action: 'call' },
    ])
    draft = setBoardCard(draft, 'turn', 0, card('Kc'))
    draft = addActions(draft, setup, 'turn', [
      { seat: CO, action: 'check' },
      { seat: HERO, action: 'check' },
    ])
    draft = setBoardCard(draft, 'river', 0, card('9d'))
    draft = addActions(draft, setup, 'river', [
      { seat: CO, action: 'check' },
      { seat: HERO, action: 'bet', amount: 10_000 },
      { seat: CO, action: 'call' },
    ])
    draft = setShowdown(draft, CO, 'mucked')
    return setWinners(draft, [HERO])
  }

  it('matches the same hand recorded live', () => {
    const setup = table()
    const live = new Hand({ ...setup, heroCards: ['As', 'Kd'] })
    live.act(3, 'fold').act(4, 'fold').act(CO, 'raise', 1_500).act(HERO, 'raise', 4_500)
    live.act(SB, 'fold').act(BB, 'fold').act(CO, 'call')
    live.deal('flop', ['Tc', '8h', '2c']).act(CO, 'check').act(HERO, 'bet', 5_000).act(CO, 'call')
    live.deal('turn', ['Kc']).act(CO, 'check').act(HERO, 'check')
    live.deal('river', ['9d']).act(CO, 'check').act(HERO, 'bet', 10_000).act(CO, 'call')
    const liveResult = computeResult(live.setup, live.state, [HERO])

    const rebuilt = reconstructHand(setup, fullHand())
    expect(rebuilt.exact).toBe(true)
    if (!rebuilt.exact) return
    expect(rebuilt.state.pot).toBe(live.state.pot)
    expect(rebuilt.state.pot).toBe(200 + 500 + 2 * 4_500 + 2 * 5_000 + 2 * 10_000)
    expect(rebuilt.result.heroResult).toBe(liveResult.heroResult)
    expect(rebuilt.setup.heroCards).toEqual(['As', 'Kd'])
  })

  it('needs no cards to work out the pot', () => {
    const setup = table()
    let draft = fullHand()
    draft = { ...draft, hero: { cards: [rank('A'), rank('K')], suited: true } }
    draft = { ...draft, streets: draft.streets.map((street) => ({ ...street, cards: street.cards.map(() => ({ rank: null, suit: null })) })) }
    const rebuilt = reconstructHand(setup, draft)
    expect(rebuilt.exact).toBe(true)
    if (rebuilt.exact) {
      expect(rebuilt.state.board).toEqual([])
      expect(rebuilt.result.winners).toEqual([HERO])
    }
  })

  /** CO opens to $15, Hero 3-bets to $45, CO calls; then CO is all-in on the flop and Hero calls. */
  function flopAllIn(amount: number | null): HandDraft {
    const setup = table()
    let draft = heroVsCo()
    const [open, threeBet] = draft.streets[0]!.actions
    draft = setActionAmount(draft, 'preflop', open!.id, 1_500)
    draft = setActionAmount(draft, 'preflop', threeBet!.id, 4_500)
    draft = addActions(draft, setup, 'flop', [
      { seat: CO, action: 'allin', amount },
      { seat: HERO, action: 'call' },
    ])
    return setWinners(draft, [CO])
  }

  it('reads an all-in with no amount as everything left in the hand stack', () => {
    const setup = table()
    const rebuilt = reconstructHand(setup, flopAllIn(null))
    expect(rebuilt.exact).toBe(true)
    if (!rebuilt.exact) return
    // Every stack started at $1,000; CO had $955 left after the preflop $45.
    expect(rebuilt.state.pot).toBe(700 + 2 * 4_500 + 2 * 95_500)
    expect(rebuilt.setup.seats).toEqual(setup.seats)
    expect(checkDraft(setup, flopAllIn(null)).gaps).not.toContain("Flop: CO's all-in amount")
  })

  it('accepts an all-in amount that matches the stack left', () => {
    const rebuilt = reconstructHand(table(), flopAllIn(95_500))
    expect(rebuilt.exact).toBe(true)
    if (rebuilt.exact) expect(rebuilt.result.heroResult).toBe(-100_000)
  })

  it('reports an all-in amount that conflicts with the hand stack, and changes nothing', () => {
    const setup = table()
    const before = JSON.stringify(setup)
    const rebuilt = reconstructHand(setup, flopAllIn(31_000))
    expect(rebuilt.exact).toBe(false)
    if (rebuilt.exact) return
    expect(rebuilt.conflicts).toEqual([
      {
        seat: CO,
        message: "Flop: CO's all-in for $310 does not match the $955 they had in this hand",
        // The starting stack for this hand that would make $310 everything CO had.
        suggestedStartingStack: 35_500,
      },
    ])
    expect(rebuilt.missing).toEqual([rebuilt.conflicts[0]!.message])
    expect(JSON.stringify(setup)).toBe(before)
  })

  it('works the hand out once the stack is corrected for this hand', () => {
    const corrected = withHandStack(table(), CO, 35_500)
    expect(corrected.seats.find((seat) => seat.seat === CO)!.startingStack).toBe(35_500)
    expect(table().seats.find((seat) => seat.seat === CO)!.startingStack).toBe(100_000)
    const rebuilt = reconstructHand(corrected, flopAllIn(31_000))
    expect(rebuilt.exact).toBe(true)
    if (!rebuilt.exact) return
    expect(rebuilt.state.pot).toBe(700 + 2 * 4_500 + 2 * 31_000)
    expect(rebuilt.result.heroResult).toBe(-(4_500 + 31_000))
  })

  it('reports a bet larger than the hand stack instead of shrinking it', () => {
    const setup = withHandStack(table(), CO, 10_000)
    let draft = flopAllIn(null)
    draft = { ...draft, streets: draft.streets.slice(0, 1), winners: null }
    draft = addActions(draft, setup, 'flop', [{ seat: CO, action: 'bet', amount: 20_000 }])
    const rebuilt = reconstructHand(setup, draft)
    expect(rebuilt.exact).toBe(false)
    if (!rebuilt.exact) expect(rebuilt.conflicts[0]!.message).toBe("Flop: CO's bet to $200 is more than the $55 they could put in this hand")
  })

  it('round-trips a live hand: live → draft → engine gives the same money', () => {
    const live = new Hand(makeSetup({ seats: 6, buttonSeat: 6, heroSeat: 3, heroCards: ['As', 'Ks'] }))
    live.act(3, 'raise', 1500).act(4, 'call').act(5, 'fold').act(6, 'fold').act(1, 'fold').act(2, 'call')
    live.deal('flop', ['Kd', '8s', '3c'])
    live.act(2, 'check').act(3, 'bet', 2500).act(4, 'call').act(2, 'fold')
    live.deal('turn', ['2h']).act(3, 'check').act(4, 'check')
    live.deal('river', ['Qs']).act(3, 'bet', 5000).act(4, 'call')
    live.reveal(4, ['Kc', 'Qd'])
    const liveResult = computeResult(live.setup, live.state, [])

    const draft = draftFromEvents(live.setup, live.events)
    expect(draft.participants).toEqual([2, 3, 4])
    expect(draft.streets.map((street) => street.street)).toEqual(['preflop', 'flop', 'turn', 'river'])
    expect(draft.showdown).toEqual([{ seat: 4, status: 'shown', cards: { cards: [card('Kc'), card('Qd')], suited: null } }])
    expect(draft.winners).toEqual([4])
    expect(checkDraft(live.setup, draft).errors).toEqual([])

    const rebuilt = reconstructHand({ ...live.setup, heroCards: [] }, draft)
    expect(rebuilt.exact).toBe(true)
    if (!rebuilt.exact) return
    expect(rebuilt.state.pot).toBe(live.state.pot)
    expect(rebuilt.result.heroResult).toBe(liveResult.heroResult)
    expect(rebuilt.result.winners).toEqual(liveResult.winners)
  })
})

describe('untrusted drafts', () => {
  it('round-trips through JSON', () => {
    const issues: string[] = []
    const draft = setFlopSuits(setBoardCard(heroVsCo(), 'flop', 0, rank('T')), { kind: 'two-tone', suit: 'c' })
    expect(parseDraft(JSON.parse(JSON.stringify(draft)), issues)).toEqual(draft)
    expect(issues).toEqual([])
  })

  it('reports bad cards, amounts, seats and versions', () => {
    const issues: string[] = []
    const draft = JSON.parse(JSON.stringify(heroVsCo())) as Record<string, unknown> & { streets: { actions: Record<string, unknown>[] }[] }
    draft.streets[0]!.actions[0]!.amount = 12.5
    draft.streets[0]!.actions[1]!.seat = 42
    ;(draft.hero as { cards: unknown[] }).cards[0] = { rank: 'Z', suit: 'x' }
    parseDraft(draft, issues)
    expect(issues).toEqual(
      expect.arrayContaining([
        'preflop action 1 amount must be a whole number of cents.',
        'preflop action 2 seat must be a seat number between 1 and 10.',
        "Hero's cards (first card) has an unknown rank.",
      ]),
    )
    const versionIssues: string[] = []
    expect(parseDraft({ ...draft, version: 7 }, versionIssues)).toBeNull()
    expect(versionIssues[0]).toMatch(/version 7/)
  })
})

describe('undo', () => {
  it('removes the last action on a street', () => {
    const setup = table()
    const draft = undoAction(heroVsCo(), 'preflop')
    expect(draft.streets[0]!.actions).toHaveLength(2)
    expect(handFlow(setup, draft)[0]!.toAct).toEqual([CO])
  })
})
