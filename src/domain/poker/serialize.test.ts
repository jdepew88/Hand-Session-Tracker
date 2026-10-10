import { beforeEach, describe, expect, it } from 'vitest'
import type { HandDraft } from './draft/model'
import type { HandRecord } from './models'
import { replay } from './reducer'
import { HAND_EXPORT_KIND, exportHand, handFilename, parseHandExport, serializeHand } from './serialize'
import { computeResult } from './showdown'
import { Hand, makeSetup, resetIds } from './testSupport'
import { MAX_IMPORT_BYTES, ValidationError } from './validation'

beforeEach(resetIds)

function sampleRecord(): HandRecord {
  const hand = new Hand(
    makeSetup({ seats: 6, buttonSeat: 6, heroSeat: 3, heroCards: ['As', 'Ks'] }),
  )
  hand.act(3, 'raise', 1500).act(4, 'call').act(5, 'fold').act(6, 'fold').act(1, 'fold').act(2, 'call')
  hand.deal('flop', ['Kd', '8s', '3c'])
  hand.act(2, 'check').act(3, 'bet', 2500).act(4, 'call').act(2, 'fold')
  hand.deal('turn', ['2h'])
  hand.act(3, 'check').act(4, 'check')
  hand.deal('river', ['Qs'])
  hand.act(3, 'bet', 5000).act(4, 'call')
  hand.reveal(4, ['Kc', 'Qd'])

  return {
    id: 'hand-uuid',
    sessionId: 'session-uuid',
    handNumber: 1,
    createdAt: '2026-09-24T02:00:00.000Z',
    updatedAt: '2026-09-24T02:05:00.000Z',
    setup: hand.setup,
    events: hand.events,
    manualWinners: [],
    favorite: true,
    tags: ['Hero Call', 'Vlog'],
    notes: 'Cooler on the river.',
    context: {
      location: 'Commerce Casino',
      gameType: "No-Limit Hold'em",
      stakesLabel: '$5/$5',
      tableSize: 6,
      heroPosition: 'UTG',
    },
  }
}

describe('hand export', () => {
  it('writes the event log rather than final totals', () => {
    const file = exportHand(sampleRecord())
    expect(file.kind).toBe(HAND_EXPORT_KIND)
    expect(file.schemaVersion).toBe(1)
    expect(file.actions.length).toBeGreaterThan(10)
    expect(file.actions.some((event) => event.kind === 'deal')).toBe(true)
    expect(file.players).toHaveLength(6)
  })

  it('builds a readable filename', () => {
    expect(handFilename(sampleRecord())).toBe('2026-09-24-commerce-casino-5-5-hand-001.json')
  })
})

describe('round trip', () => {
  it('reproduces the record and every derived number', () => {
    const original = sampleRecord()
    const restored = parseHandExport(serializeHand(original))

    expect(restored.id).toBe(original.id)
    expect(restored.favorite).toBe(true)
    expect(restored.tags).toEqual(['Hero Call', 'Vlog'])
    expect(restored.notes).toBe('Cooler on the river.')
    expect(restored.events).toEqual(original.events)
    expect(restored.setup).toEqual(original.setup)

    const before = replay(original.setup, original.events)
    const after = replay(restored.setup, restored.events)
    expect(after.pot).toBe(before.pot)
    expect(after.board).toEqual(before.board)
    expect(computeResult(restored.setup, after).heroResult).toBe(
      computeResult(original.setup, before).heroResult,
    )
  })

  it('survives a second round trip unchanged', () => {
    const once = parseHandExport(serializeHand(sampleRecord()))
    const twice = parseHandExport(serializeHand(once))
    expect(twice.events).toEqual(once.events)
    expect(twice.setup).toEqual(once.setup)
  })

  it('can land an imported hand in a different session as a new record', () => {
    const restored = parseHandExport(serializeHand(sampleRecord()), {
      newId: () => 'fresh-id',
      sessionId: 'other-session',
    })
    expect(restored.id).toBe('fresh-id')
    expect(restored.sessionId).toBe('other-session')
  })
})

describe('imported JSON is untrusted', () => {
  const importOf = (mutate: (file: Record<string, unknown>) => void) => {
    const file = exportHand(sampleRecord()) as unknown as Record<string, unknown>
    mutate(file)
    return () => parseHandExport(JSON.stringify(file))
  }

  it('rejects files that are not JSON', () => {
    expect(() => parseHandExport('<html>nope</html>')).toThrow(ValidationError)
  })

  it('rejects a foreign file shape', () => {
    expect(() => parseHandExport(JSON.stringify({ hello: 'world' }))).toThrow(
      /not a SessionTracker hand export/,
    )
  })

  it('rejects an unsupported schema version', () => {
    expect(importOf((file) => { file.schemaVersion = 99 })).toThrow(/Unsupported schema version/)
  })

  it('rejects oversized files before parsing them', () => {
    const padded = JSON.stringify({ kind: HAND_EXPORT_KIND, pad: 'x'.repeat(MAX_IMPORT_BYTES) })
    expect(() => parseHandExport(padded)).toThrow(/limited to/)
  })

  it('rejects impossible cards', () => {
    expect(importOf((file) => {
      ;(file.table as Record<string, unknown>).heroCards = ['Zx', '1q']
    })).toThrow(ValidationError)
  })

  it('rejects the same physical card appearing twice', () => {
    expect(importOf((file) => {
      ;(file.table as Record<string, unknown>).heroCards = ['As', 'Kd']
    })).toThrow(/appears more than once/)
  })

  it('rejects negative and non-integer amounts', () => {
    expect(importOf((file) => {
      ;(file.table as Record<string, unknown>).bigBlind = -500
    })).toThrow(/cannot be negative/)

    expect(importOf((file) => {
      ;(file.table as Record<string, unknown>).smallBlind = 2.5
    })).toThrow(/whole number of cents/)
  })

  it('rejects a hero who is not seated', () => {
    expect(importOf((file) => {
      ;(file.table as Record<string, unknown>).heroSeat = 9
    })).toThrow(/Hero is not one of the seated players/)
  })

  it('rejects duplicate seats', () => {
    expect(importOf((file) => {
      const players = file.players as { seat: number }[]
      players[1]!.seat = players[0]!.seat
    })).toThrow(/appears more than once/)
  })

  it('rejects a flop that is not three cards', () => {
    expect(importOf((file) => {
      const actions = file.actions as { kind: string; cards?: string[] }[]
      const flop = actions.find((event) => event.kind === 'deal')!
      flop.cards = ['Kd', '8s']
    })).toThrow(/exactly 3 cards/)
  })

  it('strips control characters and clamps long strings', () => {
    const file = exportHand(sampleRecord()) as unknown as Record<string, unknown>
    const hand = file.hand as Record<string, unknown>
    hand.notes = `bad\u0000text${'x'.repeat(10_000)}`
    hand.tags = ['ok', 'y'.repeat(500)]
    const restored = parseHandExport(JSON.stringify(file))
    expect(restored.notes).not.toContain('\u0000')
    expect(restored.notes.length).toBeLessThanOrEqual(4000)
    expect(restored.tags[1]!.length).toBe(64)
  })

  it('ignores the exported result snapshot and recomputes it', () => {
    const file = exportHand(sampleRecord()) as unknown as Record<string, unknown>
    ;(file.result as Record<string, unknown>).heroResult = 999_999
    const restored = parseHandExport(JSON.stringify(file))
    const state = replay(restored.setup, restored.events)
    expect(computeResult(restored.setup, state).heroResult).not.toBe(999_999)
  })
})

describe('reconstructed hands', () => {
  /** Hero (seat 3) vs seat 4, from memory: AK suited, no amounts, flop ranks only. */
  function reconstructedRecord(): HandRecord {
    const live = sampleRecord()
    const reconstruction: HandDraft = {
      version: 1,
      participants: [3, 4],
      hero: {
        cards: [
          { rank: 'A', suit: null },
          { rank: 'K', suit: null },
        ],
        suited: true,
      },
      streets: [
        {
          street: 'preflop',
          cards: [],
          suits: null,
          actions: [
            { id: 'p1', seat: 3, action: 'raise', amount: null },
            { id: 'p2', seat: 4, action: 'call', amount: null },
          ],
        },
        {
          street: 'flop',
          cards: [
            { rank: 'T', suit: null },
            { rank: '8', suit: null },
            { rank: '2', suit: null },
          ],
          suits: { kind: 'two-tone', suit: 'c' },
          actions: [],
        },
      ],
      showdown: [],
      winners: [3],
      pot: 12_000,
    }
    return { ...live, setup: { ...live.setup, heroCards: [] }, events: [], manualWinners: [], reconstruction }
  }

  it('exports as version 2 with the remembered hand and no invented result', () => {
    const file = exportHand(reconstructedRecord())
    expect(file.schemaVersion).toBe(2)
    expect(file.reconstruction?.hero.suited).toBe(true)
    expect(file.actions).toEqual([])
    expect(file.result).toBeNull()
  })

  it('keeps live-tracked hands at version 1, so older builds still read them', () => {
    expect(exportHand(sampleRecord()).schemaVersion).toBe(1)
  })

  it('round-trips with every unknown still unknown', () => {
    const original = reconstructedRecord()
    const restored = parseHandExport(serializeHand(original))
    expect(restored.reconstruction).toEqual(original.reconstruction)
    expect(restored.events).toEqual([])
    expect(restored.reconstruction!.streets[1]!.cards.every((card) => card.suit === null)).toBe(true)
  })

  it('reads an exact reconstruction back with its pot worked out by the engine', () => {
    const original = reconstructedRecord()
    const draft = original.reconstruction!
    const exact: HandRecord = {
      ...original,
      reconstruction: {
        ...draft,
        streets: [
          {
            ...draft.streets[0]!,
            actions: [
              { id: 'p1', seat: 3, action: 'raise', amount: 1_500 },
              { id: 'p2', seat: 4, action: 'call', amount: null },
            ],
          },
          {
            ...draft.streets[1]!,
            actions: [
              { id: 'f1', seat: 3, action: 'bet', amount: 2_000 },
              { id: 'f2', seat: 4, action: 'fold', amount: null },
            ],
          },
        ],
      },
    }
    // Hero opens to $15, seat 4 calls, the rest fold; Hero's flop bet is not called and comes back.
    const file = exportHand(exact)
    expect(file.result?.grossPot).toBe(500 + 500 + 1_500 + 1_500)
    expect(file.result?.heroResult).toBe(500 + 500 + 1_500)
    expect(parseHandExport(JSON.stringify(file)).reconstruction).toEqual(exact.reconstruction)
  })

  it('rejects a reconstruction that could not have happened', () => {
    const file = exportHand(reconstructedRecord()) as unknown as Record<string, unknown>
    const draft = file.reconstruction as HandDraft
    draft.streets[1]!.cards[0] = { rank: 'A', suit: 's' }
    draft.hero.cards = [
      { rank: 'A', suit: 's' },
      { rank: 'K', suit: 'd' },
    ]
    expect(() => parseHandExport(JSON.stringify(file))).toThrow(/appears more than once/)
  })

  it('rejects a reconstruction alongside an action log, and one in a version 1 file', () => {
    const both = exportHand(reconstructedRecord()) as unknown as Record<string, unknown>
    both.actions = exportHand(sampleRecord()).actions
    expect(() => parseHandExport(JSON.stringify(both))).toThrow(/cannot also have an action log/)

    const old = exportHand(reconstructedRecord()) as unknown as Record<string, unknown>
    old.schemaVersion = 1
    expect(() => parseHandExport(JSON.stringify(old))).toThrow(/version 1 file cannot contain/)
  })

  it('reports malformed remembered cards and amounts', () => {
    const file = exportHand(reconstructedRecord()) as unknown as Record<string, unknown>
    const draft = file.reconstruction as unknown as { hero: { cards: unknown[] }; streets: { actions: { amount: unknown }[] }[] }
    draft.hero.cards[0] = { rank: 'Z', suit: null }
    draft.streets[0]!.actions[0]!.amount = -5
    expect(() => parseHandExport(JSON.stringify(file))).toThrow(ValidationError)
  })
})
