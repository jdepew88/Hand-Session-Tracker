import type { Cents } from '../money'
import { STREETS, type RakeBreakdown, type RakeStructure, type Street } from './models'

/**
 * Rake / drop is deliberately kept out of the wagering model. Players contribute
 * chips; the house removes a slice of the resulting pot. Mixing the two makes
 * stack accounting wrong, because a player's investment is unaffected by what
 * the house takes.
 */

export const NO_RAKE: RakeStructure = {
  id: 'no-rake',
  name: 'No rake',
  preflop: 0,
  flop: 0,
  turn: 0,
  river: 0,
  jackpot: 0,
  jackpotStreet: 'flop',
  cap: null,
  noFlopNoDrop: true,
}

/**
 * A street-based drop in the style some California rooms use.
 *
 * These numbers are an editable starting point, NOT a statement about any
 * room's current structure. Verify against the posted rules and edit before use.
 */
export const EXAMPLE_STREET_DROP: RakeStructure = {
  id: 'example-street-drop',
  name: 'Example street drop (verify before use)',
  preflop: 100,
  flop: 350,
  turn: 0,
  river: 100,
  jackpot: 100,
  jackpotStreet: 'flop',
  cap: null,
  noFlopNoDrop: true,
  notes: 'Placeholder amounts. Confirm the posted drop at your room and edit.',
}

/** A common percentage-style structure expressed as a flat per-street drop. */
export const EXAMPLE_CAPPED_DROP: RakeStructure = {
  id: 'example-capped-drop',
  name: 'Example capped drop (verify before use)',
  preflop: 0,
  flop: 500,
  turn: 0,
  river: 0,
  jackpot: 100,
  jackpotStreet: 'flop',
  cap: 500,
  noFlopNoDrop: true,
  notes: 'Placeholder amounts. Confirm the posted drop at your room and edit.',
}

export const BUILT_IN_RAKE_PRESETS: RakeStructure[] = [NO_RAKE, EXAMPLE_STREET_DROP, EXAMPLE_CAPPED_DROP]

const streetIndex = (street: Street) => STREETS.indexOf(street)

function dropForStreet(structure: RakeStructure, street: Street): Cents {
  switch (street) {
    case 'preflop':
      return structure.preflop
    case 'flop':
      return structure.flop
    case 'turn':
      return structure.turn
    case 'river':
      return structure.river
  }
}

/**
 * Drop taken for a hand that reached `streetReached`, against a gross pot.
 *
 * - Each street's amount is taken once, when that street is reached.
 * - `cap` limits the house rake only; the jackpot drop is outside the cap,
 *   which is how rooms that advertise a cap normally describe it.
 * - The drop can never exceed the pot: a $2 pot that folds preflop under a
 *   $1 preflop drop takes $1, but a $0.50 pot takes only $0.50.
 */
export function computeRake(
  structure: RakeStructure,
  streetReached: Street,
  grossPot: Cents,
): RakeBreakdown {
  const empty: RakeBreakdown = { rake: 0, jackpot: 0, total: 0, lines: [], cappedAt: structure.cap }

  if (grossPot <= 0) return empty
  const reached = streetIndex(streetReached)
  const sawFlop = reached >= streetIndex('flop')
  if (structure.noFlopNoDrop && !sawFlop) return empty

  const lines: RakeBreakdown['lines'] = []
  let rake = 0
  let jackpot = 0

  for (const street of STREETS) {
    if (streetIndex(street) > reached) break
    const streetRake = Math.max(0, dropForStreet(structure, street))
    const streetJackpot =
      structure.jackpotStreet === street ? Math.max(0, structure.jackpot) : 0
    if (streetRake === 0 && streetJackpot === 0) continue
    rake += streetRake
    jackpot += streetJackpot
    lines.push({ street, rake: streetRake, jackpot: streetJackpot })
  }

  if (structure.cap !== null && structure.cap >= 0 && rake > structure.cap) {
    rake = structure.cap
  }

  // The house cannot take more than is in the middle. The promotional drop is
  // waived first, so a short pot reads as "the house took what was there"
  // rather than as a part-funded jackpot.
  let total = rake + jackpot
  if (total > grossPot) {
    const overage = total - grossPot
    const jackpotReduction = Math.min(jackpot, overage)
    jackpot -= jackpotReduction
    rake -= Math.min(rake, overage - jackpotReduction)
    total = rake + jackpot
  }

  return { rake, jackpot, total, lines, cappedAt: structure.cap }
}

export function rakeStructureSummary(structure: RakeStructure): string {
  const parts: string[] = []
  const add = (label: string, amount: Cents) => {
    if (amount > 0) parts.push(`${label} $${(amount / 100).toFixed(2).replace(/\.00$/, '')}`)
  }
  add('preflop', structure.preflop)
  add('flop', structure.flop)
  add('turn', structure.turn)
  add('river', structure.river)
  add('jackpot', structure.jackpot)
  if (parts.length === 0) return 'No drop'
  if (structure.cap !== null) parts.push(`cap $${(structure.cap / 100).toFixed(2).replace(/\.00$/, '')}`)
  if (structure.noFlopNoDrop) parts.push('no flop no drop')
  return parts.join(' / ')
}
