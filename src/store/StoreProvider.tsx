import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type {
  AppSettings,
  HandRecord,
  PlayerProfile,
  RakeStructure,
  Session,
} from '../domain/poker/models'
import { PREFERENCE_KEYS, readPreference, writePreference } from '../storage/preferences'
import { DEFAULT_SETTINGS, indexedDbRepositories, type Repositories } from '../storage/repositories'
import { StoreContext, type StoreValue } from './context'

/**
 * Loads everything once and keeps it in memory.
 *
 * A local hand tracker holds at most a few thousand hands, so an in-memory
 * cache backed by write-through repository calls is simpler and faster than
 * query-per-screen. Writes go to IndexedDB first, then update the cache, so
 * what is on screen always matches what is stored.
 */
export function StoreProvider({
  children,
  repositories = indexedDbRepositories,
}: {
  children: ReactNode
  repositories?: Repositories
}) {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [hands, setHands] = useState<HandRecord[]>([])
  const [players, setPlayers] = useState<PlayerProfile[]>([])
  const [rakePresets, setRakePresets] = useState<RakeStructure[]>([])
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [activeSessionId, setActiveSessionIdState] = useState<string | null>(() =>
    readPreference(PREFERENCE_KEYS.activeSession),
  )

  const reload = useCallback(async () => {
    try {
      const [loadedSessions, loadedHands, loadedPlayers, loadedPresets, loadedSettings] =
        await Promise.all([
          repositories.sessions.list(),
          repositories.hands.listAll(),
          repositories.players.listAll(),
          repositories.rakePresets.list(),
          repositories.settings.get(),
        ])
      setSessions(loadedSessions)
      setHands(loadedHands)
      setPlayers(loadedPlayers)
      setRakePresets(loadedPresets)
      setSettings(loadedSettings)
      setError(null)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `Local storage is unavailable: ${cause.message}`
          : 'Local storage is unavailable.',
      )
    } finally {
      setReady(true)
    }
  }, [repositories])

  // Reading the local database on mount is exactly the "synchronise with an
  // external system" case an effect is for. The lint rule sees a function that
  // can call setState and cannot tell that every one of those calls happens
  // after an await, so it is suppressed here rather than worked around.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload()
  }, [reload])

  const setActiveSessionId = useCallback((id: string | null) => {
    setActiveSessionIdState(id)
    writePreference(PREFERENCE_KEYS.activeSession, id)
  }, [])

  const upsert = <T extends { id: string }>(list: T[], item: T): T[] => {
    const index = list.findIndex((entry) => entry.id === item.id)
    if (index === -1) return [item, ...list]
    const copy = [...list]
    copy[index] = item
    return copy
  }

  const value = useMemo<StoreValue>(
    () => ({
      ready,
      error,
      sessions,
      hands,
      players,
      rakePresets,
      settings,
      activeSessionId,
      setActiveSessionId,

      async saveSession(session) {
        const stamped = { ...session, updatedAt: new Date().toISOString() }
        await repositories.sessions.save(stamped)
        setSessions((current) =>
          upsert(current, stamped).sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
        )
      },

      async deleteSession(id) {
        const sessionHands = hands.filter((hand) => hand.sessionId === id)
        const sessionPlayers = players.filter((player) => player.sessionId === id)
        await Promise.all([
          ...sessionHands.map((hand) => repositories.hands.remove(hand.id)),
          ...sessionPlayers.map((player) => repositories.players.remove(player.id)),
          repositories.sessions.remove(id),
        ])
        setHands((current) => current.filter((hand) => hand.sessionId !== id))
        setPlayers((current) => current.filter((player) => player.sessionId !== id))
        setSessions((current) => current.filter((session) => session.id !== id))
        if (activeSessionId === id) setActiveSessionId(null)
      },

      async saveHand(hand) {
        const stamped = { ...hand, updatedAt: new Date().toISOString() }
        await repositories.hands.save(stamped)
        setHands((current) =>
          upsert(current, stamped).sort(
            (a, b) => b.createdAt.localeCompare(a.createdAt) || b.handNumber - a.handNumber,
          ),
        )
      },

      async deleteHand(id) {
        await repositories.hands.remove(id)
        setHands((current) => current.filter((hand) => hand.id !== id))
      },

      async savePlayers(updated) {
        const stamped = updated.map((player) => ({
          ...player,
          updatedAt: new Date().toISOString(),
        }))
        await repositories.players.saveMany(stamped)
        setPlayers((current) => stamped.reduce((list, player) => upsert(list, player), current))
      },

      async deletePlayer(id) {
        await repositories.players.remove(id)
        setPlayers((current) => current.filter((player) => player.id !== id))
      },

      async saveRakePreset(preset) {
        await repositories.rakePresets.save(preset)
        setRakePresets((current) => upsert(current, preset))
      },

      async deleteRakePreset(id) {
        await repositories.rakePresets.remove(id)
        setRakePresets(await repositories.rakePresets.list())
      },

      async saveSettings(next) {
        await repositories.settings.save(next)
        setSettings(next)
      },

      reload,
    }),
    [
      ready,
      error,
      sessions,
      hands,
      players,
      rakePresets,
      settings,
      activeSessionId,
      setActiveSessionId,
      repositories,
      reload,
    ],
  )

  return <StoreContext value={value}>{children}</StoreContext>
}
