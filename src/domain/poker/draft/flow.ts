import type { HandSetup, Street } from '../models'
import { blindSeats, postflopSeatOrder, preflopSeatOrder, seatsClockwiseFrom } from '../positions'
import type { DraftAction, DraftActionKind, HandDraft } from './model'

/**
 * Who acts, in what order, without needing a single amount.
 *
 * The engine (`replay`) needs exact chips to run; a remembered hand often has
 * none. This walks a draft with the same turn rules -- preflop order from the
 * blinds, postflop from the button, a bet or raise reopening the action for
 * everyone still live -- but tracks only who is in, who has matched the bet,
 * and who still owes an action. It is what lets the recorder say "CO to act"
 * and spot an impossible sequence ("checks into a bet") with no amounts at all.
 *
 * Only participants act. Everyone else dealt in folded preflop.
 */

/** The parts of a hand's setup the flow needs: the table, never the money. */
export type DraftTable = Pick<HandSetup, 'seats' | 'buttonSeat' | 'heroSeat' | 'straddles'>

export type FlowProblem =
  | 'not-participant'
  | 'folded'
  | 'all-in'
  | 'street-over'
  | 'already-acted'
  | 'check-facing-bet'
  | 'nothing-to-call'
  | 'bet-facing-bet'
  | 'raise-without-bet'

export interface FlowStep {
  action: DraftAction
  /** A bet was in front of the seat when it acted (preflop: always, the big blind). */
  facing: boolean
  /** Bets and raises on the street after this action; preflop the big blind is 1. */
  level: number
  /** Seats that owed an action before this one and whose action is not recorded. */
  skipped: number[]
  /** Set when the action cannot have happened. The step is then ignored. */
  problem: FlowProblem | null
}

export interface StreetFlow {
  street: Street
  /** Participants still in when the street began. */
  liveAtStart: number[]
  /** Participants still in after the recorded actions. */
  live: number[]
  allIn: number[]
  /** Seats that still owe an action, in order. Empty = the betting is over. */
  toAct: number[]
  /** Seats whose chips match the current bet, who may check. */
  matched: number[]
  level: number
  steps: FlowStep[]
}

const dealtSeats = (table: DraftTable) => table.seats.map((seat) => seat.seat).sort((a, b) => a - b)

/** The seat that posted the live bet preflop: the last straddle, else the big blind. */
export function preflopBetSeat(table: DraftTable): number | undefined {
  const straddles = table.straddles
  if (straddles.length > 0) return straddles[straddles.length - 1]!.seat
  return blindSeats(dealtSeats(table), table.buttonSeat).bigBlindSeat
}

/** Participants in preflop action order. */
export function preflopOrder(table: DraftTable, participants: readonly number[]): number[] {
  const order = preflopSeatOrder(
    dealtSeats(table),
    table.buttonSeat,
    table.straddles.map((straddle) => straddle.seat),
  )
  return order.filter((seat) => participants.includes(seat))
}

/** Seats in postflop action order. */
export function postflopOrder(table: DraftTable, seats: readonly number[]): number[] {
  return postflopSeatOrder(seats, table.buttonSeat)
}

/**
 * Apply one street's recorded actions to the players still in.
 * `liveAtStart` / `allInAtStart` come from the street before.
 */
export function streetFlow(
  table: DraftTable,
  street: Street,
  participants: readonly number[],
  actions: readonly DraftAction[],
  liveAtStart: readonly number[],
  allInAtStart: readonly number[],
): StreetFlow {
  let live = [...liveAtStart]
  const allIn = new Set(allInAtStart)
  let level: number
  let matched: number[]
  let toAct: number[]

  if (street === 'preflop') {
    toAct = preflopOrder(table, live).filter((seat) => !allIn.has(seat))
    const betSeat = preflopBetSeat(table)
    matched = betSeat !== undefined && live.includes(betSeat) ? [betSeat] : []
    level = 1
  } else {
    const order = postflopOrder(table, live).filter((seat) => !allIn.has(seat))
    // Betting needs two players with chips behind.
    toAct = order.length >= 2 ? order : []
    matched = [...live]
    level = 0
  }

  const steps: FlowStep[] = []

  for (const action of actions) {
    const facing = level > 0
    const position = toAct.indexOf(action.seat)
    const problem = actionProblem(action.action, action.seat, participants, live, allIn, toAct, matched, facing)
    if (problem) {
      steps.push({ action, facing, level, skipped: [], problem })
      continue
    }

    const skipped = toAct.slice(0, position)
    toAct = toAct.filter((seat) => seat !== action.seat)

    switch (action.action) {
      case 'fold':
        live = live.filter((seat) => seat !== action.seat)
        matched = matched.filter((seat) => seat !== action.seat)
        break
      case 'check':
        break
      case 'call':
        matched = [...matched, action.seat]
        break
      case 'bet':
      case 'raise':
      case 'allin':
        level += 1
        matched = [action.seat]
        if (action.action === 'allin') allIn.add(action.seat)
        toAct = seatsClockwiseFrom(live, action.seat).filter((seat) => seat !== action.seat && !allIn.has(seat))
        break
    }

    steps.push({ action, facing, level, skipped, problem: null })
    if (live.length <= 1) toAct = []
  }

  return {
    street,
    liveAtStart: [...liveAtStart],
    live,
    allIn: [...allIn],
    toAct,
    matched,
    level,
    steps,
  }
}

function actionProblem(
  kind: DraftActionKind,
  seat: number,
  participants: readonly number[],
  live: readonly number[],
  allIn: ReadonlySet<number>,
  toAct: readonly number[],
  matched: readonly number[],
  facing: boolean,
): FlowProblem | null {
  if (!participants.includes(seat)) return 'not-participant'
  if (!live.includes(seat)) return 'folded'
  if (allIn.has(seat)) return 'all-in'
  if (toAct.length === 0) return 'street-over'
  if (!toAct.includes(seat)) return 'already-acted'
  switch (kind) {
    case 'check':
      return matched.includes(seat) ? null : 'check-facing-bet'
    case 'call':
      return facing && !matched.includes(seat) ? null : 'nothing-to-call'
    case 'bet':
      return facing ? 'bet-facing-bet' : null
    case 'raise':
      return facing ? null : 'raise-without-bet'
    default:
      return null
  }
}

/** Every recorded street in turn, each starting from where the last one left off. */
export function handFlow(table: DraftTable, draft: HandDraft): StreetFlow[] {
  const flows: StreetFlow[] = []
  let live = preflopOrder(table, draft.participants)
  let allIn: number[] = []
  for (const street of draft.streets) {
    const flow = streetFlow(table, street.street, draft.participants, street.actions, live, allIn)
    flows.push(flow)
    live = flow.live
    allIn = flow.allIn
  }
  return flows
}

/** The flow for one street, or what it would be if the street had just begun. */
export function flowFor(table: DraftTable, draft: HandDraft, street: Street): StreetFlow {
  const flows = handFlow(table, draft)
  const found = flows.find((flow) => flow.street === street)
  if (found) return found
  const last = flows.at(-1)
  return streetFlow(
    table,
    street,
    draft.participants,
    [],
    last?.live ?? preflopOrder(table, draft.participants),
    last?.allIn ?? [],
  )
}

/** Participants still in at the end of everything recorded, minus anyone recorded as out before showdown. */
export function finalLive(table: DraftTable, draft: HandDraft): number[] {
  const flows = handFlow(table, draft)
  const live = flows.at(-1)?.live ?? preflopOrder(table, draft.participants)
  const out = new Set(draft.showdown.filter((entry) => entry.status === 'no-showdown').map((entry) => entry.seat))
  return live.filter((seat) => !out.has(seat))
}

/** True once the recorded actions leave one player: the hand ended without a showdown. */
export function endedByFold(table: DraftTable, draft: HandDraft): boolean {
  const flows = handFlow(table, draft)
  return flows.some((flow) => flow.live.length <= 1)
}

/** The kind an aggressive action should carry here: a bet into nothing, a raise over a bet. */
export function aggressiveKind(flow: StreetFlow): 'bet' | 'raise' {
  return flow.level > 0 ? 'raise' : 'bet'
}
