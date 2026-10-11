import { describe, expect, it } from 'vitest'
import { SECRET_NOTE, corpusTable } from './fixtures/table'
import { readNarrationContext } from './context'

describe('the context sent with a narration', () => {
  it('holds only the game, the blinds, the seats dealt in and how players are known', () => {
    const { context } = corpusTable()
    expect(Object.keys(context).sort()).toEqual(['bigBlind', 'buttonSeat', 'game', 'heroSeat', 'seats', 'smallBlind', 'tableSize', 'version'])
    expect(context).toMatchObject({ game: "No-Limit Hold'em", smallBlind: 2, bigBlind: 5, tableSize: 9, heroSeat: 5, buttonSeat: 5 })
    expect(context.seats).toHaveLength(9)
    for (const seat of context.seats) expect(Object.keys(seat).sort()).toEqual(['aliases', 'hero', 'label', 'position', 'seat', 'stack', 'tags'])
  })

  it('includes labels, aliases and tags so phrases can be matched', () => {
    const { context } = corpusTable()
    expect(context.seats.find((seat) => seat.seat === 4)).toEqual({
      seat: 4,
      hero: false,
      label: 'Hoodie Guy',
      aliases: ['hoodie', 'sunglasses guy'],
      tags: ['Aggressive', 'Reg'],
      stack: 640,
      position: 'CO',
    })
    expect(context.seats.find((seat) => seat.seat === 5)).toMatchObject({ hero: true, position: 'BTN' })
  })

  it('never carries notes, ids, session or result data', () => {
    const { context, session, players } = corpusTable()
    const sent = JSON.stringify(context)
    expect(sent).not.toContain(SECRET_NOTE)
    expect(sent).not.toContain('Hero notes')
    expect(sent).not.toContain(session.id)
    for (const player of players) expect(sent).not.toContain(player.id)
    expect(sent).not.toMatch(/notes|buyIn|cashOut|location|Commerce/i)
  })

  it('is read back strictly at the server', () => {
    const { context } = corpusTable()
    expect(readNarrationContext(JSON.parse(JSON.stringify(context)))).toEqual(context)
    expect(readNarrationContext({ ...context, notes: 'sneaky' })).toBeNull()
    expect(readNarrationContext({ ...context, seats: context.seats.map((seat) => ({ ...seat, notes: SECRET_NOTE })) })).toBeNull()
    expect(readNarrationContext({ ...context, heroSeat: 3 })).toBeNull()
    expect(readNarrationContext({ ...context, seats: [context.seats[0]] })).toBeNull()
    expect(readNarrationContext({ ...context, seats: context.seats.map((seat) => ({ ...seat, tags: ['Fish'] })) })).toBeNull()
  })
})
