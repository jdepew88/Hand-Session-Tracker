import type { Cents } from '../money'
import type { Card } from './cards'
import type { ActionType, HandEvent, HandSetup, HandState, RakeStructure, Street } from './models'
import { buildAction } from './betting'
import { replay } from './reducer'
import { NO_RAKE } from './rake'

/** Test-only helpers. Not imported by application code. */

let counter = 0
const id = () => `e${(counter += 1)}`

export function resetIds() {
  counter = 0
}

export interface SetupOptions {
  seats?: number
  stacks?: Record<number, Cents> | Cents
  buttonSeat?: number
  heroSeat?: number
  smallBlind?: Cents
  bigBlind?: Cents
  ante?: Cents
  anteMode?: HandSetup['anteMode']
  straddles?: HandSetup['straddles']
  deadMoney?: HandSetup['deadMoney']
  heroCards?: Card[]
  rake?: RakeStructure
}

export function makeSetup(options: SetupOptions = {}): HandSetup {
  const count = options.seats ?? 6
  const stacks = options.stacks ?? 50_000
  return {
    tableSize: count,
    buttonSeat: options.buttonSeat ?? count,
    heroSeat: options.heroSeat ?? 1,
    smallBlind: options.smallBlind ?? 500,
    bigBlind: options.bigBlind ?? 500,
    ante: options.ante ?? 0,
    anteMode: options.anteMode ?? 'none',
    straddles: options.straddles ?? [],
    deadMoney: options.deadMoney ?? [],
    heroCards: options.heroCards ?? [],
    rake: options.rake ?? NO_RAKE,
    seats: Array.from({ length: count }, (_, index) => ({
      seat: index + 1,
      startingStack: typeof stacks === 'number' ? stacks : (stacks[index + 1] ?? 50_000),
    })),
  }
}

/**
 * Thin driver over `replay`: keeps an event log, re-derives state after every
 * step. Mirrors exactly what the UI does, so tests exercise the real path.
 */
export class Hand {
  readonly setup: HandSetup
  events: HandEvent[] = []

  constructor(setup: HandSetup) {
    this.setup = setup
  }

  get state(): HandState {
    return replay(this.setup, this.events)
  }

  act(seat: number, action: ActionType, to?: Cents): this {
    const event = buildAction(this.state, seat, action, to)
    this.events.push({ ...event, id: id() })
    return this
  }

  deal(street: Exclude<Street, 'preflop'>, cards: Card[]): this {
    this.events.push({ id: id(), kind: 'deal', street, cards })
    return this
  }

  reveal(seat: number, cards: Card[]): this {
    this.events.push({ id: id(), kind: 'reveal', seat, cards })
    return this
  }

  undo(): this {
    this.events = this.events.slice(0, -1)
    return this
  }

  stack(seat: number): Cents {
    return this.state.seats.get(seat)!.stack
  }

  committed(seat: number): Cents {
    return this.state.seats.get(seat)!.committed
  }
}
