import { useMemo, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { MoneyField } from '../components/MoneyField'
import { Page } from '../components/Page'
import { createPlayer } from '../domain/poker/factories'
import {
  PLAYER_ARCHETYPES,
  PLAYER_TAG_COLORS,
  type PlayerArchetype,
  type PlayerProfile,
  type PlayerTagColor,
} from '../domain/poker/models'
import { occupiedSeats } from '../domain/poker/occupancy'
import { derivePositions } from '../domain/poker/positions'
import { useStore } from '../store/context'

const COLOR_CLASS: Record<PlayerTagColor, string> = {
  slate: 'bg-room-500',
  red: 'bg-chip-red',
  amber: 'bg-chip-amber',
  emerald: 'bg-felt-400',
  sky: 'bg-sky-400',
  violet: 'bg-violet-400',
}

/**
 * The session lineup.
 *
 * Archetypes are the player's own shorthand for how an opponent has been
 * playing, not a measurement. Nothing in the app reasons from them, ranks
 * players by them, or presents them as analysis -- they exist so a hand read
 * back weeks later still has the context the player had at the table.
 */
export function PlayersPage() {
  const { sessionId } = useParams()
  const { sessions, players, savePlayers, ready } = useStore()

  const session = sessions.find((entry) => entry.id === sessionId)
  const [draft, setDraft] = useState<PlayerProfile[]>([])
  const [saved, setSaved] = useState(false)

  const existing = useMemo(
    () => players.filter((player) => player.sessionId === sessionId),
    [players, sessionId],
  )

  // Seed the form from storage, and reseed only when the stored lineup actually
  // changes -- adjusting during render rather than in an effect, so an edit is
  // never briefly overwritten by the previous seed.
  const seedKey = session
    ? `${session.id}:${session.tableSize}:${existing.map((p) => `${p.id}@${p.updatedAt}`).join(',')}`
    : ''
  const [lastSeedKey, setLastSeedKey] = useState<string | null>(null)
  if (session && seedKey !== lastSeedKey) {
    setLastSeedKey(seedKey)
    setDraft(
      Array.from({ length: session.tableSize }, (_, index) => {
        const seat = index + 1
        return (
          existing.find((player) => player.seat === seat) ?? {
            ...createPlayer(session.id, seat),
            startingStack: session.startingStack,
          }
        )
      }),
    )
  }

  if (!ready) return <Page title="Table lineup"><p className="text-sm text-room-400">Loading…</p></Page>
  if (!session) return <Navigate to="/sessions" replace />

  const positions =
    session.buttonSeat === null
      ? new Map<number, string>()
      : derivePositions(occupiedSeats(session), session.buttonSeat)

  const update = (id: string, patch: Partial<PlayerProfile>) => {
    setSaved(false)
    setDraft((current) =>
      current.map((player) => (player.id === id ? { ...player, ...patch } : player)),
    )
  }

  return (
    <Page
      title="Table lineup"
      back={{ to: `/sessions/${session.id}`, label: 'Session' }}
      subtitle="Optional. Anything you enter shows up on the hand recorder and in saved hands."
    >
      <div className="space-y-3 pb-8">
        {draft.map((player) => (
          <details key={player.id} className="card-surface p-3">
            <summary className="flex cursor-pointer items-center gap-3">
              <span
                aria-hidden="true"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-room-700 bg-room-850 text-xs font-semibold tabular"
              >
                {player.seat}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">
                  {player.nickname.trim() || `Seat ${player.seat}`}
                  {player.seat === session.heroSeat && (
                    <span className="ml-2 chip border-felt-500/50 text-felt-200">Hero</span>
                  )}
                </span>
                <span className="block text-xs text-room-400">
                  {positions.get(player.seat ?? 0) ?? 'Position set per hand'}
                  {player.archetype !== 'Unknown' && ` · ${player.archetype === 'Custom' ? player.customArchetype || 'Custom' : player.archetype}`}
                </span>
              </span>
              <span
                aria-hidden="true"
                className={`h-4 w-4 shrink-0 rounded-full ${COLOR_CLASS[player.color]}`}
              />
            </summary>

            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="label">Nickname</span>
                <input
                  className="field"
                  value={player.nickname}
                  maxLength={120}
                  placeholder="Grey Hoodie"
                  onChange={(event) => update(player.id, { nickname: event.target.value })}
                />
              </label>

              <label className="block">
                <span className="label">Style (your shorthand, not a read the app computes)</span>
                <select
                  className="field"
                  value={player.archetype}
                  onChange={(event) =>
                    update(player.id, { archetype: event.target.value as PlayerArchetype })
                  }
                >
                  {PLAYER_ARCHETYPES.map((archetype) => (
                    <option key={archetype} value={archetype}>
                      {archetype}
                    </option>
                  ))}
                </select>
              </label>

              {player.archetype === 'Custom' && (
                <label className="block">
                  <span className="label">Custom style</span>
                  <input
                    className="field"
                    value={player.customArchetype}
                    maxLength={120}
                    onChange={(event) => update(player.id, { customArchetype: event.target.value })}
                  />
                </label>
              )}

              <fieldset>
                <legend className="label">Tag colour</legend>
                <div className="flex flex-wrap gap-2">
                  {PLAYER_TAG_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      aria-pressed={player.color === color}
                      aria-label={`Tag colour ${color}`}
                      onClick={() => update(player.id, { color })}
                      className={`tap flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
                        player.color === color
                          ? 'border-felt-400 bg-room-800'
                          : 'border-room-700 bg-room-850'
                      }`}
                    >
                      <span aria-hidden="true" className={`h-3.5 w-3.5 rounded-full ${COLOR_CLASS[color]}`} />
                      {color}
                    </button>
                  ))}
                </div>
              </fieldset>

              <div className="grid grid-cols-2 gap-3">
                <MoneyField
                  label="Starting stack"
                  value={player.startingStack ?? session.startingStack}
                  onChange={(value) => update(player.id, { startingStack: value })}
                />
                <MoneyField
                  label="Current stack"
                  value={player.currentStack ?? player.startingStack ?? session.startingStack}
                  onChange={(value) => update(player.id, { currentStack: value })}
                />
              </div>

              <label className="block">
                <span className="label">Notes</span>
                <textarea
                  className="field min-h-20"
                  rows={2}
                  maxLength={4000}
                  value={player.notes}
                  onChange={(event) => update(player.id, { notes: event.target.value })}
                />
              </label>
            </div>
          </details>
        ))}

        <button
          type="button"
          className="btn-primary h-12 w-full"
          onClick={async () => {
            await savePlayers(draft)
            setSaved(true)
          }}
        >
          Save lineup
        </button>
        {saved && (
          <p role="status" className="text-center text-sm text-felt-200">
            Lineup saved.
          </p>
        )}
      </div>
    </Page>
  )
}
