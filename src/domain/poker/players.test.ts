import { describe, expect, it } from 'vitest'
import { createHandSetup, createPlayer, createSession, defaultSeats } from './factories'
import type { PlayerProfile, Session } from './models'
import { newHandSeating } from './occupancy'
import { resolveReference, resolveTogether, tableReferences } from './playerRefs'
import {
  SeatingError,
  hasIdentity,
  leaveTable,
  legacyStyle,
  movePlayer,
  parseAliases,
  playerTags,
  playersWhoLeft,
  seatedPlayer,
  takeSeat,
  withPlayerDetails,
} from './players'
import { describeTable, seatLabel } from './tableView'

const NOW = '2026-10-08T03:00:00.000Z'

function session(overrides: Partial<Session> = {}): Session {
  return {
    ...createSession({
      location: 'Commerce Casino',
      gameType: "No-Limit Hold'em",
      smallBlind: 200,
      bigBlind: 500,
      tableSize: 9,
      buyIn: 100_000,
      startingStack: 100_000,
      heroSeat: 3,
      buttonSeat: 9,
    }),
    ...overrides,
  }
}

const player = (s: Session, seat: number | null, patch: Partial<PlayerProfile> = {}): PlayerProfile => ({
  ...createPlayer(s.id, seat ?? 1),
  seat,
  ...patch,
})

describe('a player is not a seat', () => {
  it('finds whoever sits in a chair now, and nobody in an empty chair', () => {
    const s = session({ seatStatus: { ...session().seatStatus, 6: 'empty' } })
    const coffee = player(s, 4, { nickname: 'Old Man Coffee' })
    const gone = player(s, 6, { nickname: 'Left Earlier' })
    expect(seatedPlayer([coffee, gone], s, 4)).toBe(coffee)
    expect(seatedPlayer([coffee, gone], s, 6)).toBeNull()
    expect(seatedPlayer([coffee], { ...s, id: 'other' }, 4)).toBeNull()
  })

  it('lets a player leave with their notes, and a new occupant starts clean', () => {
    const s = session()
    const hoodie = withPlayerDetails(player(s, 4), { nickname: 'Hoodie Guy', tags: ['Aggressive'], notes: 'Bluffs rivers.', aliases: [] }, NOW)
    const left = leaveTable(hoodie, NOW)
    expect(left).toMatchObject({ seat: null, leftAt: NOW, nickname: 'Hoodie Guy', notes: 'Bluffs rivers.' })
    expect(seatedPlayer([left], s, 4)).toBeNull()
    expect(describeTable(s, [left]).find((view) => view.seat === 4)).toMatchObject({ player: null, nickname: '', tags: [] })
    expect(playersWhoLeft([left], s)).toEqual([left])
    // Back again: same person, same notes.
    expect(seatedPlayer([takeSeat(left, 7)], s, 7)?.notes).toBe('Bluffs rivers.')
  })

  it('treats a profile left on a since-emptied chair (saved before players could leave) as gone', () => {
    const s = session({ seatStatus: { ...session().seatStatus, 4: 'empty' } })
    const stale = player(s, 4, { nickname: 'Sunglasses' })
    expect(seatedPlayer([stale], s, 4)).toBeNull()
    expect(playersWhoLeft([stale], s)).toEqual([stale])
  })

  it('moves a player to an empty chair, taking everything with them', () => {
    const s = session({ seatStatus: { ...session().seatStatus, 7: 'empty' } })
    const coffee = player(s, 4, { nickname: 'Old Man Coffee', notes: 'Limp-calls.', tags: ['Passive'], currentStack: 64_000 })
    const { session: next, moved } = movePlayer(s, [coffee], 4, 7)
    expect(moved).toMatchObject({ id: coffee.id, seat: 7, notes: 'Limp-calls.', tags: ['Passive'], currentStack: 64_000 })
    expect(next.seatStatus[4]).toBe('empty')
    expect(next.seatStatus[7]).toBe('occupied')
    expect(next.buttonSeat).toBe(9)
    expect(next.heroSeat).toBe(3)
    expect(seatedPlayer([moved!], next, 7)?.id).toBe(coffee.id)
  })

  it("moves Hero's seat with Hero, and refuses a taken chair", () => {
    const s = session({ seatStatus: { ...session().seatStatus, 8: 'empty' } })
    expect(movePlayer(s, [], 3, 8).session.heroSeat).toBe(8)
    expect(() => movePlayer(s, [], 3, 5)).toThrow(SeatingError)
  })
})

describe('tags, notes and aliases', () => {
  it('keeps tags in a fixed order and reads old styles as tags', () => {
    const s = session()
    const p = withPlayerDetails(player(s, 2), { nickname: 'x', tags: ['Passive', 'Tight'], notes: '', aliases: [] }, NOW)
    expect(playerTags(p)).toEqual(['Tight', 'Passive'])
    const legacy = { ...player(s, 2), archetype: 'Loose Aggressive' as const }
    delete legacy.tags
    expect(playerTags(legacy)).toEqual(['Loose', 'Aggressive'])
    const coffee = { ...player(s, 2), archetype: 'Old Man Coffee' as const }
    delete coffee.tags
    expect(playerTags(coffee)).toEqual([])
    expect(legacyStyle(coffee)).toBe('Old Man Coffee')
  })

  it('stamps notes only when they change', () => {
    const s = session()
    const first = withPlayerDetails(player(s, 2), { nickname: 'Mike', tags: [], notes: 'Very chatty.', aliases: [] }, NOW)
    expect(first.notesUpdatedAt).toBe(NOW)
    const renamed = withPlayerDetails(first, { nickname: 'Mike T', tags: [], notes: 'Very chatty.', aliases: [] }, '2026-10-08T04:00:00.000Z')
    expect(renamed.notesUpdatedAt).toBe(NOW)
    expect(hasIdentity(createPlayer(s.id, 1))).toBe(false)
  })

  it('reads aliases as a short, de-duplicated list', () => {
    expect(parseAliases('hoodie, Sunglasses guy ,HOODIE,, ')).toEqual(['hoodie', 'Sunglasses guy'])
  })

  it('says the tags in seat labels, in words', () => {
    const s = session()
    const p = withPlayerDetails(player(s, 4, { currentStack: 64_000 }), { nickname: 'Old Man Coffee', tags: ['Tight', 'Passive'], notes: '', aliases: [] }, NOW)
    expect(seatLabel(describeTable(s, [p]).find((view) => view.seat === 4)!)).toBe(
      'Seat 4, Under the gun plus 1, Old Man Coffee, Tight and Passive, stack $640',
    )
  })
})

describe('hands keep their own snapshot', () => {
  it('copies the label into a new hand, and a later rename leaves the hand alone', () => {
    const s = session()
    const hoodie = player(s, 5, { nickname: 'Hoodie Guy' })
    const setup = createHandSetup({ session: s, ...newHandSeating(s, [hoodie]) })
    expect(setup.seats.find((seat) => seat.seat === 5)).toMatchObject({ label: 'Hoodie Guy', playerId: hoodie.id })
    const renamed = withPlayerDetails(hoodie, { nickname: 'Mike', tags: [], notes: '', aliases: [] }, NOW)
    expect(setup.seats.find((seat) => seat.seat === 5)!.label).toBe('Hoodie Guy')
    expect(defaultSeats(9, 100_000, [renamed]).find((seat) => seat.seat === 5)!.label).toBe('Mike')
  })

  it('does not deal a player who left into a new hand', () => {
    const s = session()
    const gone = leaveTable(player(s, 5, { nickname: 'Hoodie Guy' }), NOW)
    const setup = createHandSetup({ session: s, ...newHandSeating(s, [gone]) })
    expect(setup.seats.find((seat) => seat.seat === 5)!.label).toBeUndefined()
  })
})

describe('resolving who a phrase means', () => {
  // Button 9: SB 1, BB 2, UTG 3 (Hero), UTG+1 4, UTG+2 5, LJ 6, HJ 7, CO 8, BTN 9.
  function references() {
    const s = session()
    const players = [
      player(s, 2, { nickname: 'Old Man Coffee', tags: ['Tight', 'Passive'] }),
      player(s, 8, { nickname: 'Hoodie Guy', aliases: ['Mike', 'sunglasses guy'], tags: ['Aggressive', 'Reg'] }),
      player(s, 6, { nickname: 'Quiet Reg', tags: ['Tight', 'Reg'], notes: 'Hoodie guy is his friend.' }),
      player(s, 3, { nickname: '', notes: 'Hero notes: tired.' }),
    ]
    return tableReferences(s, players)
  }

  const seats = (phrase: string) => resolveReference(references(), phrase).map((match) => `${match.seat}:${match.via}`)

  it('matches labels, partial labels and aliases', () => {
    expect(seats('hoodie guy')).toEqual(['8:label'])
    expect(seats('the hoodie')).toEqual(['8:label'])
    expect(seats('Mike')).toEqual(['8:alias'])
    expect(seats('sunglasses guy')).toEqual(['8:alias'])
    expect(seats('the old guy')).toEqual(['2:label'])
  })

  it('matches seats, positions and Hero', () => {
    expect(seats('seat six')).toEqual(['6:seat'])
    expect(seats('seat 6')).toEqual(['6:seat'])
    expect(seats('the cutoff')).toEqual(['8:position'])
    expect(seats('big blind')).toEqual(['2:position'])
    expect(seats('the button')).toEqual(['9:position'])
    expect(seats('me')).toEqual(['3:hero'])
  })

  it('matches tags, and reports every candidate rather than choosing', () => {
    expect(seats('the reg')).toEqual(['6:label', '8:tag'])
    expect(seats('the tight reg')).toEqual(['6:tag'])
  })

  it('never searches notes', () => {
    // "Hoodie guy is his friend." is in seat 6's notes; only seat 8 is Hoodie Guy.
    expect(seats('his friend')).toEqual([])
    expect(seats('tired')).toEqual([])
  })

  it('narrows several phrases together: "the old guy in the big blind"', () => {
    expect(resolveTogether(references(), ['the old guy', 'big blind']).map((match) => match.seat)).toEqual([2])
    expect(resolveTogether(references(), ['the old guy', 'cutoff'])).toEqual([])
  })
})
