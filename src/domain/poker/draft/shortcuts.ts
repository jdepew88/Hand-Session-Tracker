import type { Street } from '../models'
import { flowFor, postflopOrder, preflopBetSeat, preflopOrder, type DraftTable } from './flow'
import type { DraftActionKind, HandDraft } from './model'
import { addActions, type NewAction } from './ops'
import { seatName, seatPositions } from './text'

/**
 * One-tap action sequences for the common lines.
 *
 * Each shortcut is just a list of ordinary actions, applied with `addAction`,
 * so there is nothing a shortcut can record that tapping the actions one at a
 * time could not. They are only offered on a street with nothing recorded yet,
 * and only where the order of play makes them unambiguous: heads-up lines name
 * both players ("Hero bets, CO calls") rather than "bet-call".
 */

export interface Shortcut {
  id: string
  label: string
  actions: NewAction[]
}

type Step = [who: 'a' | 'b' | 'all', action: DraftActionKind]

const POSTFLOP_LINES: { id: string; steps: Step[] }[] = [
  { id: 'check-check', steps: [['a', 'check'], ['b', 'check']] },
  { id: 'bet-call', steps: [['a', 'bet'], ['b', 'call']] },
  { id: 'bet-fold', steps: [['a', 'bet'], ['b', 'fold']] },
  { id: 'check-bet-call', steps: [['a', 'check'], ['b', 'bet'], ['a', 'call']] },
  { id: 'check-bet-fold', steps: [['a', 'check'], ['b', 'bet'], ['a', 'fold']] },
  { id: 'bet-raise-call', steps: [['a', 'bet'], ['b', 'raise'], ['a', 'call']] },
  { id: 'bet-raise-fold', steps: [['a', 'bet'], ['b', 'raise'], ['a', 'fold']] },
  { id: 'jam-call', steps: [['a', 'allin'], ['b', 'call']] },
  { id: 'check-jam-call', steps: [['a', 'check'], ['b', 'allin'], ['a', 'call']] },
]

const PRESENT: Record<DraftActionKind, string> = {
  fold: 'folds',
  check: 'checks',
  call: 'calls',
  bet: 'bets',
  raise: 'raises',
  allin: 'goes all-in',
}

function describe(table: DraftTable, actions: readonly NewAction[], words: Partial<Record<number, string>> = {}): string {
  const positions = seatPositions(table)
  return actions
    .map((action, index) => `${seatName(table, action.seat, positions)} ${words[index] ?? PRESENT[action.action]}`)
    .join(', ')
}

/** Shortcuts for a postflop street. */
export function streetShortcuts(table: DraftTable, draft: HandDraft, street: Exclude<Street, 'preflop'>): Shortcut[] {
  const flow = flowFor(table, draft, street)
  if (flow.steps.length > 0 || flow.toAct.length < 2) return []
  const order = postflopOrder(table, flow.toAct)
  if (order.length === 2) {
    const [a, b] = order as [number, number]
    return POSTFLOP_LINES.map((line) => {
      const actions = line.steps.map(([who, action]) => ({ seat: who === 'a' ? a : b, action }))
      return { id: line.id, label: describe(table, actions), actions }
    })
  }
  const checks = order.map((seat) => ({ seat, action: 'check' as const }))
  return [{ id: 'check-around', label: 'Checked around', actions: checks }]
}

/**
 * Common preflop lines between the players in the hand, in preflop order.
 * Raises are worded the way players say them: raise, 3-bet, 4-bet.
 */
export function preflopShortcuts(table: DraftTable, draft: HandDraft): Shortcut[] {
  const flow = flowFor(table, draft, 'preflop')
  if (flow.steps.length > 0) return []
  const order = preflopOrder(table, draft.participants)
  if (order.length < 2) return []
  const betSeat = preflopBetSeat(table)
  const shortcuts: Shortcut[] = []

  const add = (id: string, actions: NewAction[], words: Partial<Record<number, string>> = {}) =>
    shortcuts.push({ id, label: describe(table, actions, words), actions })

  if (order.length === 2) {
    const [a, b] = order as [number, number]
    add('raise-call', [
      { seat: a, action: 'raise' },
      { seat: b, action: 'call' },
    ])
    add(
      '3bet-call',
      [
        { seat: a, action: 'raise' },
        { seat: b, action: 'raise' },
        { seat: a, action: 'call' },
      ],
      { 1: '3-bets' },
    )
    add(
      '4bet-call',
      [
        { seat: a, action: 'raise' },
        { seat: b, action: 'raise' },
        { seat: a, action: 'raise' },
        { seat: b, action: 'call' },
      ],
      { 1: '3-bets', 2: '4-bets' },
    )
    add('raise-jam-call', [
      { seat: a, action: 'raise' },
      { seat: b, action: 'allin' },
      { seat: a, action: 'call' },
    ])
    if (b === betSeat) {
      add('limp-check', [
        { seat: a, action: 'call' },
        { seat: b, action: 'check' },
      ], { 0: 'limps' })
    } else {
      add('limp-call', [
        { seat: a, action: 'call' },
        { seat: b, action: 'call' },
      ], { 0: 'limps', 1: 'limps behind' })
    }
    add(
      'limp-raise-call',
      [
        { seat: a, action: 'call' },
        { seat: b, action: 'raise' },
        { seat: a, action: 'call' },
      ],
      { 0: 'limps' },
    )
    return shortcuts
  }

  // Multiway: one raise and everyone calls, or a limped pot.
  const [first, ...rest] = order as [number, ...number[]]
  const raiseAll: NewAction[] = [{ seat: first, action: 'raise' }, ...rest.map((seat) => ({ seat, action: 'call' as const }))]
  shortcuts.push({ id: 'raise-all-call', label: `${describe(table, raiseAll.slice(0, 1))}, ${rest.length === 1 ? 'one call' : 'everyone calls'}`, actions: raiseAll })
  const limped: NewAction[] = order.map((seat) => ({ seat, action: seat === betSeat ? ('check' as const) : ('call' as const) }))
  shortcuts.push({ id: 'limped', label: 'Limped pot', actions: limped })
  return shortcuts
}

export const applyShortcut = (draft: HandDraft, table: DraftTable, street: Street, shortcut: Shortcut): HandDraft =>
  addActions(draft, table, street, shortcut.actions)
