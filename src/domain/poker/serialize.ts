import { checkDraft } from './draft/check'
import type { HandDraft } from './draft/model'
import { parseDraft } from './draft/parse'
import { deriveHand } from './lifecycle'
import { READABLE_SCHEMA_VERSIONS, type HandEvent, type HandRecord, type HandResult, type HandSetup } from './models'
import { replay } from './reducer'
import {
  MAX_IMPORT_BYTES,
  MAX_LABEL_LENGTH,
  MAX_NOTE_LENGTH,
  ValidationError,
  assertNoDuplicateCards,
  parseEvents,
  parseHandSetup,
  parseIsoDate,
  parseTags,
  sanitizeString,
} from './validation'

/**
 * Versioned JSON interchange for a single hand.
 *
 * The file stores the **event log**, not final totals: everything a reader
 * needs to replay the hand from the first blind to the last chip. `result` is a
 * convenience snapshot for tools that do not want to implement the engine, and
 * is deliberately ignored on import -- the imported hand is re-derived so a
 * tampered or stale snapshot can never corrupt accounting.
 *
 * A reconstructed hand (version 2) carries its `reconstruction` draft instead
 * of an action log; its `result` is present only when the draft says enough
 * to work the pot out, and is just as ignored on import.
 *
 * The root shape (`hand` / `table` / `players` / `actions` / `result`) leaves
 * obvious room for the session-level and batch exports planned for v2: those
 * become a `kind` of `handforge.session` or `handforge.bundle` wrapping arrays
 * of exactly these objects, with the same `schemaVersion`.
 */

export const HAND_EXPORT_KIND = 'handforge.hand'

export interface HandExportFile {
  schemaVersion: number
  kind: typeof HAND_EXPORT_KIND
  exportedAt: string
  hand: {
    id: string
    sessionId: string
    handNumber: number
    createdAt: string
    updatedAt: string
    favorite: boolean
    tags: string[]
    notes: string
    manualWinners: number[]
    context: HandRecord['context']
  }
  table: Omit<HandSetup, 'seats'>
  players: HandSetup['seats']
  actions: HandEvent[]
  /** Version 2: the hand as remembered, for reconstructed hands. */
  reconstruction?: HandDraft
  /** Derived snapshot. Informational only; recomputed on import. Null when it cannot be worked out. */
  result: (HandResult & { board: string[] }) | null
}

export function exportHand(record: HandRecord): HandExportFile {
  const { seats, ...table } = record.setup
  const { state, result } = deriveHand(record)

  return {
    // The lowest version that can hold the hand, so older builds still read
    // every live-tracked hand.
    schemaVersion: record.reconstruction ? 2 : 1,
    kind: HAND_EXPORT_KIND,
    exportedAt: new Date().toISOString(),
    hand: {
      id: record.id,
      sessionId: record.sessionId,
      handNumber: record.handNumber,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      favorite: record.favorite,
      tags: [...record.tags],
      notes: record.notes,
      manualWinners: [...record.manualWinners],
      context: { ...record.context },
    },
    table,
    players: seats,
    actions: record.events,
    ...(record.reconstruction ? { reconstruction: record.reconstruction } : {}),
    result: state && result ? { ...result, board: [...state.board] } : null,
  }
}

export function serializeHand(record: HandRecord): string {
  return JSON.stringify(exportHand(record), null, 2)
}

/**
 * Parse an exported hand. Throws `ValidationError` with every issue found.
 *
 * `newId` lets the caller decide whether an import overwrites the original hand
 * or lands as a copy; the default keeps the original id so re-importing a hand
 * you exported yourself updates it in place rather than duplicating it.
 */
export function parseHandExport(
  text: string,
  options: { newId?: () => string; sessionId?: string } = {},
): HandRecord {
  const issues: string[] = []

  const bytes = new TextEncoder().encode(text).byteLength
  if (bytes > MAX_IMPORT_BYTES) {
    throw new ValidationError([
      `That file is ${Math.round(bytes / 1024)} KB. Hand files are limited to ${Math.round(
        MAX_IMPORT_BYTES / 1024,
      )} KB.`,
    ])
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new ValidationError(['That file is not valid JSON.'])
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ValidationError(['That file does not contain a SessionTracker hand.'])
  }

  const root = parsed as Record<string, unknown>
  if (root.kind !== HAND_EXPORT_KIND) {
    issues.push('That file is not a SessionTracker hand export.')
  }
  if (!READABLE_SCHEMA_VERSIONS.includes(root.schemaVersion as number)) {
    issues.push(
      `Unsupported schema version ${String(root.schemaVersion)}. This build reads versions ${READABLE_SCHEMA_VERSIONS.join(' and ')}.`,
    )
  }
  if (root.schemaVersion === 1 && root.reconstruction !== undefined) {
    issues.push('A version 1 file cannot contain a reconstructed hand.')
  }
  if (issues.length > 0) throw new ValidationError(issues)

  const handSection =
    typeof root.hand === 'object' && root.hand !== null && !Array.isArray(root.hand)
      ? (root.hand as Record<string, unknown>)
      : {}

  const setup = parseHandSetup(root.table, root.players, issues)
  const events = parseEvents(root.actions, issues)
  assertNoDuplicateCards(setup, events, issues)

  let reconstruction: HandDraft | undefined
  if (root.reconstruction !== undefined && root.reconstruction !== null) {
    reconstruction = parseDraft(root.reconstruction, issues) ?? undefined
    if (events.length > 0) issues.push('A reconstructed hand cannot also have an action log.')
    if (reconstruction && issues.length === 0) issues.push(...checkDraft(setup, reconstruction).errors)
  }

  if (issues.length > 0) throw new ValidationError(issues)

  const contextSource =
    typeof handSection.context === 'object' && handSection.context !== null
      ? (handSection.context as Record<string, unknown>)
      : {}

  const now = new Date().toISOString()
  const seatNumbers = new Set(setup.seats.map((seat) => seat.seat))
  const handNumberRaw = handSection.handNumber

  const record: HandRecord = {
    id: options.newId ? options.newId() : sanitizeString(handSection.id, 64) || crypto.randomUUID(),
    sessionId:
      options.sessionId ?? (sanitizeString(handSection.sessionId, 64) || 'imported'),
    handNumber:
      typeof handNumberRaw === 'number' && Number.isInteger(handNumberRaw) && handNumberRaw >= 0
        ? handNumberRaw
        : 0,
    createdAt: parseIsoDate(handSection.createdAt, now),
    updatedAt: parseIsoDate(handSection.updatedAt, now),
    setup,
    events,
    manualWinners: Array.isArray(handSection.manualWinners)
      ? [...new Set(handSection.manualWinners.filter((seat): seat is number => typeof seat === 'number' && seatNumbers.has(seat)))]
      : [],
    favorite: handSection.favorite === true,
    tags: parseTags(handSection.tags),
    notes: sanitizeString(handSection.notes, MAX_NOTE_LENGTH),
    context: {
      location: sanitizeString(contextSource.location, MAX_LABEL_LENGTH),
      gameType: sanitizeString(contextSource.gameType, MAX_LABEL_LENGTH, "No-Limit Hold'em"),
      stakesLabel: sanitizeString(contextSource.stakesLabel, MAX_LABEL_LENGTH),
      tableSize: setup.tableSize,
      heroPosition: sanitizeString(contextSource.heroPosition, 16),
    },
    ...(reconstruction ? { reconstruction } : {}),
  }

  // Final gate: the record must derive without throwing.
  replay(record.setup, record.events)
  deriveHand(record)
  return record
}

const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)

/** e.g. `2026-09-24-commerce-casino-5-5-hand-001.json` */
export function handFilename(record: HandRecord): string {
  const date = record.createdAt.slice(0, 10)
  const location = slug(record.context.location) || 'session'
  const stakes = slug(record.context.stakesLabel.replace(/\$/g, '')) || 'stakes'
  const number = String(record.handNumber).padStart(3, '0')
  return `${date}-${location}-${stakes}-hand-${number}.json`
}
