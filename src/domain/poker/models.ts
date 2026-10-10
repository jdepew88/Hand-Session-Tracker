import type { Cents } from '../money'
import type { Card } from './cards'
import type { HandDraft } from './draft/model'
import type { Position } from './positions'

/**
 * Bump when the persisted/exported shape changes. Version 2 added
 * reconstructed hands; a hand without one still exports as version 1, so
 * every file an older build could read, it still can.
 */
export const SCHEMA_VERSION = 2
/** Export versions this build reads. */
export const READABLE_SCHEMA_VERSIONS: readonly number[] = [1, 2]

export type Street = 'preflop' | 'flop' | 'turn' | 'river'
export const STREETS: Street[] = ['preflop', 'flop', 'turn', 'river']

export type HandStatus = 'setup' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'complete'

export type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise'

/**
 * A player decision.
 *
 * `to` is the seat's **total contribution for this street** once the action is
 * applied -- never an increment. "Opens to $15, raised to $50" stores 1500 and
 * 5000. One representation for bets, raises, calls and all-ins removes the
 * entire class of hand-history bugs where a raise is misread as an addition on
 * top of a call. The incremental chips are derived (`to - alreadyInThisStreet`).
 *
 * `fold` and `check` carry `to` equal to whatever the seat already had in.
 */
export interface ActionEvent {
  id: string
  kind: 'action'
  street: Street
  seat: number
  action: ActionType
  to: Cents
}

/** Board cards arriving. Part of the event log so replay reproduces the board. */
export interface DealEvent {
  id: string
  kind: 'deal'
  street: Exclude<Street, 'preflop'>
  cards: Card[]
}

/** An opponent's (or hero's) cards becoming known at showdown. */
export interface RevealEvent {
  id: string
  kind: 'reveal'
  seat: number
  cards: Card[]
}

export type HandEvent = ActionEvent | DealEvent | RevealEvent

/** Forced bets posted before the first voluntary action. Derived, never stored as events. */
export type ForcedBetKind = 'sb' | 'bb' | 'ante' | 'straddle' | 'dead'

export interface ForcedBet {
  seat: number
  kind: ForcedBetKind
  amount: Cents
}

export interface StraddleSetup {
  seat: number
  amount: Cents
}

export interface HandSeatSetup {
  seat: number
  /** Links to a PlayerProfile so lineups can become cross-session profiles later. */
  playerId?: string
  /** Nickname snapshot, so an exported hand reads correctly on its own. */
  label?: string
  startingStack: Cents
}

export type AnteMode = 'none' | 'all' | 'bb' | 'button'

export interface HandSetup {
  tableSize: number
  buttonSeat: number
  heroSeat: number
  smallBlind: Cents
  bigBlind: Cents
  ante: Cents
  anteMode: AnteMode
  straddles: StraddleSetup[]
  /** Dead money / missed blinds posted by a seat, outside the normal blind structure. */
  deadMoney: { seat: number; amount: Cents }[]
  seats: HandSeatSetup[]
  /** Hero's hole cards. Empty until chosen; exactly two once set. */
  heroCards: Card[]
  rake: RakeStructure
}

/* ------------------------------------------------------------------ rake */

export interface RakeStructure {
  id: string
  name: string
  /** Drop taken as each street is reached. Amounts are additive, not cumulative totals. */
  preflop: Cents
  flop: Cents
  turn: Cents
  river: Cents
  /** Jackpot / promotional drop, tracked separately from rake. */
  jackpot: Cents
  /** When the jackpot drop is taken. */
  jackpotStreet: Street
  /** Cap on rake (excluding jackpot). null = uncapped. */
  cap: Cents | null
  /** No drop at all if the hand ends before a flop. */
  noFlopNoDrop: boolean
  notes?: string
}

export interface RakeBreakdown {
  /** Drop attributable to the house rake. */
  rake: Cents
  /** Jackpot / promotional drop. */
  jackpot: Cents
  /** rake + jackpot. */
  total: Cents
  /** Per-street explanation, for the UI and the summary. */
  lines: { street: Street; rake: Cents; jackpot: Cents }[]
  cappedAt: Cents | null
}

/* ------------------------------------------------------- derived hand state */

export interface SeatState {
  seat: number
  label?: string
  playerId?: string
  position: Position
  startingStack: Cents
  /** Chips still in front of the player. Never negative. */
  stack: Cents
  /** Total committed across every street of this hand. */
  committed: Cents
  /** Committed on the current street only. */
  streetCommitted: Cents
  folded: boolean
  allIn: boolean
  /** Cards known to the app (hero from setup, others from reveal events). */
  cards: Card[]
  /** True once the seat has acted voluntarily on the current street. */
  hasActedThisStreet: boolean
}

export interface Pot {
  /** 0 = main pot, 1+ = side pots in creation order. */
  index: number
  amount: Cents
  eligibleSeats: number[]
}

export interface HandState {
  status: HandStatus
  street: Street
  board: Card[]
  seats: Map<number, SeatState>
  seatOrder: number[]
  forcedBets: ForcedBet[]
  /** Highest total street contribution. */
  currentBet: Cents
  /** Smallest legal raise increment on this street. */
  minRaiseIncrement: Cents
  /** Seat that made the last aggressive action this street, if any. */
  lastAggressorSeat: number | null
  /** Seat to act, or null when betting is closed. */
  actingSeat: number | null
  /** Live seats that still owe an action this street, in order. */
  seatsToAct: number[]
  /** Gross chips in the middle, including the current street. */
  pot: Cents
  pots: Pot[]
  rake: RakeBreakdown
  /** Gross pot minus total drop. */
  netPot: Cents
  /** Seats not folded. */
  activeSeats: number[]
  events: HandEvent[]
  /** Set when the engine has concluded the hand on its own. */
  endedBy: 'fold' | 'showdown' | null
  /** Cards that can no longer be selected anywhere in this hand. */
  usedCards: Card[]
}

/* -------------------------------------------------------------- results */

export interface PotAward {
  potIndex: number
  seat: number
  amount: Cents
}

export interface ShowdownEntry {
  seat: number
  cards: Card[]
  /** null when the seat's cards are unknown. */
  ranking: HandRanking | null
}

export type HandCategory =
  | 'high-card'
  | 'pair'
  | 'two-pair'
  | 'trips'
  | 'straight'
  | 'flush'
  | 'full-house'
  | 'quads'
  | 'straight-flush'

export interface HandRanking {
  /** 1 = high card, 9 = straight flush. Higher wins. */
  category: HandCategory
  categoryRank: number
  /** Tie-break values, most significant first. */
  kickers: number[]
  /** The best five cards. */
  cards: Card[]
  /** e.g. "two pair, Kings and Queens" */
  description: string
}

export interface HandResult {
  /** Seats awarded chips. */
  winners: number[]
  awards: PotAward[]
  grossPot: Cents
  rake: RakeBreakdown
  netPot: Cents
  /** Net chips won or lost by hero this hand, after rake. */
  heroResult: Cents
  finalStacks: { seat: number; stack: Cents }[]
  showdown: ShowdownEntry[]
  /** True when the user picked the winner because cards were unknown. */
  manual: boolean
  /** The winner could not be computed and has not been declared. */
  undetermined: boolean
}

/* -------------------------------------------------------------- records */

export const HAND_TAGS = [
  'Big Pot',
  'Bluff',
  'Hero Call',
  'Cooler',
  'Bad Beat',
  'Value Bet',
  'All-In',
  'Interesting',
  'Vlog',
  'Review Later',
  'Mistake',
] as const

export interface HandContext {
  location: string
  gameType: string
  stakesLabel: string
  tableSize: number
  heroPosition: Position
}

export interface HandRecord {
  id: string
  sessionId: string
  handNumber: number
  createdAt: string
  updatedAt: string
  setup: HandSetup
  events: HandEvent[]
  /** Manually declared winners, used when cards are unknown at showdown. */
  manualWinners: number[]
  favorite: boolean
  tags: string[]
  notes: string
  /** Denormalised session context so a single exported hand is self-describing. */
  context: HandContext
  /**
   * Hands recorded with Quick Reconstruct: the hand as remembered, which is
   * then its source of truth (`events` stays empty; an exact event log is
   * derived from it when it says enough). Absent on live-tracked hands and on
   * every hand saved before reconstruction existed.
   */
  reconstruction?: HandDraft
}

/* -------------------------------------------------------------- session */

export const GAME_TYPES = ["No-Limit Hold'em", 'Pot-Limit Omaha', "Limit Hold'em", 'Other'] as const

export interface BuyIn {
  id: string
  amount: Cents
  at: string
  note?: string
}

/**
 * Whether a physical chair has a player in it, between hands.
 *
 * A string union rather than a boolean so another state (sitting out, say) can
 * be added later without changing the shape. Anything that is not `'empty'` is
 * dealt in.
 */
export type SeatStatus = 'occupied' | 'empty'

/**
 * Seat status keyed by physical seat number. Entries for seats beyond the
 * current table size are kept, so shrinking the table and growing it back
 * does not forget who was sitting where. A seat with no entry is occupied:
 * that is what every session meant before occupancy was stored.
 */
export type SeatOccupancy = Partial<Record<number, SeatStatus>>

export interface Session {
  id: string
  createdAt: string
  updatedAt: string
  startedAt: string
  endedAt: string | null
  location: string
  gameType: string
  smallBlind: Cents
  bigBlind: Cents
  ante: Cents
  anteMode: AnteMode
  straddleAmount: Cents | null
  tableSize: number
  startingStack: Cents
  buyIns: BuyIn[]
  cashOut: Cents | null
  rake: RakeStructure
  /** Must be an occupied seat (or null). */
  heroSeat: number | null
  /** A physical chair. May be an empty one: a dead button. */
  buttonSeat: number | null
  seatStatus: SeatOccupancy
  notes: string
}

export const PLAYER_ARCHETYPES = [
  'Unknown',
  'Tight Passive',
  'Tight Aggressive',
  'Loose Passive',
  'Loose Aggressive',
  'Calling Station',
  'Nit',
  'Maniac',
  'Regular',
  'Recreational',
  'Old Man Coffee',
  'Custom',
] as const

export type PlayerArchetype = (typeof PLAYER_ARCHETYPES)[number]

export const PLAYER_TAG_COLORS = ['slate', 'red', 'amber', 'emerald', 'sky', 'violet'] as const
export type PlayerTagColor = (typeof PLAYER_TAG_COLORS)[number]

/**
 * Quick tags: the player's own shorthand for someone at the table, a few at a
 * time. Deliberately short; anything subtler goes in the notes.
 */
export const PLAYER_TAGS = ['Tight', 'Loose', 'Aggressive', 'Passive', 'Reg', 'Rec', 'Unknown'] as const
export type PlayerTag = (typeof PLAYER_TAGS)[number]

/**
 * A person at the table -- not a seat. Seats are physical chairs; a player
 * sits in one (`seat`), may move to another, and may leave (`seat: null`),
 * after which a new person in that chair starts with a clean profile. Saved
 * hands keep their own snapshot (`HandSeatSetup.playerId` / `label`), so
 * nothing here ever changes a hand already recorded.
 */
export interface PlayerProfile {
  id: string
  /** Null is reserved for the cross-session profiles a future version will add. */
  sessionId: string | null
  /** The chair the player is in now, or null once they have left the table. */
  seat: number | null
  /** The display label: "Old Man Coffee", "Hoodie Guy", "Mike". */
  nickname: string
  archetype: PlayerArchetype
  customArchetype: string
  color: PlayerTagColor
  notes: string
  startingStack: Cents | null
  currentStack: Cents | null
  createdAt: string
  updatedAt: string
  /** Absent on profiles saved before tags existed; read through `playerTags`. */
  tags?: PlayerTag[]
  /** Other names the player answers to at this table: "hoodie", "sunglasses guy". */
  aliases?: string[]
  /** When `notes` last changed. */
  notesUpdatedAt?: string | null
  /** When the player left the table. Null or absent while seated. */
  leftAt?: string | null
}

export interface AppSettings {
  id: 'settings'
  defaultLocation: string
  defaultTableSize: number
  defaultRakePresetId: string | null
  confirmStreetTransitions: boolean
}
