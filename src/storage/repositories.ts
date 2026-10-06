import type { AppSettings, HandRecord, PlayerProfile, RakeStructure, Session } from '../domain/poker/models'
import { withSeatOccupancy } from '../domain/poker/occupancy'
import { BUILT_IN_RAKE_PRESETS } from '../domain/poker/rake'
import { STORES, idb } from './db'

/**
 * Repository contracts.
 *
 * Components depend on these interfaces, never on IndexedDB. When accounts
 * arrive, an `ApiSessionRepository` implementing the same five methods against
 * a Worker + D1 backend drops straight in; the only new concern is conflict
 * resolution, which the UUID primary keys and `updatedAt` stamps already
 * support.
 */

export interface SessionRepository {
  list(): Promise<Session[]>
  get(id: string): Promise<Session | undefined>
  save(session: Session): Promise<void>
  remove(id: string): Promise<void>
}

export interface HandRepository {
  listAll(): Promise<HandRecord[]>
  listBySession(sessionId: string): Promise<HandRecord[]>
  get(id: string): Promise<HandRecord | undefined>
  save(hand: HandRecord): Promise<void>
  remove(id: string): Promise<void>
}

export interface PlayerRepository {
  listAll(): Promise<PlayerProfile[]>
  listBySession(sessionId: string): Promise<PlayerProfile[]>
  get(id: string): Promise<PlayerProfile | undefined>
  save(player: PlayerProfile): Promise<void>
  saveMany(players: readonly PlayerProfile[]): Promise<void>
  remove(id: string): Promise<void>
}

export interface RakePresetRepository {
  list(): Promise<RakeStructure[]>
  save(preset: RakeStructure): Promise<void>
  remove(id: string): Promise<void>
}

export interface SettingsRepository {
  get(): Promise<AppSettings>
  save(settings: AppSettings): Promise<void>
}

export interface Repositories {
  sessions: SessionRepository
  hands: HandRepository
  players: PlayerRepository
  rakePresets: RakePresetRepository
  settings: SettingsRepository
}

export const DEFAULT_SETTINGS: AppSettings = {
  id: 'settings',
  defaultLocation: '',
  defaultTableSize: 9,
  defaultRakePresetId: null,
  confirmStreetTransitions: true,
}

const byNewestSession = (a: Session, b: Session) => b.startedAt.localeCompare(a.startedAt)
const byNewestHand = (a: HandRecord, b: HandRecord) =>
  b.createdAt.localeCompare(a.createdAt) || b.handNumber - a.handNumber

export const indexedDbRepositories: Repositories = {
  sessions: {
    // Sessions saved before seat occupancy existed come back with every chair
    // occupied; the explicit statuses are written on the next save.
    async list() {
      const sessions = await idb.getAll<Session>(STORES.sessions)
      return sessions.map(withSeatOccupancy).sort(byNewestSession)
    },
    async get(id) {
      const session = await idb.get<Session>(STORES.sessions, id)
      return session && withSeatOccupancy(session)
    },
    save: (session) => idb.put(STORES.sessions, session),
    remove: (id) => idb.remove(STORES.sessions, id),
  },

  hands: {
    async listAll() {
      const hands = await idb.getAll<HandRecord>(STORES.hands)
      return hands.sort(byNewestHand)
    },
    async listBySession(sessionId) {
      const hands = await idb.getAllByIndex<HandRecord>(STORES.hands, 'sessionId', sessionId)
      return hands.sort((a, b) => b.handNumber - a.handNumber)
    },
    get: (id) => idb.get<HandRecord>(STORES.hands, id),
    save: (hand) => idb.put(STORES.hands, hand),
    remove: (id) => idb.remove(STORES.hands, id),
  },

  players: {
    async listAll() {
      const players = await idb.getAll<PlayerProfile>(STORES.players)
      return players.sort((a, b) => (a.seat ?? 0) - (b.seat ?? 0))
    },
    async listBySession(sessionId) {
      const players = await idb.getAllByIndex<PlayerProfile>(STORES.players, 'sessionId', sessionId)
      return players.sort((a, b) => (a.seat ?? 0) - (b.seat ?? 0))
    },
    get: (id) => idb.get<PlayerProfile>(STORES.players, id),
    save: (player) => idb.put(STORES.players, player),
    saveMany: (players) => idb.putMany(STORES.players, players),
    remove: (id) => idb.remove(STORES.players, id),
  },

  rakePresets: {
    async list() {
      const saved = await idb.getAll<RakeStructure>(STORES.rakePresets)
      const savedIds = new Set(saved.map((preset) => preset.id))
      // Built-ins are always offered, but a saved preset with the same id wins.
      return [...BUILT_IN_RAKE_PRESETS.filter((preset) => !savedIds.has(preset.id)), ...saved]
    },
    save: (preset) => idb.put(STORES.rakePresets, preset),
    remove: (id) => idb.remove(STORES.rakePresets, id),
  },

  settings: {
    async get() {
      const stored = await idb.get<AppSettings>(STORES.settings, 'settings')
      return { ...DEFAULT_SETTINGS, ...stored, id: 'settings' }
    },
    save: (settings) => idb.put(STORES.settings, settings),
  },
}
