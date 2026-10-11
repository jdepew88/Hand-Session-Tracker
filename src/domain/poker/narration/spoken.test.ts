import { describe, expect, it } from 'vitest'
import { cardsKey, parseMoney, parsePosition, parsePotRatio, parseSeatNumber, parseSpokenCards } from './spoken'

const read = (text: string, slots: number) => {
  const result = parseSpokenCards(text, slots)
  return result ? { cards: cardsKey(result.cards), suited: result.suited, pattern: result.pattern, patternSuit: result.patternSuit, description: result.description } : null
}

describe('money and pot fractions', () => {
  it('reads dollar amounts', () => {
    expect(parseMoney('$17')).toBe(17)
    expect(parseMoney('17 dollars')).toBe(17)
    expect(parseMoney('17')).toBe(17)
    expect(parseMoney('$1,250')).toBe(1250)
    expect(parseMoney('1.5k')).toBe(1500)
    expect(parseMoney('seventeen-ish')).toBeNull()
    expect(parseMoney('-5')).toBeNull()
  })

  it('reads pot fractions without turning them into dollars', () => {
    expect(parsePotRatio('half pot')).toBe(0.5)
    expect(parsePotRatio('two thirds')).toBe(0.67)
    expect(parsePotRatio('2/3 pot')).toBe(0.67)
    expect(parsePotRatio('⅔')).toBe(0.67)
    expect(parsePotRatio('pot')).toBe(1)
    expect(parsePotRatio('1.2x pot')).toBe(1.2)
    expect(parsePotRatio('1.2x')).toBe(1.2)
    expect(parsePotRatio('75% pot')).toBe(0.75)
    expect(parsePotRatio('a lot')).toBeNull()
  })
})

describe('seats and positions', () => {
  it('reads seat numbers in words and digits', () => {
    expect(parseSeatNumber('seat six')).toBe(6)
    expect(parseSeatNumber('Seat 6')).toBe(6)
    expect(parseSeatNumber('s6')).toBe(6)
    expect(parseSeatNumber('seat eleven')).toBeNull()
  })

  it('reads position words and abbreviations', () => {
    expect(parsePosition('BB')).toBe('BB')
    expect(parsePosition('big blind')).toBe('BB')
    expect(parsePosition('the cutoff')).toBe('CO')
    expect(parsePosition('cut off')).toBe('CO')
    expect(parsePosition('CO')).toBe('CO')
    expect(parsePosition('BTN')).toBe('BTN')
    expect(parsePosition('the button')).toBe('BTN')
    expect(parsePosition('under the gun')).toBe('UTG')
    expect(parsePosition('UTG+1')).toBe('UTG+1')
    expect(parsePosition('hijack')).toBe('HJ')
    expect(parsePosition('hoodie guy')).toBeNull()
  })
})

describe('spoken cards', () => {
  it('reads hands with and without suits', () => {
    expect(read('jack ten of hearts', 2)).toMatchObject({ cards: 'Jh Th', suited: null })
    expect(read('ace king suited', 2)).toMatchObject({ cards: 'A? K?', suited: true })
    expect(read('ace king offsuit', 2)).toMatchObject({ cards: 'A? K?', suited: false })
    expect(read('AKs', 2)).toMatchObject({ cards: 'A? K?', suited: true })
    expect(read('AKo', 2)).toMatchObject({ cards: 'A? K?', suited: false })
    expect(read('AK', 2)).toMatchObject({ cards: 'A? K?', suited: null })
    expect(read('AsKd', 2)).toMatchObject({ cards: 'As Kd' })
    expect(read('ace of spades king of diamonds', 2)).toMatchObject({ cards: 'As Kd' })
  })

  it('reads pairs, and only names suits that the words fix', () => {
    expect(read('pocket tens', 2)).toMatchObject({ cards: 'T? T?' })
    // Only two suits are red: "red queens" is exactly Q♥ Q♦.
    expect(read('red queens', 2)).toMatchObject({ cards: 'Qh Qd' })
    expect(read('black aces', 2)).toMatchObject({ cards: 'As Ac' })
  })

  it('reads boards, keeping a suit pattern as a pattern', () => {
    expect(read('ace king queen all spades', 3)).toMatchObject({ cards: 'As Ks Qs', pattern: 'monotone', patternSuit: 's' })
    expect(read('ten eight two two clubs', 3)).toMatchObject({ cards: 'T? 8? 2?', pattern: 'two-tone', patternSuit: 'c' })
    expect(read('T82 two clubs', 3)).toMatchObject({ cards: 'T? 8? 2?', pattern: 'two-tone', patternSuit: 'c' })
    expect(read('A72 rainbow', 3)).toMatchObject({ cards: 'A? 7? 2?', pattern: 'rainbow' })
    expect(read('flop was K72', 3)).toMatchObject({ cards: 'K? 7? 2?', pattern: null })
    expect(read('nine of clubs', 1)).toMatchObject({ cards: '9c' })
    expect(read('king clubs turn', 1)).toMatchObject({ cards: 'Kc' })
  })

  it('keeps a description instead of inventing a card', () => {
    expect(read('turn was a brick', 1)).toMatchObject({ cards: '??', description: 'brick' })
    expect(read('blank', 1)).toMatchObject({ cards: '??', description: 'blank' })
    expect(read('some low club', 1)).toMatchObject({ cards: '?c', description: 'some low club' })
  })

  it('refuses what it does not understand rather than half-reading it', () => {
    expect(read('hoodie guy calls', 3)).toBeNull()
    expect(read('ace king queen jack', 3)).toBeNull()
    expect(read('red ace king', 2)).toBeNull()
  })
})
