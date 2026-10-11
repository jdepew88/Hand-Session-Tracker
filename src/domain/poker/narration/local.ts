import { STREETS, type Street } from '../models'
import type { NarrationContext } from './context'
import type { HandNarrationParser } from './parser'
import {
  emptyInterpretation,
  type ActorRef,
  type NarrationActionKind,
  type NarrationBoard,
  type NarrationInterpretation,
  type NarrationItem,
  type NarrationPerson,
  type NarrationSize,
} from './schema'
import { parseMoney, parsePosition, parsePotRatio, parseSeatNumber, parseSpokenCards } from './spoken'

/**
 * The on-device practice parser: a small, rule-based reader of common poker
 * shorthand, so the whole text-to-draft flow can be used and tested with no
 * AI service connected. It produces exactly the response a language model is
 * asked for, and goes through exactly the same checks and normaliser.
 *
 * It is deliberately modest. It reads one clause at a time ("he checks", "I
 * bet 10", "turn was a brick"), follows "he" to the last opponent named,
 * and puts anything it cannot read in `unplaced` rather than guessing. It is
 * not meant to grow into a language model made of regular expressions.
 */

const VERBS: Record<string, { action: NarrationActionKind; shorthand: boolean; timing?: 'tank' | 'snap' }> = {
  fold: { action: 'fold', shorthand: false }, folds: { action: 'fold', shorthand: false }, folded: { action: 'fold', shorthand: false },
  check: { action: 'check', shorthand: false }, checks: { action: 'check', shorthand: false }, checked: { action: 'check', shorthand: false },
  checkback: { action: 'check', shorthand: true },
  call: { action: 'call', shorthand: false }, calls: { action: 'call', shorthand: false }, called: { action: 'call', shorthand: false },
  flat: { action: 'call', shorthand: true }, flats: { action: 'call', shorthand: true }, flatted: { action: 'call', shorthand: true },
  peel: { action: 'call', shorthand: true }, peels: { action: 'call', shorthand: true }, peeled: { action: 'call', shorthand: true },
  limp: { action: 'call', shorthand: true }, limps: { action: 'call', shorthand: true }, limped: { action: 'call', shorthand: true },
  flickcall: { action: 'call', shorthand: true },
  tankcall: { action: 'call', shorthand: true, timing: 'tank' }, snapcall: { action: 'call', shorthand: true, timing: 'snap' },
  tankfold: { action: 'fold', shorthand: true, timing: 'tank' }, snapfold: { action: 'fold', shorthand: true, timing: 'snap' },
  bet: { action: 'bet', shorthand: false }, bets: { action: 'bet', shorthand: false },
  lead: { action: 'bet', shorthand: true }, leads: { action: 'bet', shorthand: true }, led: { action: 'bet', shorthand: true },
  fire: { action: 'bet', shorthand: true }, fires: { action: 'bet', shorthand: true }, fired: { action: 'bet', shorthand: true },
  stab: { action: 'bet', shorthand: true }, stabs: { action: 'bet', shorthand: true },
  raise: { action: 'raise', shorthand: false }, raises: { action: 'raise', shorthand: false }, raised: { action: 'raise', shorthand: false },
  open: { action: 'raise', shorthand: true }, opens: { action: 'raise', shorthand: true }, opened: { action: 'raise', shorthand: true },
  '3bet': { action: 'raise', shorthand: false }, '3bets': { action: 'raise', shorthand: false },
  '4bet': { action: 'raise', shorthand: false }, '4bets': { action: 'raise', shorthand: false },
  makeit: { action: 'raise', shorthand: true }, clickback: { action: 'raise', shorthand: true },
  jam: { action: 'allin', shorthand: true }, jams: { action: 'allin', shorthand: true }, jammed: { action: 'allin', shorthand: true },
  shove: { action: 'allin', shorthand: true }, shoves: { action: 'allin', shorthand: true }, shoved: { action: 'allin', shorthand: true },
  allin: { action: 'allin', shorthand: false },
}

const REWRITES: [RegExp, string][] = [
  [/\btank(?:s|ed)?(?:\s+and|\s*,)?\s+call(?:s|ed)?\b/g, 'tankcall'],
  [/\btank[- ]?call(?:s|ed)?\b/g, 'tankcall'],
  [/\btank(?:s|ed)?(?:\s+and|\s*,)?\s+fold(?:s|ed)?\b/g, 'tankfold'],
  [/\bsnap[- ]?call(?:s|ed)?\b/g, 'snapcall'],
  [/\bsnap[- ]?fold(?:s|ed)?\b/g, 'snapfold'],
  [/\bsnaps?(?: it)?(?: off)?\b/g, 'snapcall'],
  [/\bflicks? in (?:the |a )?call\b/g, 'flickcall'],
  [/\b(?:goes |going |went )?all[- ]in\b/g, 'allin'],
  [/\b(?:three|3)[- ]bet(s|ting)?\b/g, '3bet$1'],
  [/\b(?:four|4)[- ]bet(s|ting)?\b/g, '4bet$1'],
  [/\bclicks? it back\b/g, 'clickback'],
  [/\bmakes? it\b/g, 'makeit'],
  [/\bchecks? (?:it )?(?:through|around)\b|\bchecked (?:through|around)\b|\bcheck(?:s|ed)? down\b/g, 'checkthrough'],
  [/\bchecks? (?:it )?back\b|\bchecked (?:it )?back\b/g, 'checkback'],
  [/\b(?:everyone|everybody) (?:else )?(?:gets? out of the way|folds?)\b/g, 'foldsto me'],
  [/\b(?:i )?(?:do not|don'?t|can'?t|cannot) remember\b|\bforget\b|\bforgot\b/g, 'forgot'],
  [/\bnever saw (?:his|her|their|the) (?:cards|hand)\b/g, 'neversaw'],
  [/\bno showdown\b/g, 'noshowdown'],
  [/\bc-?bets?\b/g, 'bets'],
  [/\bcut off\b/g, 'cutoff'],
  [/\bunder the gun\b/g, 'utg'],
  [/\bbig blind\b/g, 'bb'],
  [/\bsmall blind\b/g, 'sb'],
]

const PRONOUNS = new Set(['he', 'him', 'she', 'her', 'they', 'villain', 'villian', 'opponent', 'v'])
const HERO = new Set(['i', 'me', 'hero', 'myself'])
const SKIP_WORDS = new Set(['then', 'so', 'and', 'but', 'just', 'also', 'again', 'now', 'well', 'ok', 'okay', 'um'])
const APPROX = new Set(['about', 'around', 'like', 'roughly', 'approximately', '~', 'maybe', 'abt'])

interface Person extends NarrationPerson {
  key: string
}

/** Joins the words of a multi-word phrase so clause splitting never cuts through it. */
const GLUE = '\uE000'

interface Clause {
  /** The clause as written, for showing back to the player. */
  said: string
  /** Lower-case words, with shorthand phrases replaced by one canonical word ("tanks and calls" -> "tankcall"). */
  words: string[]
  /** The written words, aligned with `words`. */
  shown: string[]
}

/**
 * Split a narration into clauses at sentence ends, commas, "and" and "then",
 * without cutting "1.2x", "$1,250" or a phrase like "tanks and calls".
 */
function clausesOf(text: string): Clause[] {
  let source = text.replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/…/g, '. ')
  for (const [pattern] of REWRITES) {
    source = source.replace(new RegExp(pattern.source, 'gi'), (match) => match.replace(/[\s,]+/g, GLUE))
  }
  return source
    .split(/\.(?!\d)|(?<!\d)\.|[!?;]+|,(?!\d{3})|\s+and\s+|\s+then\s+/i)
    .map((clause) => clause.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((clause) => {
      const words: string[] = []
      const shown: string[] = []
      for (const token of clause.split(' ')) {
        const written = token.split(GLUE).join(' ')
        let canonical = written.toLowerCase()
        for (const [pattern, replacement] of REWRITES) {
          if (new RegExp(`^(?:${pattern.source})$`, 'i').test(canonical)) {
            canonical = canonical.replace(new RegExp(pattern.source, 'i'), replacement)
            break
          }
        }
        canonical.split(' ').forEach((word, index) => {
          words.push(word)
          shown.push(index === 0 ? written : '')
        })
      }
      return { said: clause.split(GLUE).join(' '), words, shown }
    })
}

export function interpretLocally(text: string, _context?: NarrationContext): NarrationInterpretation {
  const result = emptyInterpretation()
  const people: Person[] = []
  const streets = new Map<Street, { board: NarrationBoard | null; items: NarrationItem[]; forgotten: boolean }>()
  let street: Street = 'preflop'
  const seen: { lastOpponent: Person | null } = { lastOpponent: null }
  /** The last subject of a clause that did nothing ("I'm cutoff with AK"): the actor of a following "raise 17". */
  let pendingSubject: ActorRef | null = null

  const streetEntry = (name: Street) => {
    if (!streets.has(name)) streets.set(name, { board: null, items: [], forgotten: false })
    return streets.get(name)!
  }
  streetEntry('preflop')

  const person = (phrase: string, display: string): Person => {
    const key = phrase.toLowerCase().replace(/^the /, '')
    const position = parsePosition(key)
    const existing = people.find((entry) => entry.key === key || (position !== null && entry.position === position))
    if (existing) {
      if (!existing.phrases.includes(display)) existing.phrases.push(display)
      return existing
    }
    const created: Person = {
      id: `p${people.length + 1}`,
      key,
      phrases: [display],
      position,
      seat: parseSeatNumber(key),
    }
    people.push(created)
    return created
  }

  /** "I" -> hero; "he" -> the last opponent named; anything else a person. */
  const actorFor = (subject: string, display = subject): ActorRef | null => {
    const words = subject.split(' ').filter((word) => word && !SKIP_WORDS.has(word))
    const phrase = words.join(' ')
    if (phrase === '') return null
    const shown = display
      .split(' ')
      .filter((word) => word && !SKIP_WORDS.has(word.toLowerCase()))
      .join(' ')
    if (HERO.has(phrase)) return 'hero'
    if (PRONOUNS.has(phrase)) {
      if (seen.lastOpponent) {
        if (!seen.lastOpponent.phrases.includes(shown)) seen.lastOpponent.phrases.push(shown)
        return seen.lastOpponent.id
      }
      seen.lastOpponent = person(phrase, shown)
      return seen.lastOpponent.id
    }
    seen.lastOpponent = person(phrase, shown)
    return seen.lastOpponent.id
  }

  for (const { said: original, words, shown } of clausesOf(text)) {
    let clause = words.join(' ')

    // "I don't remember preflop."
    if (/\bforgot\b/.test(clause)) {
      const forgotten: Street = STREETS.find((entry) => new RegExp(`\\b${entry}\\b`).test(clause)) ?? street
      if (STREETS.indexOf(forgotten) > STREETS.indexOf(street)) street = forgotten
      streetEntry(forgotten).forgotten = true
      continue
    }

    // A street named anywhere moves the story on; what is left is its board or action.
    const named = STREETS.find((entry) => new RegExp(`\\b${entry}\\b`).test(clause))
    if (named) {
      if (STREETS.indexOf(named) >= STREETS.indexOf(street)) street = named
      clause = clause.replace(new RegExp(`\\b(?:on |the |on the )?${named}\\b`), ' ').replace(/\s+/g, ' ').trim()
      if (clause === '') continue
    }

    // A board: "ace king queen all spades", "T82 two clubs", "brick".
    if (street !== 'preflop' || !named) {
      const target: Street | null =
        named && named !== 'preflop'
          ? named
          : !named && street === 'preflop'
            ? 'flop'
            : !named && street !== 'river' && streets.get(street)?.board
              ? STREETS[STREETS.indexOf(street) + 1]!
              : null
      if (target && !streets.get(target)?.board) {
        const slots = target === 'flop' ? 3 : 1
        const cards = parseSpokenCards(clause, slots)
        if (cards && (cards.cards.length === slots || (cards.description && named) || (cards.pattern && named))) {
          street = target
          streetEntry(target).board = {
            cards: cards.cards,
            pattern: cards.pattern,
            patternSuit: cards.patternSuit,
            description: cards.description,
            said: original,
          }
          continue
        }
      }
    }

    // Hero's cards: "with ace king suited", "I have jack ten of hearts".
    const holding = /^(.*?)\b(?:with|have|hold|holding|had|got|looking at)\s+(.+)$/.exec(clause)
    if (holding && !/\b(?:show|shows|showed)\b/.test(clause)) {
      const cards = parseSpokenCards(holding[2]!, 2)
      const before = holding[1]!.trim()
      const heroClause = before === '' || /^(?:i'?m|i am|i was|im|i)\b/.test(before) || parsePosition(before.replace(/^(?:i'?m|i am|i was) (?:in |on |at )?/, '')) !== null
      if (cards && cards.cards.length === 2 && heroClause && !result.heroCards) {
        result.heroCards = { cards: [cards.cards[0]!, cards.cards[1]!], suited: cards.suited, said: holding[2]! }
        clause = before
        pendingSubject = 'hero'
        if (clause === '' || HERO.has(clause)) continue
      } else if (!cards && heroClause) {
        // "with about 400 behind": not cards, and not something this parser places.
        result.unplaced.push(holding[2]!)
        clause = before
        if (clause === '' || HERO.has(clause)) continue
      }
    }

    // Hero's position: "I'm in the cutoff", "I was UTG", or a story opening "Button with AK".
    const heroAt = /^(?:i'?m|i am|i was|im|hero is|hero was|i sit|i'm sitting|sitting)\s+(?:in |on |at )?(?:the )?(.+)$/.exec(clause)
    if (heroAt) {
      const position = parsePosition(heroAt[1]!)
      if (position) {
        result.heroPositions.push({ position, said: original })
        pendingSubject = 'hero'
        continue
      }
    }
    if (parsePosition(clause) && result.heroPositions.length === 0 && streets.get('preflop')!.items.length === 0 && pendingSubject === 'hero') {
      result.heroPositions.push({ position: parsePosition(clause)!, said: original })
      continue
    }

    // "Folds to me", "folds around to me in the cutoff".
    const foldsTo = /^(?:it )?folds? ?(?:around |round |all the way )?to (.+?)(?: (?:in|on|at) (?:the )?(.+))?$/.exec(clause)
    if (foldsTo) {
      const actor = actorFor(foldsTo[1]!)
      if (actor === 'hero' && foldsTo[2]) {
        const position = parsePosition(foldsTo[2])
        if (position) result.heroPositions.push({ position, said: original })
      }
      streetEntry(street).items.push({ type: 'folds-to', target: actor, said: original })
      pendingSubject = actor
      continue
    }

    if (/\bcheckthrough\b/.test(clause)) {
      streetEntry(street).items.push({ type: 'checks-through', said: original })
      continue
    }

    // Showdown and result.
    const subjectWords = clause.split(' ')
    const showAt = subjectWords.findIndex((word) => /^(?:show|shows|showed|tables|tabled|turns)$/.test(word))
    if (showAt >= 0) {
      const who = actorFor(subjectWords.slice(0, showAt).join(' ')) ?? seen.lastOpponent?.id ?? null
      const shown = parseSpokenCards(subjectWords.slice(showAt + 1).join(' ').replace(/^over /, ''), 2)
      result.showdown.push({
        who,
        status: 'shown',
        cards: shown && shown.cards.length === 2 ? { cards: [shown.cards[0]!, shown.cards[1]!], suited: shown.suited, said: original } : null,
        said: original,
      })
      continue
    }
    if (/\bmuck(?:s|ed)?\b/.test(clause)) {
      const who = actorFor(clause.replace(/\bmuck(?:s|ed)?\b.*$/, '').trim()) ?? seen.lastOpponent?.id ?? null
      result.showdown.push({ who, status: 'mucked', cards: null, said: original })
      continue
    }
    if (/\bneversaw\b/.test(clause)) {
      result.showdown.push({ who: seen.lastOpponent?.id ?? null, status: 'unknown', cards: null, said: original })
      continue
    }
    if (/\bnoshowdown\b/.test(clause)) continue
    if (/\b(?:chop|chops|chopped|split|splits)\b/.test(clause)) {
      result.result = { winners: ['hero', ...(seen.lastOpponent ? [seen.lastOpponent.id] : [])], said: original }
      continue
    }
    const winAt = subjectWords.findIndex((word) => /^(?:win|wins|won|scoop|scoops|scooped)$/.test(word))
    if (winAt >= 0) {
      const who = actorFor(subjectWords.slice(0, winAt).join(' '))
      if (who) result.result = { winners: [who], said: original }
      else result.unplaced.push(original)
      continue
    }
    const pot = /\b(?:pot (?:was|is|of)|in the pot|pot)\b/.test(clause) ? /(about |around |like |roughly )?\$?(\d[\d,.]*k?)/.exec(clause) : null
    if (pot && !Object.keys(VERBS).some((verb) => subjectWords.includes(verb))) {
      const dollars = parseMoney(pot[2]!)
      if (dollars) {
        result.pot = { dollars, approximate: Boolean(pot[1]), said: original }
        continue
      }
    }

    // An action: "[subject] verb [size] [position]".
    const verbAt = subjectWords.findIndex((word) => word in VERBS)
    if (verbAt < 0 && street === 'preflop' && !result.heroCards) {
      // A hand on its own: "AK suited".
      const cards = parseSpokenCards(clause, 2)
      if (cards && cards.cards.length === 2) {
        result.heroCards = { cards: [cards.cards[0]!, cards.cards[1]!], suited: cards.suited, said: original }
        continue
      }
    }
    if (verbAt < 0) {
      if (!/^(?:i'?m|i am|i was|hero)\b/.test(clause)) result.unplaced.push(original)
      else pendingSubject = 'hero'
      continue
    }
    const verb = VERBS[subjectWords[verbAt]!]!
    const subject = subjectWords.slice(0, verbAt).join(' ')
    const subjectShown = clause === words.join(' ') ? shown.slice(0, verbAt).filter(Boolean).join(' ') : subject
    let actor = actorFor(subject, subjectShown)
    if (actor === null && subject.split(' ').every((word) => !word || SKIP_WORDS.has(word))) actor = pendingSubject
    pendingSubject = null

    const rest = subjectWords.slice(verbAt + 1).filter((word) => !['to', 'it', 'for', 'out', 'the', 'from', 'in', 'on', 'a'].includes(word))
    const approximate = rest.some((word) => APPROX.has(word))
    const sizeWords = rest.filter((word) => !APPROX.has(word))
    let size: NarrationSize | null = null
    let trailing: string[] = sizeWords
    const more = sizeWords.indexOf('more')
    if (more > 0 && parseMoney(sizeWords[more - 1]!)) {
      size = { kind: 'more', dollars: parseMoney(sizeWords[more - 1]!)!, approximate }
      trailing = sizeWords.slice(more + 1)
    } else {
      for (let length = Math.min(4, sizeWords.length); length > 0 && !size; length -= 1) {
        const ratio = parsePotRatio(sizeWords.slice(0, length).join(' '))
        if (ratio !== null) {
          size = { kind: 'pot', ratio }
          trailing = sizeWords.slice(length)
        }
      }
      if (!size && sizeWords[0] && parseMoney(sizeWords[0])) {
        size = { kind: 'to', dollars: parseMoney(sizeWords[0])!, approximate }
        trailing = sizeWords.slice(1)
      }
    }
    // "limps UTG", "raises cutoff", "I call button": the actor's position.
    const position = trailing.length > 0 ? parsePosition(trailing.join(' ')) : null
    if (position && actor === 'hero') result.heroPositions.push({ position, said: original })
    else if (position && actor) {
      const named = people.find((entry) => entry.id === actor)
      if (named && named.position === null) named.position = position
    }

    const items = streetEntry(street).items
    if (verb.action === 'check' && size !== null) {
      // "He checks two-thirds": a check has no size. Ask rather than pick.
      items.push({
        type: 'unclear',
        said: original,
        options: [
          { label: `${subjectShown || 'They'} checks`.replace(/^\w/, (c) => c.toUpperCase()), actor, action: 'check', size: null },
          {
            label: `${subjectShown || 'They'} bets ${size.kind === 'pot' ? `${Math.round(size.ratio * 100)}% pot` : `$${size.dollars}`}`.replace(/^\w/, (c) => c.toUpperCase()),
            actor,
            action: 'bet',
            size,
          },
        ],
      })
      continue
    }
    items.push({
      type: 'action',
      actor,
      actorSaid: subjectShown || '',
      action: verb.action,
      size: verb.action === 'call' || verb.action === 'fold' || verb.action === 'check' ? null : size,
      said: original,
      shorthand: verb.shorthand,
      timing: verb.timing ?? null,
    })
    // "Bet 50 call": a second action, whose actor is not said.
    const reply = trailing.length === 1 ? VERBS[trailing[0]!] : undefined
    if (reply) {
      items.push({ type: 'action', actor: null, actorSaid: '', action: reply.action, size: null, said: original, shorthand: true, timing: reply.timing ?? null })
    }
  }

  result.people = people.map(({ id, phrases, position, seat }) => ({ id, phrases: phrases.slice(0, 12), position, seat }))
  result.streets = STREETS.filter((name) => streets.has(name)).map((name) => {
    const entry = streets.get(name)!
    return { street: name, board: name === 'preflop' ? null : entry.board, items: entry.items.slice(0, 40), forgotten: entry.forgotten }
  })
  result.unplaced = result.unplaced.slice(0, 20).map((phrase) => phrase.slice(0, 300))
  return result
}

/** The practice parser behind the parser boundary. Nothing leaves the device. */
export const onDeviceParser: HandNarrationParser = {
  kind: 'on-device',
  description: 'Practice parser: reads common shorthand on this device. Nothing is sent anywhere.',
  async parse(request) {
    return interpretLocally(request.text, request.context)
  },
}
