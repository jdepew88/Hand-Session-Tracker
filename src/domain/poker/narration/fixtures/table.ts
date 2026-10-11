import { createHandSetup, createPlayer, createSession } from '../../factories'
import type { HandSetup, PlayerProfile, PlayerTag, Session } from '../../models'
import { newHandSeating } from '../../occupancy'
import { buildNarrationContext, type NarrationContext } from '../context'

/**
 * The table the narration corpus is told at. Test-only.
 *
 * $2/$5, nine-handed, every chair occupied. Hero is seat 5 and the table
 * currently has the button on Hero, so right now:
 *
 *   SB 6, BB 7 (Quiet Reg), UTG 8 (Old Man Coffee), UTG+1 9 (Mike),
 *   UTG+2 1, LJ 2, HJ 3 (Tom), CO 4 (Hoodie Guy), BTN 5 (Hero).
 *
 * Three players carry the Reg tag (3, 4, 7) so "the reg" is ambiguous.
 * Every player has private notes; none of them may ever reach a parser.
 */

interface Lineup {
  seat: number
  nickname: string
  aliases?: string[]
  tags?: PlayerTag[]
  stack?: number
}

const LINEUP: Lineup[] = [
  { seat: 3, nickname: 'Tom', tags: ['Reg'] },
  { seat: 4, nickname: 'Hoodie Guy', aliases: ['hoodie', 'sunglasses guy'], tags: ['Aggressive', 'Reg'], stack: 64_000 },
  { seat: 7, nickname: 'Quiet Reg', tags: ['Tight', 'Reg'] },
  { seat: 8, nickname: 'Old Man Coffee', aliases: ['OMC', 'coffee'], tags: ['Tight', 'Passive'] },
  { seat: 9, nickname: 'Mike', tags: ['Loose'] },
]

export const SECRET_NOTE = 'PRIVATE NOTE: owes me $40, bluffs every river'

export interface CorpusTable {
  session: Session
  players: PlayerProfile[]
  setup: HandSetup
  context: NarrationContext
}

export function corpusTable(overrides: { heroSeat?: number; buttonSeat?: number } = {}): CorpusTable {
  const session: Session = createSession({
    location: 'Commerce Casino',
    gameType: "No-Limit Hold'em",
    smallBlind: 200,
    bigBlind: 500,
    tableSize: 9,
    buyIn: 50_000,
    startingStack: 50_000,
    heroSeat: overrides.heroSeat ?? 5,
    buttonSeat: overrides.buttonSeat ?? 5,
  })
  const players = [
    { ...createPlayer(session.id, session.heroSeat ?? 5), notes: 'Hero notes: tired tonight.' },
    ...LINEUP.map((entry) => ({
      ...createPlayer(session.id, entry.seat),
      nickname: entry.nickname,
      aliases: entry.aliases ?? [],
      tags: entry.tags ?? [],
      notes: SECRET_NOTE,
      currentStack: entry.stack ?? null,
    })),
  ]
  const setup = createHandSetup({ session, ...newHandSeating(session, players) })
  return { session, players, setup, context: buildNarrationContext(session, setup, players) }
}
