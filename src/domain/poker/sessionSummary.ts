import type { Cents } from '../money'
import type { HandRecord, Session } from './models'

/**
 * The figures a session is judged by, derived from the session record alone.
 *
 * The result is the cash-out minus every buy-in -- the same figure the session
 * page has always shown -- and exists only once the session is cashed out.
 * Nothing here estimates a live result: chips on the table are not money until
 * they come off it. Results/bankroll screens should build on these helpers
 * rather than re-deriving them.
 */

/**
 * `unsettled`: ended with no cash-out recorded. The app ends a session and
 * records its cash-out together, so this only guards against odd data.
 */
export type SessionOutcome = 'live' | 'win' | 'loss' | 'even' | 'unsettled'

export interface SessionSummary {
  id: string
  location: string
  gameType: string
  smallBlind: Cents
  bigBlind: Cents
  tableSize: number
  startedAt: string
  endedAt: string | null
  /** No end time yet. */
  live: boolean
  /** Sum of every buy-in, including rebuys and add-ons. */
  totalBuyIn: Cents
  buyInCount: number
  /** Null until the session is cashed out. */
  cashOut: Cents | null
  /** cashOut - totalBuyIn; null until cashed out. */
  result: Cents | null
  outcome: SessionOutcome
  /** Whole minutes from start to end (or to `now` while live); null if the times are unusable. */
  durationMinutes: number | null
  handCount: number
}

export function totalBuyIn(session: Pick<Session, 'buyIns'>): Cents {
  return session.buyIns.reduce((sum, entry) => sum + entry.amount, 0)
}

export function sessionResult(session: Pick<Session, 'buyIns' | 'cashOut'>): Cents | null {
  return session.cashOut === null ? null : session.cashOut - totalBuyIn(session)
}

export function sessionOutcome(session: Pick<Session, 'buyIns' | 'cashOut' | 'endedAt'>): SessionOutcome {
  if (session.endedAt === null) return 'live'
  const result = sessionResult(session)
  if (result === null) return 'unsettled'
  return result > 0 ? 'win' : result < 0 ? 'loss' : 'even'
}

export function sessionDurationMinutes(
  session: Pick<Session, 'startedAt' | 'endedAt'>,
  now: number = Date.now(),
): number | null {
  const start = Date.parse(session.startedAt)
  const end = session.endedAt === null ? now : Date.parse(session.endedAt)
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null
  return Math.floor((end - start) / 60_000)
}

export function summarizeSession(
  session: Session,
  hands: readonly Pick<HandRecord, 'sessionId'>[],
  now: number = Date.now(),
): SessionSummary {
  return {
    id: session.id,
    location: session.location,
    gameType: session.gameType,
    smallBlind: session.smallBlind,
    bigBlind: session.bigBlind,
    tableSize: session.tableSize,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    live: session.endedAt === null,
    totalBuyIn: totalBuyIn(session),
    buyInCount: session.buyIns.length,
    cashOut: session.cashOut,
    result: sessionResult(session),
    outcome: sessionOutcome(session),
    durationMinutes: sessionDurationMinutes(session, now),
    handCount: hands.filter((hand) => hand.sessionId === session.id).length,
  }
}
