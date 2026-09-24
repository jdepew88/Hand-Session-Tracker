import { useStore } from './context'
import type { Session } from '../domain/poker/models'

/**
 * Resolves the session the app should be working in.
 *
 * Falls back to the most recent still-open session when the remembered id no
 * longer exists, so deleting a session or clearing storage never strands the
 * Record and Table tabs.
 */
export function useActiveSession(): {
  session: Session | null
  sessions: Session[]
  ready: boolean
} {
  const { sessions, activeSessionId, ready } = useStore()
  const remembered = sessions.find((session) => session.id === activeSessionId)
  const fallback = sessions.find((session) => session.endedAt === null) ?? sessions[0]
  return { session: remembered ?? fallback ?? null, sessions, ready }
}
