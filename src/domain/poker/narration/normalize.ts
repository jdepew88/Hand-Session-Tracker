import { formatCents, type Cents } from '../../money'
import { checkDraft } from '../draft/check'
import { flowFor } from '../draft/flow'
import { UNKNOWN_CARD, type CardMemory, type DraftActionKind, type FlopSuits, type HandDraft, type HoleCardsMemory } from '../draft/model'
import {
  addAction,
  createDraft,
  reachStreet,
  setBoardCard,
  setFlopSuits,
  setHeroCards,
  setParticipants,
  setPot,
  setShowdown,
  setWinners,
} from '../draft/ops'
import { potBeforeAction } from '../draft/reconstruct'
import { STREET_TITLE, boardSpoken, boardText, holeCardsSpoken, holeCardsText } from '../draft/text'
import type { HandSetup, Street } from '../models'
import { STREETS } from '../models'
import { resolveReference, type SeatReference } from '../playerRefs'
import { derivePositions } from '../positions'
import { positionName } from '../tableView'
import type { NarrationContext } from './context'
import type {
  ActorRef,
  NarrationActionKind,
  NarrationBoard,
  NarrationHole,
  NarrationInterpretation,
  NarrationItem,
  NarrationPosition,
  NarrationSize,
} from './schema'
import { cardsKey, dollarsToCents, parsePosition, parseSeatNumber, parseSpokenCards, type SpokenCards } from './spoken'

/**
 * From what a parser says the narration contains to the existing Quick
 * Reconstruct draft -- deterministically, and through the same pure draft
 * operations the recorder's buttons use.
 *
 * The parser only reports words. Everything that has one right answer is
 * decided here: which seat "hoodie guy" or "the big blind" is, where the
 * button was in THIS hand, what "raise 80 more" comes to, whether "jack ten
 * of hearts" really says J♥ T♥. Nothing is guessed. A phrase that fits two
 * people, two positions given for Hero, or a clause with two readings
 * becomes a question; the draft is rebuilt from the answers, so a
 * clarification never needs another parser call.
 *
 * Every fact placed in the draft carries where it came from (explicit,
 * derived, interpreted, unknown, conflict) for the review screen. None of
 * that is stored in the hand: the saved hand is an ordinary draft, plus
 * short notes for remembered things the draft has no field for ("turn: a
 * brick", "bet 2/3 pot").
 */

export type Provenance = 'explicit' | 'derived' | 'interpreted' | 'unknown' | 'conflict'

/** How the review groups a fact: never a percentage. */
export type ReviewState = 'confirmed' | 'interpreted' | 'clarify' | 'unrecorded'

const STATE_FOR: Record<Provenance, ReviewState> = {
  explicit: 'confirmed',
  derived: 'confirmed',
  interpreted: 'interpreted',
  unknown: 'unrecorded',
  conflict: 'clarify',
}

export const REVIEW_STATE_WORD: Record<ReviewState, string> = {
  confirmed: 'Confirmed',
  interpreted: 'Interpreted',
  clarify: 'Needs clarification',
  unrecorded: 'Not recorded',
}

export interface ReviewFact {
  id: string
  state: ReviewState
  source: Provenance
  /** "Hero's position", "Turn". */
  topic: string
  /** "CO", "BB (Hoodie guy) bets 2/3 pot". */
  text: string
  /** The same, as a sentence for a screen reader: "Big blind bets two-thirds pot." */
  spoken: string
  /** The narrator's words, when they differ from `text`. */
  said: string | null
  /** How it was worked out: "from “big blind” and this hand's button". */
  detail: string | null
}

export interface Clarification {
  id: string
  question: string
  /** The words being asked about. */
  said: string | null
  /** Required questions must be answered before the draft is confirmed. */
  required: boolean
  options: { id: string; label: string }[]
  /** The option chosen so far, if any. */
  answer: string | null
}

export type NarrationAnswers = Readonly<Record<string, string>>

export interface NarrationOutcome {
  draft: HandDraft
  /** The hand's own setup: the table's, with the button where the narration put it. */
  setup: HandSetup
  facts: ReviewFact[]
  questions: Clarification[]
  /** Errors the existing draft check finds: the hand as built cannot have happened. */
  errors: string[]
  /** Remembered things with no place in the draft, kept as the hand's notes. */
  notes: string[]
  /** A step the narrator chose to fill in by hand ("Enter card"). */
  editAt: Street | 'cards' | null
}

/** Questions still blocking confirmation. */
export const openQuestions = (outcome: NarrationOutcome) => outcome.questions.filter((question) => question.required && question.answer === null)

const PRONOUNS = new Set([
  'he', 'him', 'his', 'she', 'her', 'hers', 'they', 'them', 'their', 'villain', 'villian', 'opponent', 'the opponent',
  'the other guy', 'other guy', 'the guy', 'guy', 'this guy', 'that guy', 'buddy', 'dude', 'v',
])

const isPronoun = (phrase: string) => PRONOUNS.has(phrase.trim().toLowerCase())

const RATIO_SPOKEN: Record<string, string> = {
  '0.25': 'a quarter pot',
  '0.33': 'a third of the pot',
  '0.5': 'half pot',
  '0.67': 'two-thirds pot',
  '0.75': 'three-quarters pot',
  '1': 'pot',
}
const RATIO_TEXT: Record<string, string> = { '0.25': '1/4 pot', '0.33': '1/3 pot', '0.5': '1/2 pot', '0.67': '2/3 pot', '0.75': '3/4 pot', '1': 'pot' }
const ratioText = (ratio: number) => RATIO_TEXT[String(ratio)] ?? `${ratio}x pot`
const ratioSpoken = (ratio: number) => RATIO_SPOKEN[String(ratio)] ?? `${ratio} times the pot`

const VERB: Record<DraftActionKind, string> = { fold: 'folds', check: 'checks', call: 'calls', bet: 'bets', raise: 'raises', allin: 'goes all-in' }

const quote = (text: string) => `“${text}”`

/* ================================================================= cards */

interface ReadCards {
  cards: CardMemory[]
  suited: boolean | null
  pattern: SpokenCards['pattern']
  patternSuit: SpokenCards['patternSuit']
  description: string | null
  source: Provenance
  detail: string | null
}

/**
 * The parser's reading of some cards, checked against the deterministic
 * reading of the same words. When the words are understood, they win: a
 * suit the narrator never said is dropped, never kept ("AK suited" is A K
 * suited, exact suits unknown -- not A♠ K♠).
 */
function readCards(
  said: string,
  slots: number,
  parsed: { cards: CardMemory[]; suited: boolean | null; pattern?: SpokenCards['pattern']; patternSuit?: SpokenCards['patternSuit']; description?: string | null },
): ReadCards {
  const spoken = said ? parseSpokenCards(said, slots) : null
  const fromParser: ReadCards = {
    cards: parsed.cards,
    suited: parsed.suited,
    pattern: parsed.pattern ?? null,
    patternSuit: parsed.patternSuit ?? null,
    description: parsed.description ?? null,
    source: 'interpreted',
    detail: null,
  }
  if (!spoken) return fromParser
  const same =
    cardsKey(spoken.cards) === cardsKey(parsed.cards) &&
    spoken.suited === parsed.suited &&
    spoken.pattern === (parsed.pattern ?? null) &&
    spoken.patternSuit === (parsed.patternSuit ?? null)
  const invented = parsed.cards.some((card, index) => card.suit !== null && spoken.cards[index]?.suit === null)
  return {
    cards: spoken.cards,
    suited: spoken.suited,
    pattern: spoken.pattern,
    patternSuit: spoken.patternSuit,
    description: spoken.description ?? parsed.description ?? null,
    source: 'explicit',
    detail: same ? null : invented ? 'Exact suits were not said, so they are left unknown.' : 'Read from your words.',
  }
}

function holeFrom(read: ReadCards): HoleCardsMemory {
  const cards = [read.cards[0] ?? { ...UNKNOWN_CARD }, read.cards[1] ?? { ...UNKNOWN_CARD }] as [CardMemory, CardMemory]
  return { cards, suited: read.suited }
}

function readHole(hole: NarrationHole): ReadCards {
  return readCards(hole.said, 2, { cards: hole.cards, suited: hole.suited })
}

function readBoard(board: NarrationBoard, street: Exclude<Street, 'preflop'>): ReadCards {
  return readCards(board.said, street === 'flop' ? 3 : 1, {
    cards: board.cards,
    suited: null,
    pattern: board.pattern,
    patternSuit: board.patternSuit,
    description: board.description,
  })
}

/* ================================================================ build */

/**
 * Build the draft for a narration. Pure: the same interpretation, table and
 * answers always give the same draft, facts and questions.
 */
export function buildNarrationDraft(
  interpretation: NarrationInterpretation,
  context: NarrationContext,
  table: HandSetup,
  answers: NarrationAnswers = {},
): NarrationOutcome {
  const facts: ReviewFact[] = []
  const questions: Clarification[] = []
  const notes: string[] = []
  let editAt: Street | 'cards' | null = null
  const dealt = table.seats.map((seat) => seat.seat).sort((a, b) => a - b)
  const hero = table.heroSeat
  const opponents = dealt.filter((seat) => seat !== hero)
  const contextSeat = new Map(context.seats.map((seat) => [seat.seat, seat]))

  const fact = (entry: Omit<ReviewFact, 'state' | 'spoken'> & { spoken?: string; state?: ReviewState }) =>
    facts.push({ ...entry, state: entry.state ?? STATE_FOR[entry.source], spoken: entry.spoken ?? `${entry.topic}: ${entry.text}.` })

  const ask = (question: Omit<Clarification, 'answer'>): string | null => {
    const given = answers[question.id]
    const answer = given !== undefined && question.options.some((option) => option.id === given) ? given : null
    questions.push({ ...question, answer })
    return answer
  }

  /* ----------------------------------------------- Hero's position */

  const heroClaims = [...new Map(interpretation.heroPositions.map((claim) => [claim.position, claim])).values()]
  let heroPosition: NarrationPosition | null = null
  if (heroClaims.length > 1) {
    const answer = ask({
      id: 'hero-position',
      question: 'Which position were you in?',
      said: heroClaims.map((claim) => quote(claim.said)).join(' and '),
      required: true,
      options: heroClaims.map((claim) => ({ id: claim.position, label: `${claim.position} · ${positionName(claim.position)}` })),
    })
    heroPosition = answer as NarrationPosition | null
    fact({
      id: 'hero-position',
      topic: "Hero's position",
      text: answer ?? heroClaims.map((claim) => claim.position).join(' or '),
      source: answer ? 'explicit' : 'conflict',
      said: heroClaims.map((claim) => claim.said).join(' … '),
      detail: answer ? 'You chose this. The description gave more than one position.' : 'The description puts you in more than one position.',
    })
  } else if (heroClaims.length === 1) {
    heroPosition = heroClaims[0]!.position
  }

  /* --------------------------------------- who each person could be */

  // References without positions: the button is not settled yet.
  const references: SeatReference[] = dealt.map((seat) => {
    const entry = contextSeat.get(seat)
    return {
      seat,
      playerId: null,
      isHero: seat === hero,
      label: entry?.label ?? table.seats.find((item) => item.seat === seat)?.label ?? null,
      aliases: entry?.aliases ?? [],
      tags: entry?.tags ?? [],
      position: null,
    }
  })
  const opponentRefs = references.filter((reference) => !reference.isHero)

  interface Constraint {
    seats: number[]
    why: string
    source: Provenance
  }

  const people = interpretation.people.map((person) => {
    const anchors: Constraint[] = []
    const positions = new Set<NarrationPosition>()
    if (person.position) positions.add(person.position)
    const unmatched: string[] = []
    if (person.seat !== null) {
      anchors.push({ seats: opponents.filter((seat) => seat === person.seat), why: `seat ${person.seat}`, source: 'explicit' })
    }
    for (const phrase of person.phrases) {
      if (isPronoun(phrase)) continue
      const position = parsePosition(phrase)
      if (position) {
        positions.add(position)
        continue
      }
      const seat = parseSeatNumber(phrase)
      if (seat !== null) {
        anchors.push({ seats: opponents.filter((entry) => entry === seat), why: quote(phrase), source: 'explicit' })
        continue
      }
      const matches = resolveReference(opponentRefs, phrase)
      if (matches.length === 0) {
        unmatched.push(phrase)
        continue
      }
      const via = matches[0]!.via
      anchors.push({
        seats: matches.map((match) => match.seat),
        why: `${quote(phrase)} (${via === 'tag' ? 'tagged' : via === 'alias' ? 'also called' : via === 'seat' ? 'seat' : 'label'})`,
        source: via === 'tag' ? 'derived' : 'explicit',
      })
    }
    const anchored = anchors.reduce<number[]>((seats, anchor) => seats.filter((seat) => anchor.seats.includes(seat)), opponents)
    return { person, anchors, anchored, positions: [...positions], unmatched }
  })

  /* --------------------------------------------- the hand's button */

  const claims: { seat: number; position: NarrationPosition; said: string }[] = []
  if (heroPosition) claims.push({ seat: hero, position: heroPosition, said: heroClaims.find((claim) => claim.position === heroPosition)?.said ?? '' })
  for (const entry of people) {
    if (entry.anchors.length > 0 && entry.anchored.length === 1 && entry.positions.length === 1) {
      claims.push({ seat: entry.anchored[0]!, position: entry.positions[0]!, said: entry.person.phrases.join(', ') })
    }
  }
  const statedButton = interpretation.button && dealt.includes(interpretation.button.seat) ? interpretation.button.seat : null
  const fits = (button: number, only = claims) => {
    const positions = derivePositions(dealt, button)
    return only.every((claim) => positions.get(claim.seat) === claim.position)
  }
  const candidates = dealt.filter((seat) => (statedButton === null || seat === statedButton) && fits(seat))

  let button = table.buttonSeat
  const tableButtonNote = `The table has the button on seat ${table.buttonSeat} now.`
  if (claims.length === 0 && statedButton === null) {
    // Nothing said: the table's button.
  } else if (candidates.includes(table.buttonSeat)) {
    // What was said fits the table as it is.
  } else if (candidates.length === 1) {
    button = candidates[0]!
    fact({
      id: 'button',
      topic: 'Button for this hand',
      text: `Seat ${button}`,
      source: statedButton !== null ? 'explicit' : 'derived',
      said: statedButton !== null ? interpretation.button!.said : claims.map((claim) => claim.said).join(', '),
      detail: `${statedButton !== null ? 'As you said.' : 'Worked out from the positions you gave.'} ${tableButtonNote} The Table is not changed.`,
    })
  } else {
    // The positions given do not fit one button: ask, offering each reading.
    const options = new Set<number>()
    for (const claim of claims) for (const seat of dealt) if (fits(seat, [claim])) options.add(seat)
    if (statedButton !== null) options.add(statedButton)
    options.add(table.buttonSeat)
    const answer = ask({
      id: 'button',
      question: 'Where was the button in this hand?',
      said: [...claims.map((claim) => claim.said), interpretation.button?.said ?? ''].filter(Boolean).map(quote).join(' and '),
      required: true,
      options: [...options].sort((a, b) => a - b).map((seat) => {
        const positions = derivePositions(dealt, seat)
        const heroAt = positions.get(hero)
        return { id: String(seat), label: `Seat ${seat}${heroAt ? ` (you ${heroAt})` : ''}${seat === table.buttonSeat ? ' · as at the table' : ''}` }
      }),
    })
    if (answer) button = Number(answer)
    fact({
      id: 'button',
      topic: 'Button for this hand',
      text: answer ? `Seat ${answer}` : 'Unclear',
      source: answer ? 'explicit' : 'conflict',
      said: claims.map((claim) => claim.said).join(', ') || null,
      detail: answer ? 'You chose this.' : 'The positions in the description do not fit a single button.',
    })
  }

  const setup: HandSetup = { ...table, buttonSeat: button }
  const handPositions = derivePositions(dealt, button)
  const position = (seat: number) => (handPositions.get(seat) as NarrationPosition | undefined) ?? null

  if (heroPosition && position(hero) === heroPosition && !facts.some((entry) => entry.id === 'hero-position')) {
    fact({ id: 'hero-position', topic: "Hero's position", text: heroPosition, source: 'explicit', said: heroClaims[0]!.said, detail: null })
  } else if (heroClaims.length === 0) {
    const at = position(hero)
    if (at) fact({ id: 'hero-position', topic: "Hero's position", text: at, source: 'derived', said: null, detail: 'From the table.' })
  }

  /* ------------------------------------------------- resolve people */

  const seatOf = new Map<string, number | null>()
  const name = (seat: number) => {
    if (seat === hero) return 'Hero'
    const label = references.find((reference) => reference.seat === seat)?.label
    const at = position(seat)
    return `${at ?? `Seat ${seat}`}${label ? ` (${label})` : ''}`
  }
  const spokenName = (seat: number) => {
    if (seat === hero) return 'Hero'
    const at = position(seat)
    const label = references.find((reference) => reference.seat === seat)?.label
    return `${at ? positionName(at) : `Seat ${seat}`}${label ? `, ${label},` : ''}`
  }
  const optionLabel = (seat: number) => {
    const label = references.find((reference) => reference.seat === seat)?.label
    const at = position(seat)
    return [`Seat ${seat}`, label, at].filter(Boolean).join(' · ')
  }
  const actorsInHand = new Set(
    interpretation.streets.flatMap((street) => street.items.flatMap((item) => (item.type === 'action' && item.actor && item.actor !== 'hero' ? [item.actor] : []))),
  )
  const headsUp = interpretation.people.length === 1

  for (const entry of people) {
    const { person, anchors, positions, unmatched } = entry
    const constraints: Constraint[] = [...anchors]
    if (positions.length === 1) {
      constraints.push({
        seats: opponents.filter((seat) => position(seat) === positions[0]),
        why: `${quote(positions[0]!)} in this hand`,
        source: 'derived',
      })
    } else if (positions.length > 1) {
      constraints.push({
        seats: opponents.filter((seat) => positions.includes(position(seat) as NarrationPosition)),
        why: positions.join(' or '),
        source: 'conflict',
      })
    }
    const together = constraints.reduce<number[]>((seats, constraint) => seats.filter((seat) => constraint.seats.includes(seat)), opponents)
    // "he" and "He" are one phrase.
    const phrases = [...new Map(person.phrases.filter(Boolean).map((phrase) => [phrase.toLowerCase(), phrase])).values()]
    const said = phrases.map(quote).join(', ') || 'someone'
    const only = constraints.length > 0 && together.length === 1 && !constraints.some((constraint) => constraint.source === 'conflict')

    if (only) {
      const seat = together[0]!
      seatOf.set(person.id, seat)
      const pronounOnly = phrases.every(isPronoun)
      fact({
        id: `who:${person.id}`,
        topic: 'Player',
        text: `${phrases[0] ?? 'Opponent'} → ${optionLabel(seat)}`,
        spoken: `Player: ${phrases[0] ?? 'opponent'} is seat ${seat}${position(seat) ? `, ${positionName(position(seat)!)}` : ''}.`,
        source: pronounOnly ? 'interpreted' : constraints.some((constraint) => constraint.source === 'derived') ? 'derived' : 'explicit',
        said: phrases.join(', '),
        detail: `Matched by ${constraints.map((constraint) => constraint.why).join(' and ')}.${unmatched.length > 0 ? ` ${unmatched.map(quote).join(', ')} matched nobody at the table.` : ''}`,
      })
      continue
    }

    // Not one seat: ask. A conflict offers every seat any of the clues point to.
    const conflict = constraints.length > 0 && together.length === 0
    const pool = conflict
      ? [...new Set(constraints.flatMap((constraint) => constraint.seats))].sort((a, b) => a - b)
      : together.length > 0 && constraints.length > 0
        ? together
        : opponents
    const answer = ask({
      id: `who:${person.id}`,
      question: phrases.length > 0 && !phrases.every(isPronoun) ? `Who does ${quote(phrases.find((phrase) => !isPronoun(phrase)) ?? phrases[0]!)} mean?` : `Who is ${said}?`,
      said: phrases.join(', '),
      required: actorsInHand.has(person.id) || !headsUp,
      options: [...pool.map((seat) => ({ id: String(seat), label: optionLabel(seat) })), { id: 'none', label: 'Leave them out' }],
    })
    const seat = answer && answer !== 'none' ? Number(answer) : null
    seatOf.set(person.id, seat)
    fact({
      id: `who:${person.id}`,
      topic: 'Player',
      text: seat !== null ? `${phrases[0] ?? 'Opponent'} → ${optionLabel(seat)}` : answer === 'none' ? `${said}: left out` : `${said}: unclear`,
      source: answer ? 'explicit' : conflict ? 'conflict' : 'unknown',
      state: answer ? 'confirmed' : 'clarify',
      said: phrases.join(', '),
      detail: answer
        ? 'You chose this.'
        : conflict
          ? `The clues disagree: ${constraints.map((constraint) => `${constraint.why} is ${constraint.seats.map((item) => `seat ${item}`).join(' or ') || 'nobody dealt in'}`).join('; ')}.`
          : constraints.length === 0
            ? unmatched.length > 0
              ? `${unmatched.map(quote).join(', ')} matched nobody at the table.`
              : 'Nothing in the description says which seat.'
            : `${together.length} players fit ${constraints.map((constraint) => constraint.why).join(' and ')}.`,
    })
  }

  // Two names for one seat ("the cutoff" and "hoodie guy") are simply the same player.
  const seatFor = (ref: ActorRef | null): number | null => {
    if (ref === null) return null
    if (ref === 'hero') return hero
    return seatOf.get(ref) ?? null
  }

  // Everything said about a player whose seat is not settled waits on that one
  // question, listed under it -- not as a wall of separate problems.
  const waiting = new Map<string, string[]>()
  const wait = (ref: ActorRef | null, said: string): boolean => {
    if (ref === null || ref === 'hero' || !seatOf.has(ref) || seatOf.get(ref) !== null) return false
    waiting.set(ref, [...(waiting.get(ref) ?? []), said])
    return true
  }

  /* -------------------------------------------------- the draft */

  let draft = createDraft(setup)
  const inHand = [hero, ...[...seatOf.values()].filter((seat): seat is number => seat !== null)]
  draft = setParticipants(draft, setup, [...new Set(inHand)])

  if (interpretation.heroCards) {
    const read = readHole(interpretation.heroCards)
    const hole = holeFrom(read)
    draft = setHeroCards(draft, hole)
    fact({
      id: 'hero-cards',
      topic: "Hero's cards",
      text: holeCardsText(hole),
      spoken: `Hero's cards: ${holeCardsSpoken(hole)}.`,
      source: read.source,
      said: interpretation.heroCards.said || null,
      detail: read.detail,
    })
  } else {
    fact({ id: 'hero-cards', topic: "Hero's cards", text: 'Not said', source: 'unknown', said: null, detail: null })
  }

  const streetsSaid = new Set(interpretation.streets.map((street) => street.street))
  const lastSaid = interpretation.streets.at(-1)?.street ?? 'preflop'
  for (const street of STREETS.slice(0, STREETS.indexOf(lastSaid) + 1)) {
    draft = reachStreet(draft, street)
    if (!streetsSaid.has(street)) {
      if (street === 'preflop') fact({ id: 'preflop:action', topic: 'Preflop', text: 'Action not described', source: 'unknown', said: null, detail: null })
      else fact({ id: `${street}:board`, topic: STREET_TITLE[street], text: 'Not described', source: 'unknown', said: null, detail: null })
    }
  }

  for (const narrated of interpretation.streets) {
    const street = narrated.street
    const title = STREET_TITLE[street]

    if (street !== 'preflop') {
      if (narrated.board) {
        const read = readBoard(narrated.board, street)
        read.cards.forEach((card, slot) => {
          draft = setBoardCard(draft, street, slot, card)
        })
        if (street === 'flop' && read.pattern) {
          const suits: FlopSuits = read.pattern === 'rainbow' ? { kind: 'rainbow' } : { kind: read.pattern, suit: read.patternSuit }
          draft = setFlopSuits(draft, suits)
        }
        const shown = draft.streets.find((entry) => entry.street === street)!
        const words = boardText(shown)
        const known = shown.cards.some((card) => card.rank !== null || card.suit !== null)
        if (read.description) notes.push(`${title}: ${read.description}`)
        const boardWords = known || read.pattern ? (words ?? 'Not recorded') : 'Not recorded'
        fact({
          id: `${street}:board`,
          topic: `${title} ${street === 'flop' ? 'cards' : 'card'}`,
          text: boardWords,
          spoken: `${title} ${street === 'flop' ? 'cards' : 'card'}: ${known || read.pattern ? boardSpoken(shown) : 'not recorded'}.`,
          source: known || read.pattern ? read.source : 'unknown',
          said: narrated.board.said || null,
          detail: read.description
            ? `You said ${quote(read.description)}, so the exact card is left unknown. The words are kept with the hand.`
            : read.detail ?? (shown.cards.some((card) => card.rank === null || card.suit === null) && known ? 'Only what you said is filled in.' : null),
        })
        if (shown.cards.some((card) => card.rank === null || card.suit === null) && street !== 'flop' && !known) {
          const answer = ask({
            id: `card:${street}`,
            question: `Exact ${street} card?`,
            said: narrated.board.said || null,
            required: false,
            options: [
              { id: 'unknown', label: "Don't remember" },
              { id: 'enter', label: 'Enter card' },
            ],
          })
          if (answer === 'enter') editAt = editAt ?? street
        }
      } else {
        fact({ id: `${street}:board`, topic: `${title} ${street === 'flop' ? 'cards' : 'card'}`, text: 'Not recorded', source: 'unknown', said: null, detail: null })
      }
    }

    if (narrated.forgotten) {
      fact({ id: `${street}:forgotten`, topic: title, text: 'Action not remembered', source: 'unknown', said: null, detail: 'Left unrecorded, as you said.' })
    }

    const items: (NarrationItem & { index: number })[] = narrated.items.map((item, index) => ({ ...item, index }))
    for (const item of items) {
      const factId = `${street}:${item.index}`
      if (item.type === 'folds-to') {
        const target = seatFor(item.target)
        fact({
          id: factId,
          topic: title,
          text: target !== null ? `Folds to ${name(target)}` : 'Folds around',
          spoken: `${title}: folds to ${target !== null ? spokenName(target) : 'the next player'}.`,
          source: 'derived',
          said: item.said || null,
          detail: 'Everyone before folded. Nothing is recorded for them.',
        })
        continue
      }

      if (item.type === 'checks-through') {
        const flow = flowFor(setup, draft, street)
        const checkers = [...flow.toAct]
        checkers.forEach((seat, order) => {
          draft = addAction(draft, setup, street, { seat, action: 'check', id: `n-${street}-${item.index}-${order}` })
        })
        fact({
          id: factId,
          topic: title,
          text: checkers.length > 0 ? `Checked through: ${checkers.map(name).join(', ')}` : 'Checked through',
          spoken: `${title}: checked through${checkers.length > 0 ? `, ${checkers.map(spokenName).join(', ')}` : ''}.`,
          source: checkers.length > 0 ? 'derived' : 'unknown',
          said: item.said || null,
          detail: checkers.length > 0 ? 'Everyone left to act checks, in the order of play.' : 'Nobody was left to act.',
        })
        continue
      }

      let action: { actor: ActorRef | null; action: NarrationActionKind; size: NarrationSize | null; said: string; shorthand: boolean; timing: 'tank' | 'snap' | null; actorSaid: string }
      let chosen = false
      if (item.type === 'unclear') {
        const answer = ask({
          id: `meaning:${street}:${item.index}`,
          question: `What did you mean by ${quote(item.said)}?`,
          said: item.said,
          required: true,
          options: [...item.options.map((option, index) => ({ id: String(index), label: option.label })), { id: 'skip', label: 'Leave it out' }],
        })
        if (answer === null || answer === 'skip') {
          fact({
            id: factId,
            topic: title,
            text: answer === 'skip' ? `Left out: ${quote(item.said)}` : quote(item.said),
            source: answer === 'skip' ? 'unknown' : 'conflict',
            said: item.said,
            detail: answer === 'skip' ? null : 'This could mean more than one thing.',
          })
          continue
        }
        const option = item.options[Number(answer)]!
        action = { actor: option.actor, action: option.action, size: option.size, said: item.said, shorthand: false, timing: null, actorSaid: '' }
        chosen = true
      } else {
        action = item
      }

      let seat = seatFor(action.actor)
      if (seat === null && action.actor === null) {
        const flow = flowFor(setup, draft, street)
        const pool = (flow.toAct.length > 0 ? flow.toAct : flow.live).filter((entry) => !flow.allIn.includes(entry))
        const answer = ask({
          id: `actor:${street}:${item.index}`,
          question: `Who ${action.said ? quote(action.said) : VERB[action.action]}?`,
          said: action.said || null,
          required: true,
          options: [...pool.map((entry) => ({ id: String(entry), label: entry === hero ? 'Hero' : optionLabel(entry) })), { id: 'skip', label: 'Leave it out' }],
        })
        seat = answer && answer !== 'skip' ? Number(answer) : null
        if (answer === 'skip') {
          fact({ id: factId, topic: title, text: `Left out: ${quote(action.said)}`, source: 'unknown', said: action.said, detail: null })
          continue
        }
      }
      if (seat === null) {
        if (wait(action.actor, action.said || VERB[action.action])) continue
        fact({
          id: factId,
          topic: title,
          text: `Not placed yet: ${quote(action.said || VERB[action.action])}`,
          source: 'conflict',
          state: 'clarify',
          said: action.said || null,
          detail: 'Waiting on who this was.',
        })
        continue
      }
      if (!draft.participants.includes(seat)) draft = setParticipants(draft, setup, [...draft.participants, seat])

      const sized = sizeAmount(setup, draft, street, seat, action.action, action.size, action.said)
      draft = addAction(draft, setup, street, { seat, action: action.action, amount: sized.amount, id: `n-${street}-${item.index}` })
      const placed = draft.streets.find((entry) => entry.street === street)!.actions.at(-1)!

      let sizeWords = sized.words
      let sizeSpoken = sized.spoken
      let source: Provenance = chosen ? 'explicit' : action.shorthand ? 'interpreted' : 'explicit'
      if (sized.source === 'interpreted' || sized.source === 'derived') source = source === 'explicit' ? sized.source : source
      const viaPronoun = action.actor !== 'hero' && action.actor !== null && isPronoun(action.actorSaid) && !headsUp
      if (viaPronoun) source = 'interpreted'

      if (sized.estimate !== null) {
        const answer = ask({
          id: `estimate:${street}:${item.index}`,
          question: `Use ${formatCents(sized.estimate)} for ${quote(ratioText(action.size!.kind === 'pot' ? action.size!.ratio : 1))}?`,
          said: action.said || null,
          required: false,
          options: [
            { id: 'use', label: `Use ${formatCents(sized.estimate)}` },
            { id: 'blank', label: 'Leave the amount blank' },
          ],
        })
        if (answer === 'use') {
          draft = {
            ...draft,
            streets: draft.streets.map((entry) =>
              entry.street === street
                ? { ...entry, actions: entry.actions.map((existing) => (existing.id === placed.id ? { ...existing, amount: sized.estimate } : existing)) }
                : entry,
            ),
          }
          sizeWords = `${formatCents(sized.estimate)} (${ratioText((action.size as { ratio: number }).ratio)})`
          sizeSpoken = `${formatCents(sized.estimate)}, ${ratioSpoken((action.size as { ratio: number }).ratio)}`
          source = 'derived'
        }
      }
      if (sized.note) notes.push(`${title}: ${name(seat)} ${VERB[placed.action]} ${sized.note}`)
      if (action.timing) notes.push(`${title}: ${name(seat)} ${action.timing === 'tank' ? 'tanked' : 'snapped'} before acting`)

      const verb = VERB[placed.action]
      const timing = action.timing ? ` (${action.timing})` : ''
      if (sized.source === 'unknown') {
        // The action happened; only its amount could not be worked out.
        fact({
          id: `${factId}:amount`,
          topic: title,
          text: `${name(seat)}'s ${placed.action} amount`,
          source: 'unknown',
          said: action.said || null,
          detail: sized.detail,
        })
      }
      fact({
        id: factId,
        topic: title,
        text: `${name(seat)} ${verb}${sizeWords ? ` ${sizeWords}` : ''}${timing}`,
        spoken: `${spokenName(seat)} ${verb}${sizeSpoken ? ` ${sizeSpoken}` : ''}.`,
        source,
        said: action.said || null,
        detail: [
          chosen ? 'You chose this reading.' : null,
          action.shorthand ? 'Read from poker shorthand.' : null,
          viaPronoun ? `${quote(action.actorSaid)} taken to be ${name(seat)}.` : null,
          sized.source === 'unknown' ? null : sized.detail,
        ]
          .filter(Boolean)
          .join(' ') || null,
      })
    }
  }

  /* ------------------------------------------------------- showdown */

  for (const [index, entry] of interpretation.showdown.entries()) {
    const seat = seatFor(entry.who)
    if (seat === null) {
      if (wait(entry.who, entry.said)) continue
      fact({ id: `showdown:${index}`, topic: 'Showdown', text: `Not placed: ${quote(entry.said)}`, source: 'conflict', state: 'clarify', said: entry.said, detail: 'Waiting on who this was.' })
      continue
    }
    if (seat === hero) {
      if (entry.status === 'shown' || entry.status === 'mucked') {
        if (entry.cards && draft.hero.cards.every((card) => card.rank === null && card.suit === null)) {
          const read = readHole(entry.cards)
          draft = setHeroCards(draft, holeFrom(read))
        }
        draft = setShowdown(draft, hero, entry.status)
        fact({ id: `showdown:${index}`, topic: 'Showdown', text: `Hero ${entry.status === 'shown' ? 'shows' : 'mucks'}`, source: 'explicit', said: entry.said || null, detail: null })
      }
      continue
    }
    if (!draft.participants.includes(seat)) draft = setParticipants(draft, setup, [...draft.participants, seat])
    let cards: HoleCardsMemory | null = null
    let source: Provenance = entry.status === 'unknown' ? 'unknown' : 'explicit'
    let detail: string | null = null
    if (entry.status === 'shown' && entry.cards) {
      const read = readHole(entry.cards)
      cards = holeFrom(read)
      source = read.source
      detail = read.detail
    }
    draft = setShowdown(draft, seat, entry.status, cards)
    const text =
      entry.status === 'shown'
        ? `${name(seat)} shows ${cards ? holeCardsText(cards) : 'cards not recorded'}`
        : entry.status === 'mucked'
          ? `${name(seat)} mucks`
          : entry.status === 'no-showdown'
            ? `${name(seat)} was out before showdown`
            : `${name(seat)}: cards not seen`
    fact({
      id: `showdown:${index}`,
      topic: 'Showdown',
      text,
      spoken: `Showdown: ${text.replace(name(seat), spokenName(seat))}.`,
      source,
      said: entry.said || null,
      detail: entry.status === 'mucked' ? 'No cards are filled in for a mucked hand.' : detail,
    })
  }

  /* --------------------------------------------------- result, pot */

  if (interpretation.result) {
    const unsettled = interpretation.result.winners.filter((ref) => wait(ref, interpretation.result!.said))
    const winners = interpretation.result.winners.map(seatFor).filter((seat): seat is number => seat !== null)
    if (unsettled.length > 0) {
      // Who won waits on who they are.
    } else if (winners.length > 0) {
      for (const seat of winners) if (!draft.participants.includes(seat)) draft = setParticipants(draft, setup, [...draft.participants, seat])
      draft = setWinners(draft, winners)
      const words = winners.length > 1 ? `Split: ${winners.map(name).join(' and ')}` : `${name(winners[0]!)} wins`
      fact({ id: 'result', topic: 'Result', text: words, source: 'explicit', said: interpretation.result.said || null, detail: null })
    } else {
      fact({ id: 'result', topic: 'Result', text: `Not placed: ${quote(interpretation.result.said)}`, source: 'conflict', state: 'clarify', said: interpretation.result.said, detail: 'Waiting on who this was.' })
    }
  }

  if (interpretation.pot) {
    const cents = dollarsToCents(interpretation.pot.dollars)
    if (interpretation.pot.approximate) {
      notes.push(`Pot: about ${formatCents(cents)}`)
      fact({
        id: 'pot',
        topic: 'Pot',
        text: `About ${formatCents(cents)}`,
        source: 'unknown',
        state: 'unrecorded',
        said: interpretation.pot.said || null,
        detail: 'Kept as a note. A remembered estimate is not used as the exact pot.',
      })
    } else {
      draft = setPot(draft, cents)
      fact({ id: 'pot', topic: 'Pot', text: formatCents(cents), source: 'explicit', said: interpretation.pot.said || null, detail: 'As you remember it, not calculated.' })
    }
  }

  for (const [id, said] of waiting) {
    const index = facts.findIndex((entry) => entry.id === `who:${id}`)
    if (index < 0) continue
    const leftOut = answers[`who:${id}`] === 'none'
    const list = `${said.slice(0, 3).map(quote).join(', ')}${said.length > 3 ? ` and ${said.length - 3} more` : ''}`
    const note = leftOut
      ? `Left out with them: ${list}.`
      : `${said.length === 1 ? 'One part of the hand waits' : `${said.length} parts of the hand wait`} on this: ${list}.`
    facts[index] = { ...facts[index]!, detail: `${facts[index]!.detail ?? ''} ${note}`.trim() }
  }

  /* -------------------------------------------- what did not fit */

  interpretation.contradictions.forEach((entry, index) => {
    fact({
      id: `contradiction:${index}`,
      topic: 'Contradiction',
      text: entry.about,
      source: 'conflict',
      said: entry.said.join(' … ') || null,
      detail: 'Two parts of the description disagree. Nothing was picked: check it in the draft.',
    })
  })
  interpretation.unplaced.forEach((phrase, index) => {
    if (phrase) fact({ id: `unplaced:${index}`, topic: 'Not placed', text: quote(phrase), source: 'unknown', said: phrase, detail: 'Not understood as part of the hand.' })
  })

  const check = checkDraft(setup, draft)
  return { draft, setup, facts, questions, errors: check.errors, notes: [...new Set(notes)], editAt }
}

/* ================================================================ sizes */

interface Sized {
  amount: Cents | null
  /** A pot-fraction bet that could be dollars, offered rather than filled in. */
  estimate: Cents | null
  words: string | null
  spoken: string | null
  source: Provenance | null
  detail: string | null
  /** Words for the hand's notes when the size could not become an amount. */
  note: string | null
}

const NONE: Sized = { amount: null, estimate: null, words: null, spoken: null, source: null, detail: null, note: null }

/** The current bet on a street before the next action: what "raise 80 more" is added to. Null when not known. */
function betFacing(setup: HandSetup, draft: HandDraft, street: Street): Cents | null {
  const flow = flowFor(setup, draft, street)
  const last = [...flow.steps].reverse().find((step) => !step.problem && (step.action.action === 'bet' || step.action.action === 'raise' || step.action.action === 'allin'))
  if (last) return last.action.amount
  if (street !== 'preflop') return 0
  return setup.straddles.at(-1)?.amount ?? setup.bigBlind
}

function sizeAmount(
  setup: HandSetup,
  draft: HandDraft,
  street: Street,
  _seat: number,
  kind: NarrationActionKind,
  size: NarrationSize | null,
  said: string,
): Sized {
  if (size === null || kind === 'fold' || kind === 'check' || kind === 'call') return NONE
  if (size.kind === 'to') {
    const amount = dollarsToCents(size.dollars)
    const statedNumber = said.replace(/,/g, '').includes(String(size.dollars))
    const about = size.approximate ? 'about ' : ''
    return {
      ...NONE,
      amount,
      words: `${kind === 'raise' ? 'to ' : ''}${about}${formatCents(amount)}`,
      spoken: `${kind === 'raise' ? 'to ' : ''}${about}${formatCents(amount)}`,
      source: size.approximate || !statedNumber ? 'interpreted' : 'explicit',
      detail: size.approximate ? 'You gave this as approximate.' : null,
    }
  }
  if (size.kind === 'more') {
    const more = dollarsToCents(size.dollars)
    const facing = betFacing(setup, draft, street)
    if (facing === null) {
      return {
        ...NONE,
        words: `${formatCents(more)} more`,
        spoken: `${formatCents(more)} more`,
        source: 'unknown',
        detail: `${quote(said)}: the bet before it is not known, so the total cannot be worked out.`,
        note: `${formatCents(more)} more (total not known)`,
      }
    }
    const amount = facing + more
    return {
      ...NONE,
      amount,
      words: `to ${formatCents(amount)}`,
      spoken: `to ${formatCents(amount)}`,
      source: 'derived',
      detail: `${formatCents(more)} more on top of ${formatCents(facing)}.`,
    }
  }
  // A fraction of the pot: only a bet into nothing can become dollars, and only as an offer.
  const pot = kind === 'bet' ? potBeforeAction(setup, draft, street, draft.streets.find((entry) => entry.street === street)?.actions.length ?? 0) : null
  const estimate = pot !== null && pot > 0 ? Math.round((pot * size.ratio) / 100) * 100 || null : null
  return {
    ...NONE,
    estimate,
    words: ratioText(size.ratio),
    spoken: ratioSpoken(size.ratio),
    source: 'interpreted',
    detail:
      estimate !== null
        ? `About ${formatCents(estimate)} of a ${formatCents(pot!)} pot. The amount is left blank unless you use it.`
        : 'Kept as a fraction of the pot: the pot before it is not known exactly.',
    note: ratioText(size.ratio),
  }
}
