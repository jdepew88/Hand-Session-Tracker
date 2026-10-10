import { describe, expect, it } from 'vitest'
import { parseCardsShorthand, parseHoleShorthand } from './shorthand'

describe('card shorthand', () => {
  it('reads exact cards in the common spellings', () => {
    const exact = [
      { rank: 'A', suit: 's' },
      { rank: 'K', suit: 'd' },
    ]
    expect(parseCardsShorthand('AsKd')).toEqual(exact)
    expect(parseCardsShorthand('A♠ K♦')).toEqual(exact)
    expect(parseCardsShorthand('as, kd')).toEqual(exact)
    expect(parseCardsShorthand('10c 8h 2c')).toEqual([
      { rank: 'T', suit: 'c' },
      { rank: '8', suit: 'h' },
      { rank: '2', suit: 'c' },
    ])
  })

  it('leaves out what was not said', () => {
    expect(parseCardsShorthand('T82')).toEqual([
      { rank: 'T', suit: null },
      { rank: '8', suit: null },
      { rank: '2', suit: null },
    ])
    expect(parseCardsShorthand('?h')).toEqual([{ rank: null, suit: 'h' }])
  })

  it('reads suited and offsuit without inventing suits', () => {
    expect(parseHoleShorthand('AKs')).toEqual({
      cards: [
        { rank: 'A', suit: null },
        { rank: 'K', suit: null },
      ],
      suited: true,
    })
    expect(parseHoleShorthand('AKo')?.suited).toBe(false)
    expect(parseHoleShorthand('QQ')).toEqual({
      cards: [
        { rank: 'Q', suit: null },
        { rank: 'Q', suit: null },
      ],
      suited: null,
    })
  })

  it('rejects anything that is not cards', () => {
    expect(parseCardsShorthand('hello')).toBeNull()
    expect(parseCardsShorthand('')).toBeNull()
    expect(parseHoleShorthand('AKQ')).toBeNull()
  })
})
