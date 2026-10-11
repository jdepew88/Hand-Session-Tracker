import { checkDraft } from '../../domain/poker/draft/check'
import type { HandDraft } from '../../domain/poker/draft/model'
import { parseDraft } from '../../domain/poker/draft/parse'
import { withHandStack } from '../../domain/poker/factories'
import type { HandSetup } from '../../domain/poker/models'
import { MAX_AMOUNT } from '../../domain/poker/validation'
import { PREFERENCE_KEYS, readPreference, writePreference } from '../../storage/preferences'

/**
 * An unsaved Quick Reconstruct draft, kept in the browser so a locked phone
 * or a reload mid-hand does not lose it. It is a convenience: read back as
 * untrusted input, and thrown away if it no longer fits the table.
 *
 * Starting stacks corrected for this hand travel with it, stored as the
 * seats whose stack differs from the table's. They are applied to the hand's
 * own setup only; the Table's stacks are never written from here. So does a
 * button the narration placed elsewhere for this hand ("I was cutoff"), and
 * the remembered words a described hand keeps as notes ("turn: a brick").
 */

interface Stored {
  sessionId: string
  draft: unknown
  /** Seat -> starting stack for this hand, where it differs from the table. */
  stacks?: unknown
  /** This hand's button, where it differs from the table's. */
  button?: unknown
  /** Remembered details with no field in the draft, saved as the hand's notes. */
  notes?: unknown
}

export interface StoredDraft {
  draft: HandDraft
  /** The table's setup with this hand's corrected stacks (and button) applied. */
  setup: HandSetup
  notes: string[]
}

const MAX_NOTES = 20
const MAX_NOTE = 300

export function readStoredDraft(sessionId: string, tableSetup: HandSetup): StoredDraft | null {
  const raw = readPreference(PREFERENCE_KEYS.reconstructDraft)
  if (!raw || raw.length > 64 * 1024) return null
  try {
    const stored = JSON.parse(raw) as Stored
    if (stored?.sessionId !== sessionId) return null
    const issues: string[] = []
    const draft = parseDraft(stored.draft, issues)
    if (!draft || issues.length > 0) return null
    const dealt = new Set(tableSetup.seats.map((seat) => seat.seat))
    if (!draft.participants.includes(tableSetup.heroSeat) || draft.participants.some((seat) => !dealt.has(seat))) return null

    let setup = tableSetup
    if (stored.stacks !== undefined) {
      if (typeof stored.stacks !== 'object' || stored.stacks === null || Array.isArray(stored.stacks)) return null
      for (const [key, value] of Object.entries(stored.stacks)) {
        const seat = Number(key)
        const valid = typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= MAX_AMOUNT
        if (!dealt.has(seat) || !valid) return null
        setup = withHandStack(setup, seat, value)
      }
    }

    if (stored.button !== undefined) {
      if (typeof stored.button !== 'number' || !dealt.has(stored.button)) return null
      setup = { ...setup, buttonSeat: stored.button }
    }
    let notes: string[] = []
    if (stored.notes !== undefined) {
      if (!Array.isArray(stored.notes) || stored.notes.length > MAX_NOTES) return null
      notes = stored.notes.filter((note): note is string => typeof note === 'string').map((note) => note.slice(0, MAX_NOTE))
    }

    // A draft the current table makes impossible is not worth restoring.
    if (checkDraft(setup, draft).errors.length > 0) return null
    return { draft, setup, notes }
  } catch {
    return null
  }
}

/**
 * Keep the unsaved hand, or clear it with `null`. `setup` is the hand's own
 * setup; only stacks that differ from `tableSetup` are stored.
 */
export function writeStoredDraft(
  sessionId: string,
  hand: { draft: HandDraft; setup: HandSetup; tableSetup: HandSetup; notes?: readonly string[] } | null,
) {
  if (!hand) {
    writePreference(PREFERENCE_KEYS.reconstructDraft, null)
    return
  }
  const stacks: Record<number, number> = {}
  for (const entry of hand.setup.seats) {
    const table = hand.tableSetup.seats.find((seat) => seat.seat === entry.seat)
    if (table && table.startingStack !== entry.startingStack) stacks[entry.seat] = entry.startingStack
  }
  const corrected = Object.keys(stacks).length > 0
  const button = hand.setup.buttonSeat !== hand.tableSetup.buttonSeat ? hand.setup.buttonSeat : null
  const notes = (hand.notes ?? []).slice(0, MAX_NOTES)
  if (!corrected && button === null && notes.length === 0 && !draftHasContent(hand.draft)) {
    writePreference(PREFERENCE_KEYS.reconstructDraft, null)
    return
  }
  writePreference(
    PREFERENCE_KEYS.reconstructDraft,
    JSON.stringify({
      sessionId,
      draft: hand.draft,
      ...(corrected ? { stacks } : {}),
      ...(button !== null ? { button } : {}),
      ...(notes.length > 0 ? { notes } : {}),
    }),
  )
}

/** True when the draft holds anything beyond a fresh start. */
export function draftHasContent(draft: HandDraft): boolean {
  return (
    draft.participants.length > 1 ||
    draft.hero.cards.some((card) => card.rank !== null || card.suit !== null) ||
    draft.streets.some((street) => street.actions.length > 0 || street.cards.some((card) => card.rank !== null || card.suit !== null))
  )
}
