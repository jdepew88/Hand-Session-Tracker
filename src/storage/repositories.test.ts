import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { createHandRecord, createHandSetup, createPlayer, createSession, defaultSeats } from '../domain/poker/factories'
import { EXAMPLE_STREET_DROP } from '../domain/poker/rake'
import { STORES, idb, resetDatabaseConnection } from './db'
import { DEFAULT_SETTINGS, indexedDbRepositories as repos } from './repositories'

function session() {
  return createSession({
    location: 'Commerce Casino',
    gameType: "No-Limit Hold'em",
    smallBlind: 500,
    bigBlind: 500,
    tableSize: 9,
    buyIn: 50_000,
    startingStack: 50_000,
    rake: EXAMPLE_STREET_DROP,
  })
}

beforeEach(async () => {
  resetDatabaseConnection()
  for (const store of Object.values(STORES)) await idb.clear(store)
})

describe('session repository', () => {
  it('stores and reads back a session', async () => {
    const created = session()
    await repos.sessions.save(created)

    const loaded = await repos.sessions.get(created.id)
    expect(loaded?.location).toBe('Commerce Casino')
    expect(loaded?.rake.flop).toBe(350)
    expect(await repos.sessions.list()).toHaveLength(1)
  })

  it('removes a session', async () => {
    const created = session()
    await repos.sessions.save(created)
    await repos.sessions.remove(created.id)
    expect(await repos.sessions.list()).toHaveLength(0)
  })
})

describe('hand repository', () => {
  it('lists hands for one session only', async () => {
    const a = session()
    const b = session()
    await repos.sessions.save(a)
    await repos.sessions.save(b)

    const setup = createHandSetup({
      session: a,
      buttonSeat: 9,
      heroSeat: 3,
      seats: defaultSeats(9, 50_000),
    })
    await repos.hands.save(createHandRecord(a, setup, 1))
    await repos.hands.save(createHandRecord(a, setup, 2))
    await repos.hands.save(
      createHandRecord(b, createHandSetup({ session: b, buttonSeat: 9, heroSeat: 1, seats: defaultSeats(9, 50_000) }), 1),
    )

    const forA = await repos.hands.listBySession(a.id)
    expect(forA).toHaveLength(2)
    expect(forA[0]!.handNumber).toBe(2) // newest first
    expect(await repos.hands.listAll()).toHaveLength(3)
  })

  it('round-trips the whole event log through the database', async () => {
    const created = session()
    const setup = createHandSetup({
      session: created,
      buttonSeat: 9,
      heroSeat: 3,
      seats: defaultSeats(9, 50_000),
    })
    const record = createHandRecord(created, setup, 1)
    record.events = [
      { id: 'e1', kind: 'action', street: 'preflop', seat: 3, action: 'raise', to: 1500 },
      { id: 'e2', kind: 'deal', street: 'flop', cards: ['Kd', '8s', '3c'] },
    ]
    record.setup.heroCards = ['As', 'Ks']
    await repos.hands.save(record)

    const loaded = await repos.hands.get(record.id)
    expect(loaded?.events).toEqual(record.events)
    expect(loaded?.setup.heroCards).toEqual(['As', 'Ks'])
  })
})

describe('player repository', () => {
  it('keeps a lineup per session, ordered by seat', async () => {
    const created = session()
    const three = { ...createPlayer(created.id, 3), nickname: 'Grey Hoodie' }
    const one = { ...createPlayer(created.id, 1), nickname: 'Mike' }
    await repos.players.saveMany([three, one])

    const lineup = await repos.players.listBySession(created.id)
    expect(lineup.map((player) => player.seat)).toEqual([1, 3])
    expect(lineup[1]!.nickname).toBe('Grey Hoodie')
  })
})

describe('rake presets and settings', () => {
  it('always offers the built-in presets', async () => {
    const presets = await repos.rakePresets.list()
    expect(presets.map((preset) => preset.id)).toContain('no-rake')
  })

  it('lets a saved preset override a built-in of the same id', async () => {
    await repos.rakePresets.save({ ...EXAMPLE_STREET_DROP, name: 'My room', flop: 400 })
    const presets = await repos.rakePresets.list()
    const match = presets.filter((preset) => preset.id === EXAMPLE_STREET_DROP.id)
    expect(match).toHaveLength(1)
    expect(match[0]!.name).toBe('My room')
    expect(match[0]!.flop).toBe(400)
  })

  it('falls back to defaults before anything is saved', async () => {
    expect(await repos.settings.get()).toEqual(DEFAULT_SETTINGS)
    await repos.settings.save({ ...DEFAULT_SETTINGS, defaultLocation: 'Commerce Casino' })
    expect((await repos.settings.get()).defaultLocation).toBe('Commerce Casino')
  })
})
