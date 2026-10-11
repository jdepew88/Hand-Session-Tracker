import type { Rank, Suit } from '../cards'
import { STREETS, type Street } from '../models'
import { MAX_SEATS } from '../validation'
import { isRank, isSuit } from '../draft/memory'

/**
 * What a narration parser says a free-flow hand description contains.
 *
 * This is the contract between SessionTracker and whatever reads the text
 * (a language model behind the server, or the on-device practice parser).
 * It describes what the narrator SAID, not a hand: people are named by the
 * phrases used for them, never by seat or player id, and every fact keeps
 * the words it came from. Turning it into a hand is deterministic app code
 * (`normalize.ts`), which resolves the phrases against the table, decides
 * what is confirmed and what needs asking, and writes the existing draft.
 *
 * Every response is untrusted input. `readInterpretation` checks it
 * strictly -- unknown fields, wrong types, oversized strings or lists all
 * reject the whole response -- before anything else looks at it.
 */

export const NARRATION_SCHEMA_VERSION = 1

/** The position words the contract uses, the same codes the table shows. */
export const NARRATION_POSITIONS = ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'UTG+2', 'UTG+3', 'LJ', 'HJ', 'CO'] as const
export type NarrationPosition = (typeof NARRATION_POSITIONS)[number]

export const NARRATION_ACTIONS = ['fold', 'check', 'call', 'bet', 'raise', 'allin'] as const
export type NarrationActionKind = (typeof NARRATION_ACTIONS)[number]

/** "hero", or the id of a person in `people`. */
export type ActorRef = string

export interface NarrationCard {
  rank: Rank | null
  suit: Suit | null
}

export interface NarrationHole {
  cards: [NarrationCard, NarrationCard]
  /** "suited" / "offsuit" when the exact suits were not said. */
  suited: boolean | null
  /** The words used: "jack ten of hearts", "AK suited". */
  said: string
}

/**
 * A bet size as said. `to` is the seat's total for the street ("raise to
 * 120", "bet 40"); `more` is an increment over the bet faced ("raise 80
 * more"); `pot` is a fraction of the pot ("two thirds" = 0.67, "pot" = 1).
 * Dollars, as the narrator says them.
 */
export type NarrationSize =
  | { kind: 'to'; dollars: number; approximate: boolean }
  | { kind: 'more'; dollars: number; approximate: boolean }
  | { kind: 'pot'; ratio: number }

/** One of the other people in the hand. Hero is never a person here. */
export interface NarrationPerson {
  /** Local to this response: "p1", "p2". */
  id: string
  /** Every phrase used for them, verbatim: "hoodie guy", "he", "the big blind". */
  phrases: string[]
  /** Only when the narration states their position in this hand. */
  position: NarrationPosition | null
  /** Only when the narration states a seat number. */
  seat: number | null
}

export interface NarrationAction {
  type: 'action'
  /** null when the narration does not make clear who acted. */
  actor: ActorRef | null
  /** The words used for whoever acted: "I", "he", "big blind". */
  actorSaid: string
  action: NarrationActionKind
  size: NarrationSize | null
  /** The clause this came from. */
  said: string
  /** True when slang was read as an action: "flats", "peels", "jams", "clicks it back". */
  shorthand: boolean
  /** "tank call", "snap call": kept as words only. */
  timing: 'tank' | 'snap' | null
}

/** "Folds to me": everyone before them folded. Nothing is recorded for those players. */
export interface NarrationFoldsTo {
  type: 'folds-to'
  target: ActorRef | null
  said: string
}

/** "Checks through": everyone left on the street checks. */
export interface NarrationChecksThrough {
  type: 'checks-through'
  said: string
}

/** A clause that could mean more than one thing ("he checks two-thirds"). */
export interface NarrationUnclear {
  type: 'unclear'
  said: string
  options: { label: string; actor: ActorRef | null; action: NarrationActionKind; size: NarrationSize | null }[]
}

export type NarrationItem = NarrationAction | NarrationFoldsTo | NarrationChecksThrough | NarrationUnclear

export interface NarrationBoard {
  /** The cards that arrived on this street, as far as they were said. */
  cards: NarrationCard[]
  /** Flop only: "rainbow", "two clubs", "all spades". */
  pattern: 'rainbow' | 'two-tone' | 'monotone' | null
  patternSuit: Suit | null
  /** A description instead of a card: "brick", "blank", "some low club". */
  description: string | null
  said: string
}

export interface NarrationStreet {
  street: Street
  board: NarrationBoard | null
  items: NarrationItem[]
  /** "I don't remember preflop". */
  forgotten: boolean
}

export interface NarrationShowdown {
  who: ActorRef | null
  status: 'shown' | 'mucked' | 'unknown' | 'no-showdown'
  cards: NarrationHole | null
  said: string
}

export interface NarrationInterpretation {
  version: typeof NARRATION_SCHEMA_VERSION
  /** Every position the narrator gave Hero, in order. Two different ones is a contradiction. */
  heroPositions: { position: NarrationPosition; said: string }[]
  /** "Button was seat four". */
  button: { seat: number; said: string } | null
  people: NarrationPerson[]
  heroCards: NarrationHole | null
  /** Preflop first; only streets the narration mentions. */
  streets: NarrationStreet[]
  showdown: NarrationShowdown[]
  result: { winners: ActorRef[]; said: string } | null
  pot: { dollars: number; approximate: boolean; said: string } | null
  /** Things the narrator said that disagree with each other. */
  contradictions: { about: string; said: string[] }[]
  /** Phrases the parser could not place anywhere. */
  unplaced: string[]
}

/* ============================================================ limits */

export const LIMITS = {
  text: 300,
  people: MAX_SEATS - 1,
  phrases: 12,
  items: 40,
  options: 3,
  showdown: MAX_SEATS,
  contradictions: 10,
  unplaced: 20,
  heroPositions: 5,
  /** Dollars. Anything larger is not a hand at a live table. */
  dollars: 1_000_000,
  ratio: 10,
} as const

/* ========================================================= validation */

export class InterpretationError extends Error {
  constructor(readonly issues: string[]) {
    super(`The parser response is malformed: ${issues.slice(0, 3).join(' ')}`)
    this.name = 'InterpretationError'
  }
}

type Issues = string[]

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function exactKeys(value: Record<string, unknown>, keys: readonly string[], field: string, issues: Issues) {
  for (const key of Object.keys(value)) if (!keys.includes(key)) issues.push(`${field} has an unexpected field "${key}".`)
  for (const key of keys) if (!(key in value)) issues.push(`${field} is missing "${key}".`)
}

function text(value: unknown, field: string, issues: Issues, { allowEmpty = true } = {}): string {
  if (typeof value !== 'string') {
    issues.push(`${field} must be text.`)
    return ''
  }
  if (value.length > LIMITS.text) issues.push(`${field} is too long.`)
  // Control characters have no place in a phrase from a hand.
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim()
  if (!allowEmpty && cleaned === '') issues.push(`${field} is empty.`)
  return cleaned
}

function list<T>(value: unknown, max: number, field: string, issues: Issues, read: (entry: unknown, field: string) => T): T[] {
  if (!Array.isArray(value)) {
    issues.push(`${field} must be a list.`)
    return []
  }
  if (value.length > max) {
    issues.push(`${field} has too many entries.`)
    return []
  }
  return value.map((entry, index) => read(entry, `${field} ${index + 1}`))
}

function bool(value: unknown, field: string, issues: Issues): boolean {
  if (typeof value !== 'boolean') issues.push(`${field} must be true or false.`)
  return value === true
}

function nullable<T>(value: unknown, read: (value: unknown) => T): T | null {
  return value === null ? null : read(value)
}

function seat(value: unknown, field: string, issues: Issues): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > MAX_SEATS) {
    issues.push(`${field} must be a seat number from 1 to ${MAX_SEATS}.`)
    return 1
  }
  return value
}

function dollars(value: unknown, field: string, issues: Issues): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > LIMITS.dollars) {
    issues.push(`${field} must be a positive dollar amount.`)
    return 1
  }
  if (Math.round(value * 100) !== Math.round(value * 100 * 1000) / 1000) issues.push(`${field} has fractions of a cent.`)
  return value
}

function oneOf<T extends string>(value: unknown, options: readonly T[], field: string, issues: Issues): T {
  if (typeof value !== 'string' || !options.includes(value as T)) {
    issues.push(`${field} is not one of ${options.join(', ')}.`)
    return options[0]!
  }
  return value as T
}

function actorRef(value: unknown, field: string, issues: Issues): ActorRef | null {
  if (value === null) return null
  if (typeof value !== 'string' || !/^(hero|p\d{1,2})$/.test(value)) {
    issues.push(`${field} must be "hero", a person id or null.`)
    return null
  }
  return value
}

function card(value: unknown, field: string, issues: Issues): NarrationCard {
  if (!isRecord(value)) {
    issues.push(`${field} must be a card.`)
    return { rank: null, suit: null }
  }
  exactKeys(value, ['rank', 'suit'], field, issues)
  if (value.rank !== null && !isRank(value.rank)) issues.push(`${field} has an unknown rank.`)
  if (value.suit !== null && !isSuit(value.suit)) issues.push(`${field} has an unknown suit.`)
  return { rank: isRank(value.rank) ? value.rank : null, suit: isSuit(value.suit) ? value.suit : null }
}

function hole(value: unknown, field: string, issues: Issues): NarrationHole {
  if (!isRecord(value)) {
    issues.push(`${field} must be two cards.`)
    return { cards: [{ rank: null, suit: null }, { rank: null, suit: null }], suited: null, said: '' }
  }
  exactKeys(value, ['cards', 'suited', 'said'], field, issues)
  const cards = list(value.cards, 2, `${field} cards`, issues, (entry, name) => card(entry, name, issues))
  if (cards.length !== 2) issues.push(`${field} must have exactly two cards.`)
  const suited = value.suited === null ? null : bool(value.suited, `${field} suited`, issues)
  return {
    cards: [cards[0] ?? { rank: null, suit: null }, cards[1] ?? { rank: null, suit: null }],
    suited,
    said: text(value.said, `${field} said`, issues),
  }
}

function size(value: unknown, field: string, issues: Issues): NarrationSize {
  if (!isRecord(value)) {
    issues.push(`${field} must be a size.`)
    return { kind: 'pot', ratio: 1 }
  }
  if (value.kind === 'pot') {
    exactKeys(value, ['kind', 'ratio'], field, issues)
    const ratio = value.ratio
    if (typeof ratio !== 'number' || !Number.isFinite(ratio) || ratio <= 0 || ratio > LIMITS.ratio) {
      issues.push(`${field} ratio must be a positive fraction of the pot.`)
      return { kind: 'pot', ratio: 1 }
    }
    return { kind: 'pot', ratio }
  }
  const kind = oneOf(value.kind, ['to', 'more'] as const, `${field} kind`, issues)
  exactKeys(value, ['kind', 'dollars', 'approximate'], field, issues)
  return { kind, dollars: dollars(value.dollars, `${field} dollars`, issues), approximate: bool(value.approximate, `${field} approximate`, issues) }
}

function item(value: unknown, field: string, issues: Issues): NarrationItem {
  if (!isRecord(value)) {
    issues.push(`${field} must be an object.`)
    return { type: 'checks-through', said: '' }
  }
  switch (value.type) {
    case 'action':
      exactKeys(value, ['type', 'actor', 'actorSaid', 'action', 'size', 'said', 'shorthand', 'timing'], field, issues)
      return {
        type: 'action',
        actor: actorRef(value.actor, `${field} actor`, issues),
        actorSaid: text(value.actorSaid, `${field} actorSaid`, issues),
        action: oneOf(value.action, NARRATION_ACTIONS, `${field} action`, issues),
        size: nullable(value.size, (entry) => size(entry, `${field} size`, issues)),
        said: text(value.said, `${field} said`, issues),
        shorthand: bool(value.shorthand, `${field} shorthand`, issues),
        timing: value.timing === null ? null : oneOf(value.timing, ['tank', 'snap'] as const, `${field} timing`, issues),
      }
    case 'folds-to':
      exactKeys(value, ['type', 'target', 'said'], field, issues)
      return { type: 'folds-to', target: actorRef(value.target, `${field} target`, issues), said: text(value.said, `${field} said`, issues) }
    case 'checks-through':
      exactKeys(value, ['type', 'said'], field, issues)
      return { type: 'checks-through', said: text(value.said, `${field} said`, issues) }
    case 'unclear': {
      exactKeys(value, ['type', 'said', 'options'], field, issues)
      const options = list(value.options, LIMITS.options, `${field} options`, issues, (entry, name) => {
        if (!isRecord(entry)) {
          issues.push(`${name} must be an object.`)
          return { label: '', actor: null, action: 'check' as const, size: null }
        }
        exactKeys(entry, ['label', 'actor', 'action', 'size'], name, issues)
        return {
          label: text(entry.label, `${name} label`, issues, { allowEmpty: false }),
          actor: actorRef(entry.actor, `${name} actor`, issues),
          action: oneOf(entry.action, NARRATION_ACTIONS, `${name} action`, issues),
          size: nullable(entry.size, (raw) => size(raw, `${name} size`, issues)),
        }
      })
      if (options.length < 2) issues.push(`${field} needs at least two readings.`)
      return { type: 'unclear', said: text(value.said, `${field} said`, issues), options }
    }
    default:
      issues.push(`${field} has an unknown type.`)
      return { type: 'checks-through', said: '' }
  }
}

function board(value: unknown, field: string, issues: Issues, street: Street): NarrationBoard {
  if (!isRecord(value)) {
    issues.push(`${field} must be an object.`)
    return { cards: [], pattern: null, patternSuit: null, description: null, said: '' }
  }
  exactKeys(value, ['cards', 'pattern', 'patternSuit', 'description', 'said'], field, issues)
  const slots = street === 'flop' ? 3 : 1
  const cards = list(value.cards, slots, `${field} cards`, issues, (entry, name) => card(entry, name, issues))
  const pattern = value.pattern === null ? null : oneOf(value.pattern, ['rainbow', 'two-tone', 'monotone'] as const, `${field} pattern`, issues)
  if (pattern && street !== 'flop') issues.push(`${field}: only the flop has a suit pattern.`)
  if (value.patternSuit !== null && !isSuit(value.patternSuit)) issues.push(`${field} patternSuit is not a suit.`)
  return {
    cards,
    pattern,
    patternSuit: isSuit(value.patternSuit) ? value.patternSuit : null,
    description: value.description === null ? null : text(value.description, `${field} description`, issues),
    said: text(value.said, `${field} said`, issues),
  }
}

/**
 * Check a parser response. Returns the interpretation, or throws
 * `InterpretationError` listing what is wrong -- never a partly-read result.
 */
export function readInterpretation(value: unknown): NarrationInterpretation {
  const issues: Issues = []
  if (!isRecord(value)) throw new InterpretationError(['The response is not an object.'])
  exactKeys(
    value,
    ['version', 'heroPositions', 'button', 'people', 'heroCards', 'streets', 'showdown', 'result', 'pot', 'contradictions', 'unplaced'],
    'The response',
    issues,
  )
  if (value.version !== NARRATION_SCHEMA_VERSION) issues.push(`Unsupported response version ${String(value.version)}.`)

  const heroPositions = list(value.heroPositions, LIMITS.heroPositions, 'Hero positions', issues, (entry, field) => {
    if (!isRecord(entry)) {
      issues.push(`${field} must be an object.`)
      return { position: 'BTN' as const, said: '' }
    }
    exactKeys(entry, ['position', 'said'], field, issues)
    return { position: oneOf(entry.position, NARRATION_POSITIONS, `${field} position`, issues), said: text(entry.said, `${field} said`, issues) }
  })

  let button: NarrationInterpretation['button'] = null
  if (value.button !== null) {
    if (!isRecord(value.button)) issues.push('Button must be an object or null.')
    else {
      exactKeys(value.button, ['seat', 'said'], 'Button', issues)
      button = { seat: seat(value.button.seat, 'Button seat', issues), said: text(value.button.said, 'Button said', issues) }
    }
  }

  const people = list(value.people, LIMITS.people, 'People', issues, (entry, field) => {
    if (!isRecord(entry)) {
      issues.push(`${field} must be an object.`)
      return { id: 'p0', phrases: [], position: null, seat: null }
    }
    exactKeys(entry, ['id', 'phrases', 'position', 'seat'], field, issues)
    const id = typeof entry.id === 'string' && /^p\d{1,2}$/.test(entry.id) ? entry.id : ''
    if (!id) issues.push(`${field} id must look like "p1".`)
    return {
      id,
      phrases: list(entry.phrases, LIMITS.phrases, `${field} phrases`, issues, (phrase, name) => text(phrase, name, issues, { allowEmpty: false })),
      position: entry.position === null ? null : oneOf(entry.position, NARRATION_POSITIONS, `${field} position`, issues),
      seat: entry.seat === null ? null : seat(entry.seat, `${field} seat`, issues),
    }
  })
  const ids = people.map((person) => person.id)
  if (new Set(ids).size !== ids.length) issues.push('Two people share an id.')

  const streets = list(value.streets, STREETS.length, 'Streets', issues, (entry, field) => {
    if (!isRecord(entry)) {
      issues.push(`${field} must be an object.`)
      return { street: 'preflop' as Street, board: null, items: [], forgotten: false }
    }
    exactKeys(entry, ['street', 'board', 'items', 'forgotten'], field, issues)
    const street = oneOf(entry.street, STREETS, `${field} street`, issues)
    if (street === 'preflop' && entry.board !== null) issues.push('Preflop has no board.')
    return {
      street,
      board: entry.board === null || street === 'preflop' ? null : board(entry.board, `${field} board`, issues, street),
      items: list(entry.items, LIMITS.items, `${field} items`, issues, (raw, name) => item(raw, name, issues)),
      forgotten: bool(entry.forgotten, `${field} forgotten`, issues),
    }
  })
  const order = streets.map((entry) => STREETS.indexOf(entry.street))
  if (order.some((index, position) => position > 0 && index <= order[position - 1]!)) issues.push('Streets must be in order, each once.')

  const showdown = list(value.showdown, LIMITS.showdown, 'Showdown', issues, (entry, field) => {
    if (!isRecord(entry)) {
      issues.push(`${field} must be an object.`)
      return { who: null, status: 'unknown' as const, cards: null, said: '' }
    }
    exactKeys(entry, ['who', 'status', 'cards', 'said'], field, issues)
    const status = oneOf(entry.status, ['shown', 'mucked', 'unknown', 'no-showdown'] as const, `${field} status`, issues)
    const cards = entry.cards === null ? null : hole(entry.cards, `${field} cards`, issues)
    if (cards && status !== 'shown') issues.push(`${field}: only a shown hand has cards.`)
    return { who: actorRef(entry.who, `${field} who`, issues), status, cards, said: text(entry.said, `${field} said`, issues) }
  })

  let result: NarrationInterpretation['result'] = null
  if (value.result !== null) {
    if (!isRecord(value.result)) issues.push('Result must be an object or null.')
    else {
      exactKeys(value.result, ['winners', 'said'], 'Result', issues)
      const winners = list(value.result.winners, MAX_SEATS, 'Winners', issues, (entry, field) => actorRef(entry, field, issues)).filter(
        (entry): entry is ActorRef => entry !== null,
      )
      result = { winners, said: text(value.result.said, 'Result said', issues) }
    }
  }

  let pot: NarrationInterpretation['pot'] = null
  if (value.pot !== null) {
    if (!isRecord(value.pot)) issues.push('Pot must be an object or null.')
    else {
      exactKeys(value.pot, ['dollars', 'approximate', 'said'], 'Pot', issues)
      pot = {
        dollars: dollars(value.pot.dollars, 'Pot dollars', issues),
        approximate: bool(value.pot.approximate, 'Pot approximate', issues),
        said: text(value.pot.said, 'Pot said', issues),
      }
    }
  }

  const contradictions = list(value.contradictions, LIMITS.contradictions, 'Contradictions', issues, (entry, field) => {
    if (!isRecord(entry)) {
      issues.push(`${field} must be an object.`)
      return { about: '', said: [] }
    }
    exactKeys(entry, ['about', 'said'], field, issues)
    return {
      about: text(entry.about, `${field} about`, issues, { allowEmpty: false }),
      said: list(entry.said, 4, `${field} said`, issues, (phrase, name) => text(phrase, name, issues)),
    }
  })
  const heroCards = value.heroCards === null ? null : hole(value.heroCards, "Hero's cards", issues)
  const unplaced = list(value.unplaced, LIMITS.unplaced, 'Unplaced', issues, (entry, field) => text(entry, field, issues))

  // Every person an action, showdown or result names must exist.
  const known = new Set(['hero', ...ids])
  const refs = [
    ...streets.flatMap((street) =>
      street.items.flatMap((entry) =>
        entry.type === 'action' ? [entry.actor] : entry.type === 'folds-to' ? [entry.target] : entry.type === 'unclear' ? entry.options.map((option) => option.actor) : [],
      ),
    ),
    ...showdown.map((entry) => entry.who),
    ...(result?.winners ?? []),
  ]
  for (const ref of refs) if (ref !== null && !known.has(ref)) issues.push(`"${ref}" is not one of the people.`)

  if (issues.length > 0) throw new InterpretationError([...new Set(issues)])
  return {
    version: NARRATION_SCHEMA_VERSION,
    heroPositions,
    button,
    people,
    heroCards,
    streets,
    showdown,
    result,
    pot,
    contradictions,
    unplaced,
  }
}

/** A response with nothing in it, for building one up. */
export function emptyInterpretation(): NarrationInterpretation {
  return {
    version: NARRATION_SCHEMA_VERSION,
    heroPositions: [],
    button: null,
    people: [],
    heroCards: null,
    streets: [],
    showdown: [],
    result: null,
    pot: null,
    contradictions: [],
    unplaced: [],
  }
}
