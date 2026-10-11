import { describe, expect, it } from 'vitest'
import { CORPUS, act, person, response, street, to } from './fixtures/corpus'
import { InterpretationError, fillUnsaid, readInterpretation } from './schema'

const valid = () =>
  JSON.parse(
    JSON.stringify(
      response({
        heroPositions: [{ position: 'CO', said: "I'm cutoff" }],
        people: [person('p1', ['BB'], 'BB')],
        streets: [street('preflop', [act('hero', 'raise', 'Raise 17', { size: to(17) }), act('p1', 'call', 'BB calls')])],
      }),
    ),
  ) as Record<string, unknown>

const rejects = (value: unknown) => expect(() => readInterpretation(value)).toThrow(InterpretationError)

describe('the parser response contract', () => {
  it('accepts a well-formed response, and every response in the corpus', () => {
    expect(readInterpretation(valid()).streets[0]!.items).toHaveLength(2)
    for (const entry of CORPUS) expect(() => readInterpretation(JSON.parse(JSON.stringify(entry.response)))).not.toThrow()
  })

  it('rejects anything that is not exactly the contract', () => {
    rejects(null)
    rejects('{"version":1}')
    rejects([])
    rejects({ ...valid(), version: 2 })
    rejects({ ...valid(), extra: 'field' })
    const missing = valid()
    delete missing.people
    rejects(missing)
  })

  it('rejects wrong types and values deep inside', () => {
    const badAction = valid()
    ;(badAction.streets as { items: { action: string }[] }[])[0]!.items[0]!.action = 'teleport'
    rejects(badAction)

    const badCard = valid()
    badCard.heroCards = { cards: [{ rank: 'Z', suit: 's' }, { rank: 'K', suit: null }], suited: null, said: 'AK' }
    rejects(badCard)

    const extraInCard = valid()
    extraInCard.heroCards = { cards: [{ rank: 'A', suit: 's', colour: 'black' }, { rank: 'K', suit: null }], suited: null, said: 'AK' }
    rejects(extraInCard)

    const badSize = valid()
    ;(badSize.streets as { items: { size: unknown }[] }[])[0]!.items[0]!.size = { kind: 'to', dollars: -5, approximate: false }
    rejects(badSize)

    const hugeSize = valid()
    ;(hugeSize.streets as { items: { size: unknown }[] }[])[0]!.items[0]!.size = { kind: 'pot', ratio: 500 }
    rejects(hugeSize)
  })

  it('rejects references to people who are not listed', () => {
    const ghost = valid()
    ;(ghost.streets as { items: { actor: string }[] }[])[0]!.items[1]!.actor = 'p7'
    rejects(ghost)
    const notAnId = valid()
    ;(notAnId.streets as { items: { actor: string }[] }[])[0]!.items[1]!.actor = 'seat 4'
    rejects(notAnId)
  })

  it('rejects streets out of order, a pattern off the flop, and oversized text and lists', () => {
    const order = valid()
    order.streets = [street('flop', []), street('preflop', [])]
    rejects(order)

    const turnPattern = valid()
    turnPattern.streets = [street('turn', [], { cards: [], pattern: 'rainbow', patternSuit: null, description: null, said: 'turn' })]
    rejects(turnPattern)

    const long = valid()
    long.unplaced = ['x'.repeat(301)]
    rejects(long)

    const many = valid()
    many.people = Array.from({ length: 10 }, (_, index) => person(`p${index + 1}`, ['someone']))
    rejects(many)
  })

  it('keeps returned strings as plain text, stripping control characters', () => {
    const value = valid()
    value.unplaced = ['<img src=x onerror=alert(1)>\u0000\u0007']
    expect(readInterpretation(value).unplaced).toEqual(['<img src=x onerror=alert(1)>'])
  })
})

describe('fields a model leaves out', () => {
  const full = () => JSON.parse(JSON.stringify(response({
    people: [person('p1', ['BB'], 'BB')],
    streets: [street('preflop', [act('hero', 'raise', 'raise 15', { size: to(15) }), act('p1', 'call', 'BB calls')])],
  }))) as Record<string, unknown>

  it('fills only fields whose empty value means "not said"', () => {
    const value = full()
    for (const key of ['showdown', 'result', 'pot', 'contradictions', 'unplaced']) delete value[key]
    const streets = value.streets as Record<string, unknown>[]
    delete streets[0]!.forgotten
    delete (streets[0]!.items as Record<string, unknown>[])[1]!.timing
    expect(() => readInterpretation(value)).toThrow(InterpretationError)
    expect(readInterpretation(fillUnsaid(value))).toEqual(readInterpretation(full()))
  })

  it('never overrides what is there, and leaves every other problem to the strict reader', () => {
    const present = { ...full(), pot: { dollars: 40, approximate: true, said: 'about 40' } }
    expect(readInterpretation(fillUnsaid(present)).pot).toEqual({ dollars: 40, approximate: true, said: 'about 40' })

    const noVersion = full()
    delete noVersion.version
    expect(() => readInterpretation(fillUnsaid(noVersion))).toThrow(InterpretationError)
    expect(() => readInterpretation(fillUnsaid({ ...full(), extra: 1 }))).toThrow(InterpretationError)
    expect(() => readInterpretation(fillUnsaid({ ...full(), showdown: 'none' }))).toThrow(InterpretationError)
    const noSaid = full()
    delete ((noSaid.streets as Record<string, unknown>[])[0]!.items as Record<string, unknown>[])[0]!.said
    expect(() => readInterpretation(fillUnsaid(noSaid))).toThrow(InterpretationError)
    expect(fillUnsaid('junk')).toBe('junk')
  })
})
