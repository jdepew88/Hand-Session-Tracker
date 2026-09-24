import type { Cents } from '../money'
import type { Pot } from './models'

/**
 * Side pots are derived from contributions, never accumulated incrementally.
 *
 * Every distinct contribution level defines a layer: each player pays into a
 * layer up to the lesser of their contribution and the layer ceiling, and only
 * players who were not folded and reached that ceiling can win it. Folded
 * players' chips stay in the pot but win nothing.
 */
export function buildPots(
  contributions: ReadonlyMap<number, Cents>,
  foldedSeats: ReadonlySet<number>,
): Pot[] {
  const entries = [...contributions.entries()].filter(([, amount]) => amount > 0)
  if (entries.length === 0) return []

  const levels = [...new Set(entries.map(([, amount]) => amount))].sort((a, b) => a - b)

  const layers: { amount: Cents; eligibleSeats: number[] }[] = []
  let previousLevel = 0
  for (const level of levels) {
    let amount = 0
    const eligible: number[] = []
    for (const [seat, contributed] of entries) {
      const slice = Math.min(contributed, level) - Math.min(contributed, previousLevel)
      amount += slice
      if (contributed >= level && !foldedSeats.has(seat)) eligible.push(seat)
    }
    previousLevel = level
    if (amount > 0) layers.push({ amount, eligibleSeats: eligible.sort((a, b) => a - b) })
  }

  // Adjacent layers with identical eligibility are the same pot in practice --
  // a folded short stack should not manufacture a phantom side pot.
  const merged: { amount: Cents; eligibleSeats: number[] }[] = []
  for (const layer of layers) {
    const previous = merged[merged.length - 1]
    if (previous && sameSeats(previous.eligibleSeats, layer.eligibleSeats)) {
      previous.amount += layer.amount
    } else {
      merged.push({ ...layer })
    }
  }

  return merged.map((layer, index) => ({ index, amount: layer.amount, eligibleSeats: layer.eligibleSeats }))
}

function sameSeats(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false
  return a.every((seat, i) => seat === b[i])
}

/**
 * Remove the house drop from the pots, taking it from the main pot first.
 *
 * Rooms drop from the middle before pushing, and the main pot is always the
 * largest and always exists, so it absorbs the drop unless it is too small.
 */
export function applyRakeToPots(pots: readonly Pot[], rakeTotal: Cents): Pot[] {
  let remaining = Math.max(0, rakeTotal)
  return pots.map((pot) => {
    if (remaining <= 0) return { ...pot }
    const taken = Math.min(pot.amount, remaining)
    remaining -= taken
    return { ...pot, amount: pot.amount - taken }
  })
}

export function totalPot(pots: readonly Pot[]): Cents {
  return pots.reduce((sum, pot) => sum + pot.amount, 0)
}

/**
 * Split `amount` between `winners`.
 *
 * Chips are indivisible, so an odd remainder goes to the earliest seats in
 * `oddChipOrder` -- the live convention is that the odd chip goes to the
 * first player clockwise from the button.
 */
export function splitAmount(
  amount: Cents,
  winners: readonly number[],
  oddChipOrder: readonly number[],
): Map<number, Cents> {
  const result = new Map<number, Cents>()
  if (winners.length === 0 || amount <= 0) return result
  const base = Math.floor(amount / winners.length)
  let remainder = amount - base * winners.length
  for (const seat of winners) result.set(seat, base)

  const order = oddChipOrder.filter((seat) => winners.includes(seat))
  const ordered = order.length === winners.length ? order : [...winners].sort((a, b) => a - b)
  let i = 0
  while (remainder > 0) {
    const seat = ordered[i % ordered.length]!
    result.set(seat, (result.get(seat) ?? 0) + 1)
    remainder -= 1
    i += 1
  }
  return result
}
