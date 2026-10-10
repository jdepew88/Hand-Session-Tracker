import { formatCents, type Cents } from '../money'
import type {
  HandContext,
  HandRecord,
  HandSeatSetup,
  HandSetup,
  PlayerProfile,
  Session,
} from './models'
import { derivePositions } from './positions'
import { NO_RAKE } from './rake'

/** UUIDs everywhere: ids must survive an export, an import and a future sync. */
export const newId = (): string => crypto.randomUUID()

export function stakesLabel(session: Pick<Session, 'smallBlind' | 'bigBlind'>): string {
  return `${formatCents(session.smallBlind)}/${formatCents(session.bigBlind)}`
}

export interface NewSessionInput {
  location: string
  gameType: string
  smallBlind: Cents
  bigBlind: Cents
  ante?: Cents
  anteMode?: Session['anteMode']
  straddleAmount?: Cents | null
  tableSize: number
  buyIn: Cents
  startingStack: Cents
  rake?: Session['rake']
  heroSeat?: number | null
  buttonSeat?: number | null
  notes?: string
}

export function createSession(input: NewSessionInput): Session {
  const now = new Date().toISOString()
  return {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    startedAt: now,
    endedAt: null,
    location: input.location,
    gameType: input.gameType,
    smallBlind: input.smallBlind,
    bigBlind: input.bigBlind,
    ante: input.ante ?? 0,
    anteMode: input.anteMode ?? 'none',
    straddleAmount: input.straddleAmount ?? null,
    tableSize: input.tableSize,
    startingStack: input.startingStack,
    buyIns: [{ id: newId(), amount: input.buyIn, at: now }],
    cashOut: null,
    rake: input.rake ?? NO_RAKE,
    heroSeat: input.heroSeat ?? null,
    buttonSeat: input.buttonSeat ?? null,
    seatStatus: Object.fromEntries(
      Array.from({ length: input.tableSize }, (_, index) => [index + 1, 'occupied'] as const),
    ),
    notes: input.notes ?? '',
  }
}

export function createPlayer(sessionId: string, seat: number): PlayerProfile {
  const now = new Date().toISOString()
  return {
    id: newId(),
    sessionId,
    seat,
    nickname: '',
    archetype: 'Unknown',
    customArchetype: '',
    color: 'slate',
    notes: '',
    startingStack: null,
    currentStack: null,
    createdAt: now,
    updatedAt: now,
    tags: [],
    aliases: [],
    notesUpdatedAt: null,
    leftAt: null,
  }
}

export interface NewHandInput {
  session: Session
  buttonSeat: number
  heroSeat: number
  seats: HandSeatSetup[]
  straddles?: HandSetup['straddles']
  deadMoney?: HandSetup['deadMoney']
}

export function createHandSetup(input: NewHandInput): HandSetup {
  const { session } = input
  return {
    tableSize: session.tableSize,
    buttonSeat: input.buttonSeat,
    heroSeat: input.heroSeat,
    smallBlind: session.smallBlind,
    bigBlind: session.bigBlind,
    ante: session.ante,
    anteMode: session.anteMode,
    straddles: input.straddles ?? [],
    deadMoney: input.deadMoney ?? [],
    seats: [...input.seats].sort((a, b) => a.seat - b.seat),
    heroCards: [],
    rake: session.rake,
  }
}

export function handContext(session: Session, setup: HandSetup): HandContext {
  const positions = derivePositions(
    setup.seats.map((seat) => seat.seat),
    setup.buttonSeat,
  )
  return {
    location: session.location,
    gameType: session.gameType,
    stakesLabel: stakesLabel(session),
    tableSize: setup.tableSize,
    heroPosition: positions.get(setup.heroSeat) ?? `Seat ${setup.heroSeat}`,
  }
}

export function createHandRecord(session: Session, setup: HandSetup, handNumber: number): HandRecord {
  const now = new Date().toISOString()
  return {
    id: newId(),
    sessionId: session.id,
    handNumber,
    createdAt: now,
    updatedAt: now,
    setup,
    events: [],
    manualWinners: [],
    favorite: false,
    tags: [],
    notes: '',
    context: handContext(session, setup),
  }
}

/** Seats to deal in, defaulting every chair at the table to the session buy-in. */
export function defaultSeats(
  tableSize: number,
  startingStack: Cents,
  players: readonly PlayerProfile[] = [],
): HandSeatSetup[] {
  return Array.from({ length: tableSize }, (_, index) => {
    const seat = index + 1
    const player = players.find((candidate) => candidate.seat === seat)
    const label = player?.nickname.trim()
    return {
      seat,
      startingStack: player?.currentStack ?? player?.startingStack ?? startingStack,
      ...(player ? { playerId: player.id } : {}),
      ...(label ? { label } : {}),
    }
  })
}

/**
 * Correct one seat's starting stack for a single hand. The hand's stacks are
 * its own snapshot of the table, so this never touches the session's lineup:
 * the Table keeps what it had unless the player changes it there.
 */
export function withHandStack(setup: HandSetup, seat: number, startingStack: Cents): HandSetup {
  return {
    ...setup,
    seats: setup.seats.map((entry) => (entry.seat === seat ? { ...entry, startingStack } : entry)),
  }
}
