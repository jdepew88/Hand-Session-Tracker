import type { HoleCardsMemory } from '../../src/domain/poker/draft/model'
import { flowFor } from '../../src/domain/poker/draft/flow'
import { boardText, effectiveWinners, holeCardsText, streetActionWords } from '../../src/domain/poker/draft/text'
import { STREETS, type Street } from '../../src/domain/poker/models'
import { corpusTable } from '../../src/domain/poker/narration/fixtures/table'
import { buildNarrationDraft, type NarrationOutcome } from '../../src/domain/poker/narration/normalize'
import type { NarrationCard, NarrationInterpretation } from '../../src/domain/poker/narration/schema'
import type { AnswerRule, EvalCase, Expected } from './cases'

/**
 * Scores one real-model response against an evaluation case.
 *
 * The response goes through the same deterministic normaliser the app
 * uses, the scripted narrator answers any questions it asks, and the hand
 * that results is compared with the case's tolerant expectations. The raw
 * response is separately checked for INVENTED facts: a suit, rank, amount,
 * seat, position or opponent hand that nothing in the narration supports.
 *
 * Pure and deterministic: no network. The live runner (`live.eval.ts`)
 * feeds it provider output; `score.test.ts` feeds it hand-made responses.
 */

/* ======================================================== text support */

const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
}
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 }
const isNumberWord = (word: string) => word in UNITS || word in TENS || word === 'hundred' || word === 'thousand'

function evaluateWords(words: string[]): number[] {
  const values: number[] = []
  // Standard: "three hundred twenty five".
  let total = 0
  let current = 0
  for (const word of words) {
    if (word === 'hundred') current = (current || 1) * 100
    else if (word === 'thousand') {
      total += (current || 1) * 1000
      current = 0
    } else current += UNITS[word] ?? TENS[word] ?? 0
  }
  values.push(total + current)
  // Colloquial: "one twenty" = 120, "two fifty" = 250.
  const [first, ...rest] = words
  const head = first ? UNITS[first] : undefined
  if (head !== undefined && head >= 1 && head <= 9 && rest.length > 0 && !rest.includes('hundred')) {
    const tail = evaluateWords(rest)[0]!
    if (tail >= 10 && tail < 100) values.push(head * 100 + tail)
  }
  return values
}

/** Every number the narration could be saying, in dollars. Lenient by design. */
export function numbersIn(text: string): Set<number> {
  const found = new Set<number>()
  for (const match of text.matchAll(/(\d+(?:\.\d+)?)\s*(k\b)?/gi)) {
    const value = Number(match[1])
    found.add(match[2] ? value * 1000 : value)
  }
  const words = text.toLowerCase().split(/[^a-z]+/)
  for (let start = 0; start < words.length; start++) {
    const isA = words[start] === 'a' && words[start + 1] === 'hundred'
    if (!isNumberWord(words[start]!) && !isA) continue
    for (let end = start + 1; end <= Math.min(words.length, start + 5); end++) {
      const run = words.slice(start, end).map((word) => (word === 'a' ? 'one' : word))
      if (!run.every(isNumberWord)) break
      for (const value of evaluateWords(run)) found.add(value)
    }
  }
  return found
}

const RANK_WORDS: Record<string, string> = {
  ace: 'A', aces: 'A', king: 'K', kings: 'K', queen: 'Q', queens: 'Q', jack: 'J', jacks: 'J', ten: 'T', tens: 'T',
  nine: '9', nines: '9', eight: '8', eights: '8', seven: '7', sevens: '7', six: '6', sixes: '6', five: '5', fives: '5',
  four: '4', fours: '4', three: '3', threes: '3', trey: '3', treys: '3', two: '2', twos: '2', deuce: '2', deuces: '2',
}

/** Card-shorthand tokens: "AK", "T82r", "AsKsQs", "AKss", "9d", "T82cc". Case-sensitive: ranks upper, suits lower. */
const compactTokens = (text: string) => text.split(/[^A-Za-z0-9]+/).filter((token) => /^(?:10|[2-9TJQKA])(?:10|[2-9TJQKAshdcrox])*$/.test(token))

export function ranksIn(text: string): Set<string> {
  const found = new Set<string>()
  for (const word of text.toLowerCase().split(/[^a-z]+/)) if (RANK_WORDS[word]) found.add(RANK_WORDS[word])
  for (const token of compactTokens(text)) {
    for (const char of token.replace(/10/g, 'T')) if (/[2-9TJQKA]/.test(char)) found.add(char)
  }
  return found
}

export function suitsIn(text: string): Set<string> {
  const found = new Set<string>()
  const lower = text.toLowerCase()
  const add = (suits: string) => [...suits].forEach((suit) => found.add(suit))
  if (/spade|♠/.test(lower)) add('s')
  if (/heart|♥/.test(lower)) add('h')
  if (/diamond|♦/.test(lower)) add('d')
  if (/club|♣/.test(lower)) add('c')
  if (/\bred\b/.test(lower)) add('hd')
  if (/\bblack\b/.test(lower)) add('sc')
  for (const token of compactTokens(text)) {
    for (const match of token.matchAll(/[2-9TJQKA]([shdc])/g)) add(match[1]!)
    const pair = /([shdc])\1$/.exec(token)
    if (pair) add(pair[1]!)
  }
  return found
}

const POSITION_WORDS: Record<string, RegExp> = {
  BTN: /\b(button|btn|dealer)\b/,
  SB: /\b(small blind|sb|small)\b/,
  BB: /\b(big blind|bb)\b/,
  UTG: /\b(utg|under the gun)\b/,
  'UTG+1': /utg ?\+ ?1|utg ?plus ?one|\butg1\b|under the gun plus one/,
  'UTG+2': /utg ?\+ ?2|utg ?plus ?two|\butg2\b|under the gun plus two/,
  'UTG+3': /utg ?\+ ?3|utg ?plus ?three|\butg3\b|under the gun plus three/,
  LJ: /\b(lojack|lowjack|low jack|lj)\b/,
  HJ: /\b(hijack|hi-jack|hi jack|high jack|hj)\b/,
  CO: /\b(cutoff|cut-off|cut off|co)\b/,
}

export function positionsIn(text: string): Set<string> {
  const lower = text.toLowerCase()
  return new Set(Object.entries(POSITION_WORDS).filter(([, pattern]) => pattern.test(lower)).map(([position]) => position))
}

export function seatsIn(text: string): Set<number> {
  const found = new Set<number>()
  for (const match of text.toLowerCase().matchAll(/\bseat\s*(\d+|[a-z]+)\b/g)) {
    const value = Number(match[1]) || UNITS[match[1]!]
    if (value) found.add(value)
  }
  return found
}

/* ============================================================ answers */

const matches = (expected: Expected, actual: string | null) =>
  actual !== null && (typeof expected === 'string' ? expected === actual : expected.test(actual))

/**
 * Build the draft, answer its questions as the case's narrator would, and
 * build again, until nothing more can be answered. Returns the first
 * outcome (what the player sees before answering) and the last.
 */
export function answerAsNarrator(interpretation: NarrationInterpretation, rules: AnswerRule[] = []) {
  const table = corpusTable()
  const answers: Record<string, string> = {}
  const build = () => buildNarrationDraft(interpretation, table.context, table.setup, answers)
  const first = build()
  let outcome = first
  const seen = new Map<AnswerRule, string[]>()
  for (let round = 0; round < 8; round++) {
    let changed = false
    for (const question of outcome.questions) {
      if (question.answer !== null || !question.required) continue
      const haystack = `${question.id} ${question.question} ${question.said ?? ''}`
      const rule = rules.find((entry) => entry.ask.test(haystack))
      if (!rule) continue
      let pick: string | undefined
      if (typeof rule.pick === 'string') pick = rule.pick
      else if (rule.pick instanceof RegExp) pick = question.options.find((option) => (rule.pick as RegExp).test(option.label))?.id
      else {
        const ids = seen.get(rule) ?? []
        if (!ids.includes(question.id)) ids.push(question.id)
        seen.set(rule, ids)
        pick = rule.pick[ids.indexOf(question.id)]
      }
      if (pick !== undefined && question.options.some((option) => option.id === pick) && answers[question.id] !== pick) {
        answers[question.id] = pick
        changed = true
      }
    }
    if (!changed) break
    outcome = build()
  }
  return { first, last: outcome, answers }
}

/* ============================================================== score */

export type Verdict = 'correct' | 'clarified' | 'wrong' | 'failed'

export interface Tally {
  passed: number
  total: number
}

export interface CaseScore {
  caseId: string
  verdict: Verdict
  /** Why the parse failed, when it did. */
  failure: string | null
  /** Named checks: true passed, false failed. Only what the case expects. */
  checks: Record<string, boolean>
  /** Item-level tallies for the accuracy figures. */
  tallies: Record<'cards' | 'actions' | 'amounts' | 'ratios' | 'showdown' | 'players', Tally>
  /** Facts the RAW response states that nothing in the narration supports. */
  inventions: string[]
  /** Invented facts that survived into the hand (after the deterministic layer). */
  draftInventions: string[]
  /** Reaching beyond the words without inventing: computed amounts, unasked questions. */
  overInterpretations: string[]
  /** Required questions before any answer, by kind. */
  asked: string[]
  /** Required questions the scripted narrator could not answer. */
  unanswered: string[]
  contradictionFlagged: boolean
  falseContradiction: boolean
  /** What went wrong, in words, for the report. */
  problems: string[]
  /** A digest of the final hand, to compare repeated runs. */
  fingerprint: string
}

const tally = (): Tally => ({ passed: 0, total: 0 })

function heroAndBoardCards(interpretation: NarrationInterpretation): { where: string; card: NarrationCard }[] {
  const cards: { where: string; card: NarrationCard }[] = []
  interpretation.heroCards?.cards.forEach((card) => cards.push({ where: "Hero's cards", card }))
  for (const street of interpretation.streets) street.board?.cards.forEach((card) => cards.push({ where: `${street.street} board`, card }))
  for (const entry of interpretation.showdown) entry.cards?.cards.forEach((card) => cards.push({ where: `showdown (${entry.who ?? '?'})`, card }))
  return cards
}

function draftCards(outcome: NarrationOutcome): { where: string; rank: string | null; suit: string | null }[] {
  const { draft } = outcome
  const cards: { where: string; rank: string | null; suit: string | null }[] = []
  draft.hero.cards.forEach((card) => cards.push({ where: "Hero's cards", ...card }))
  for (const street of draft.streets) street.cards.forEach((card) => cards.push({ where: `${street.street} board`, ...card }))
  for (const entry of draft.showdown) entry.cards?.cards.forEach((card) => cards.push({ where: `seat ${entry.seat} showdown`, ...card }))
  return cards
}

function actionWords(outcome: NarrationOutcome, street: Street) {
  const flow = flowFor(outcome.setup, outcome.draft, street)
  return streetActionWords(outcome.setup, flow).map((word) => {
    // A call's amount is implied by the bet; only the words matter.
    const short = word.token === 'CALL' || word.token === 'LIMP' ? `${word.who} ${word.token.toLowerCase()}` : word.short
    return { short, seat: word.seat, fold: word.token === 'FOLD' }
  })
}

const stripAmount = (text: string) => text.replace(/ (?:to |for )?\$[\d,.]+$/, '')

const handText = (cards: HoleCardsMemory | null) => (cards ? holeCardsText(cards) : 'Not recorded')

export function scoreCase(entry: EvalCase, interpretation: NarrationInterpretation | null, failure: string | null = null): CaseScore {
  const empty = {
    caseId: entry.id,
    checks: {},
    tallies: { cards: tally(), actions: tally(), amounts: tally(), ratios: tally(), showdown: tally(), players: tally() },
    inventions: [],
    draftInventions: [],
    overInterpretations: [],
    asked: [],
    unanswered: [],
    contradictionFlagged: false,
    falseContradiction: false,
    problems: [],
    fingerprint: 'failed',
  }
  if (!interpretation) return { ...empty, verdict: 'failed', failure: failure ?? 'no response', problems: [`Parse failed: ${failure ?? 'no response'}`] }

  const { expect: want, text } = entry
  const { first, last } = answerAsNarrator(interpretation, entry.answers)
  const score: CaseScore = { ...empty, verdict: 'wrong', failure: null, checks: {}, tallies: { ...empty.tallies }, problems: [] }
  const check = (name: string, ok: boolean, problem: string) => {
    score.checks[name] = ok
    if (!ok) score.problems.push(problem)
  }
  const count = (bucket: keyof CaseScore['tallies'], ok: boolean) => {
    score.tallies[bucket] = { passed: score.tallies[bucket].passed + (ok ? 1 : 0), total: score.tallies[bucket].total + 1 }
  }

  /* ---------------------------------------------- inventions (raw) */

  const ranks = ranksIn(text)
  const suits = suitsIn(text)
  const numbers = numbersIn(text)
  const seats = seatsIn(text)
  const positions = new Set([...positionsIn(text), ...(entry.allowPositions ?? [])])
  const derived = new Set(entry.derivedAmounts ?? [])

  for (const { where, card } of heroAndBoardCards(interpretation)) {
    if (card.rank && !ranks.has(card.rank)) score.inventions.push(`rank ${card.rank} in ${where}`)
    if (card.suit && !suits.has(card.suit)) score.inventions.push(`suit ${card.suit} in ${where}`)
  }
  const amount = (dollars: number, where: string) => {
    if (numbers.has(dollars)) return
    if (derived.has(dollars)) score.overInterpretations.push(`computed $${dollars} (${where})`)
    else score.inventions.push(`amount $${dollars} (${where})`)
  }
  for (const street of interpretation.streets) {
    for (const item of street.items) {
      const sizes = item.type === 'action' ? [item.size] : item.type === 'unclear' ? item.options.map((option) => option.size) : []
      for (const size of sizes) if (size && size.kind !== 'pot') amount(size.dollars, `${street.street}: ${item.said}`)
    }
  }
  if (interpretation.pot) amount(interpretation.pot.dollars, 'pot')
  for (const person of interpretation.people) {
    if (person.seat !== null && !seats.has(person.seat)) score.inventions.push(`seat ${person.seat} for ${person.phrases.join('/')}`)
    if (person.position && !positions.has(person.position)) score.inventions.push(`position ${person.position} for ${person.phrases.join('/')}`)
  }
  for (const claim of interpretation.heroPositions) if (!positions.has(claim.position)) score.inventions.push(`Hero position ${claim.position}`)
  if (interpretation.button && !seats.has(interpretation.button.seat)) score.inventions.push(`button seat ${interpretation.button.seat}`)
  if (!want.shownCards) {
    for (const entry of interpretation.showdown) if (entry.who !== 'hero' && entry.cards) score.inventions.push(`opponent hand for ${entry.who ?? '?'}`)
  }

  /* ---------------------------------------- inventions (the hand) */

  for (const card of draftCards(last)) {
    if (card.rank && !ranks.has(card.rank)) score.draftInventions.push(`rank ${card.rank} in ${card.where}`)
    if (card.suit && !suits.has(card.suit)) score.draftInventions.push(`suit ${card.suit} in ${card.where}`)
  }
  const expectedAmounts = new Set(
    Object.values(want.actions ?? {})
      .flat()
      .flatMap((words) => (typeof words === 'string' ? [...words.matchAll(/\$([\d,]+)/g)].map((match) => Number(match[1]!.replace(/,/g, ''))) : [])),
  )
  for (const street of last.draft.streets) {
    for (const action of street.actions) {
      if (action.amount === null) continue
      const dollars = action.amount / 100
      if (numbers.has(dollars) || expectedAmounts.has(dollars)) continue
      if (derived.has(dollars)) continue
      score.draftInventions.push(`amount $${dollars} on the ${street.street}`)
    }
  }
  for (const entry of last.draft.showdown) {
    const described = entry.cards?.cards.some((card) => card.rank !== null || card.suit !== null)
    if (entry.seat !== last.setup.heroSeat && described && !want.shownCards?.[entry.seat]) score.draftInventions.push(`opponent hand for seat ${entry.seat}`)
  }

  /* ------------------------------------------------------ questions */

  const kind = (id: string) => id.split(':')[0]!
  score.asked = [...new Set(first.questions.filter((question) => question.required).map((question) => kind(question.id)))]
  score.unanswered = last.questions.filter((question) => question.required && question.answer === null).map((question) => question.id)
  for (const ask of want.asks ?? []) {
    const ok = ask.split('|').some((option) => score.asked.includes(option))
    check(`asks ${ask}`, ok, `Expected a ${ask} question; none was asked.`)
    if (!ok) score.overInterpretations.push(`resolved itself what needed a ${ask} question`)
  }

  score.contradictionFlagged =
    interpretation.contradictions.length > 0 ||
    new Set(interpretation.heroPositions.map((claim) => claim.position)).size > 1 ||
    first.questions.some((question) => question.id === 'hero-position' || question.id === 'button') ||
    first.facts.some((fact) => fact.source === 'conflict' && fact.id.startsWith('who:'))
  if (want.contradiction) check('contradiction', score.contradictionFlagged, 'The contradiction was not flagged.')
  score.falseContradiction = !want.contradiction && interpretation.contradictions.length > 0

  /* --------------------------------------------------------- checks */

  const { draft, setup } = last
  const foldOnly = (seat: number) => draft.streets.every((street) => street.actions.filter((action) => action.seat === seat).every((action) => action.action === 'fold'))

  if (want.button !== undefined) {
    const ok = setup.buttonSeat === want.button
    count('players', ok)
    check('button', ok, `Button: expected seat ${want.button}, got seat ${setup.buttonSeat}.`)
  }
  if (want.participants) {
    const actual = [...draft.participants].sort((a, b) => a - b)
    const missing = want.participants.filter((seat) => !actual.includes(seat))
    const extra = actual.filter((seat) => !want.participants!.includes(seat) && !foldOnly(seat))
    const ok = missing.length === 0 && extra.length === 0
    count('players', ok)
    check('participants', ok, `Players: expected seats ${want.participants.join(', ')}, got ${actual.join(', ') || 'none'}.`)
  }
  if (want.heroCards !== undefined) {
    const actual = handText(draft.hero)
    const ok = matches(want.heroCards, actual)
    count('cards', ok)
    check('heroCards', ok, `Hero's cards: expected ${String(want.heroCards)}, got ${actual}.`)
  }
  for (const [street, expected] of Object.entries(want.boards ?? {}) as [Exclude<Street, 'preflop'>, Expected | null][]) {
    const found = draft.streets.find((entry) => entry.street === street)
    const actual = found ? boardText(found) : null
    const ok = expected === null ? actual === null : matches(expected, actual)
    count('cards', ok)
    check(`board ${street}`, ok, `${street} board: expected ${expected === null ? 'nothing' : String(expected)}, got ${actual ?? 'nothing'}.`)
  }
  for (const street of STREETS) {
    const expected = want.actions?.[street]
    if (!expected) continue
    const mentioned = (seat: number) => (want.participants ?? []).includes(seat)
    const actual = actionWords(last, street).filter((word) => !word.fold || mentioned(word.seat) || expected.some((entry) => typeof entry === 'string' && entry === word.short))
    const words = actual.map((word) => word.short)
    const verbsOk = expected.length === words.length && expected.every((entry, index) => (typeof entry === 'string' ? stripAmount(entry) === stripAmount(words[index]!) : entry.test(words[index]!)))
    const fullOk = expected.length === words.length && expected.every((entry, index) => matches(entry, words[index]!))
    expected.forEach((entry, index) => {
      const got = words[index] ?? null
      count('actions', got !== null && (typeof entry === 'string' ? stripAmount(entry) === stripAmount(got) : entry.test(got)))
      if (typeof entry !== 'string' || entry.includes('$')) count('amounts', matches(entry, got))
    })
    if (words.length > expected.length) for (let index = expected.length; index < words.length; index++) count('actions', false)
    check(`actions ${street}`, verbsOk, `${street} actions: expected [${expected.map(String).join(' | ')}], got [${words.join(' | ')}].`)
    if (verbsOk) check(`amounts ${street}`, fullOk, `${street} amounts: expected [${expected.map(String).join(' | ')}], got [${words.join(' | ')}].`)
  }
  for (const { street, ratio } of want.ratios ?? []) {
    const said = interpretation.streets.find((entry) => entry.street === street)
    const sizes = (said?.items ?? []).flatMap((item) => (item.type === 'action' ? [item.size] : item.type === 'unclear' ? item.options.map((option) => option.size) : []))
    const ok = sizes.some((size) => size?.kind === 'pot' && Math.abs(size.ratio - ratio) <= 0.04)
    count('ratios', ok)
    check(`ratio ${street}`, ok, `${street}: expected a ${ratio} pot fraction, got ${JSON.stringify(sizes.filter(Boolean))}.`)
  }
  for (const [seat, status] of Object.entries(want.showdown ?? {})) {
    const actual = draft.showdown.find((entry) => entry.seat === Number(seat))?.status ?? 'none'
    const ok = actual === status
    count('showdown', ok)
    check(`showdown ${seat}`, ok, `Seat ${seat} showdown: expected ${status}, got ${actual}.`)
  }
  for (const [seat, cards] of Object.entries(want.shownCards ?? {})) {
    const actual = handText(draft.showdown.find((entry) => entry.seat === Number(seat))?.cards ?? null)
    const ok = matches(cards, actual)
    count('cards', ok)
    check(`shown ${seat}`, ok, `Seat ${seat} shown: expected ${String(cards)}, got ${actual}.`)
  }
  if (want.winners) {
    const actual = [...(effectiveWinners(setup, draft) ?? [])].sort((a, b) => a - b)
    const ok = actual.join(',') === [...want.winners].sort((a, b) => a - b).join(',')
    count('showdown', ok)
    check('winners', ok, `Winners: expected ${want.winners.join(', ')}, got ${actual.join(', ') || 'none'}.`)
  }

  if (score.inventions.length > 0) score.problems.push(`Invented (raw): ${score.inventions.join('; ')}.`)
  if (score.draftInventions.length > 0) score.problems.push(`Invented (in the hand): ${score.draftInventions.join('; ')}.`)
  if (score.unanswered.length > 0) score.problems.push(`Unanswerable questions: ${score.unanswered.join(', ')}.`)

  const allPassed = Object.values(score.checks).every(Boolean)
  score.verdict = !allPassed || score.draftInventions.length > 0 || score.unanswered.length > 0 ? 'wrong' : score.asked.length === 0 ? 'correct' : 'clarified'
  score.fingerprint = JSON.stringify({
    button: setup.buttonSeat,
    players: [...draft.participants].sort(),
    hero: handText(draft.hero),
    boards: draft.streets.map((street) => boardText(street)),
    actions: STREETS.map((street) => actionWords(last, street).map((word) => word.short)),
    showdown: draft.showdown.map((entry) => [entry.seat, entry.status, handText(entry.cards)]),
    winners: effectiveWinners(setup, draft),
    asked: score.asked,
  })
  return score
}
