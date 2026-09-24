import type { Cents } from '../money'
import { compareRankings, evaluateHand } from './evaluator'
import type { HandRanking, HandResult, HandSetup, HandState, PotAward, ShowdownEntry } from './models'
import { applyRakeToPots, splitAmount } from './pot'
import { seatsClockwiseFrom } from './positions'

/**
 * Turning a finished hand into a result.
 *
 * Pots are resolved one at a time so multiple all-ins settle correctly: a short
 * stack can only win the layers they paid into. Where cards are unknown the
 * result is reported as undetermined rather than guessed, and the user's manual
 * winner selection takes precedence over everything.
 */

export function computeResult(
  setup: HandSetup,
  state: HandState,
  manualWinners: readonly number[] = [],
): HandResult {
  const rakedPots = applyRakeToPots(state.pots, state.rake.total)
  const oddChipOrder = seatsClockwiseFrom(state.seatOrder, setup.buttonSeat)
  const live = state.activeSeats

  const showdown: ShowdownEntry[] = live.map((seat) => {
    const player = state.seats.get(seat)!
    const ranking =
      player.cards.length >= 2 && state.board.length === 5
        ? evaluateHand([...player.cards, ...state.board])
        : null
    return { seat, cards: [...player.cards], ranking }
  })

  const rankingBySeat = new Map<number, HandRanking | null>(
    showdown.map((entry) => [entry.seat, entry.ranking]),
  )

  const declared = manualWinners.filter((seat) => live.includes(seat))
  const awards: PotAward[] = []
  let undetermined = false

  for (const pot of rakedPots) {
    if (pot.amount <= 0) continue
    const contenders = pot.eligibleSeats.filter((seat) => live.includes(seat))
    if (contenders.length === 0) continue

    let winners: number[]

    if (contenders.length === 1) {
      winners = contenders
    } else if (declared.length > 0) {
      const eligibleDeclared = declared.filter((seat) => contenders.includes(seat))
      winners = eligibleDeclared.length > 0 ? eligibleDeclared : contenders
    } else {
      winners = bestOf(contenders, rankingBySeat)
      if (winners.length === 0) {
        undetermined = true
        continue
      }
    }

    for (const [seat, amount] of splitAmount(pot.amount, winners, oddChipOrder)) {
      if (amount > 0) awards.push({ potIndex: pot.index, seat, amount })
    }
  }

  const awardedBySeat = new Map<number, Cents>()
  for (const award of awards) {
    awardedBySeat.set(award.seat, (awardedBySeat.get(award.seat) ?? 0) + award.amount)
  }

  const finalStacks = state.seatOrder.map((seat) => {
    const player = state.seats.get(seat)!
    return { seat, stack: player.stack + (awardedBySeat.get(seat) ?? 0) }
  })

  const hero = state.seats.get(setup.heroSeat)
  const heroResult = hero ? (awardedBySeat.get(setup.heroSeat) ?? 0) - hero.committed : 0

  return {
    winners: [...awardedBySeat.keys()].sort((a, b) => a - b),
    awards,
    grossPot: state.pot,
    rake: state.rake,
    netPot: state.netPot,
    heroResult,
    finalStacks,
    showdown,
    manual: declared.length > 0,
    undetermined,
  }
}

/**
 * Best hand(s) among `contenders`. Returns an empty array when any contender's
 * cards are unknown -- a winner must not be invented from partial information.
 */
function bestOf(
  contenders: readonly number[],
  rankings: ReadonlyMap<number, HandRanking | null>,
): number[] {
  const known = contenders.map((seat) => ({ seat, ranking: rankings.get(seat) ?? null }))
  if (known.some((entry) => entry.ranking === null)) return []

  let winners: number[] = []
  let best: HandRanking | null = null
  for (const { seat, ranking } of known) {
    if (!ranking) continue
    if (best === null) {
      best = ranking
      winners = [seat]
      continue
    }
    const comparison = compareRankings(ranking, best)
    if (comparison > 0) {
      best = ranking
      winners = [seat]
    } else if (comparison === 0) {
      winners.push(seat)
    }
  }
  return winners
}

/** True when the engine can settle every pot without the user naming a winner. */
export function canAutoResolve(state: HandState): boolean {
  if (state.status === 'complete') return true
  if (state.board.length < 5) return false
  return state.activeSeats.every((seat) => (state.seats.get(seat)?.cards.length ?? 0) >= 2)
}
