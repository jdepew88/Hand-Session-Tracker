import { Link, Navigate, useParams } from 'react-router-dom'
import { Page } from '../components/Page'
import { PlayerCard, PlayerEditor } from '../components/table/PlayerEditor'
import { createPlayer } from '../domain/poker/factories'
import type { PlayerProfile } from '../domain/poker/models'
import { playersWhoLeft, withPlayerDetails } from '../domain/poker/players'
import { describeTable } from '../domain/poker/tableView'
import { useStore } from '../store/context'

/**
 * Everyone at this table this session: who is sitting where now, and who has
 * left (with their notes). Tags and notes are the player's own shorthand --
 * nothing in the app reasons from them or ranks anyone by them.
 */
export function PlayersPage() {
  const { sessionId } = useParams()
  const { sessions, players, savePlayers, ready } = useStore()
  const session = sessions.find((entry) => entry.id === sessionId)

  if (!ready) return <Page title="Players"><p className="text-sm text-room-400">Loading…</p></Page>
  if (!session) return <Navigate to="/sessions" replace />

  const seated = describeTable(session, players).filter((view) => !view.isEmpty)
  const left = playersWhoLeft(players, session)
  const now = () => new Date().toISOString()

  const save = async (base: PlayerProfile, edit: Parameters<Parameters<typeof PlayerEditor>[0]['onSave']>[0]) => {
    const { stack, stackChanged, ...details } = edit
    await savePlayers([withPlayerDetails(base, { ...details, ...(stackChanged ? { stack } : {}) }, now())])
  }

  return (
    <Page
      title="Players"
      back={{ to: `/sessions/${session.id}`, label: 'Session' }}
      subtitle="Who is at the table now, and who has left. Seat changes happen on the Table."
    >
      <div className="space-y-5 pb-8">
        <section aria-labelledby="players-seated">
          <h2 id="players-seated" className="label">
            At the table
          </h2>
          <ul className="space-y-2">
            {seated.map((view) => (
              <li key={view.seat}>
                <details className="card-surface p-3">
                  <summary className="flex cursor-pointer items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-room-700 bg-room-850 text-xs font-semibold tabular"
                    >
                      {view.seat}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="sr-only">Seat {view.seat}{view.position ? `, ${view.position}` : ''}: </span>
                      <PlayerCard
                        player={view.player}
                        stack={view.stack}
                        stackIsDefault={view.stackIsDefault}
                        fallback={view.isHero ? 'You' : 'No details yet'}
                      />
                    </span>
                  </summary>
                  <div className="mt-3">
                    <PlayerEditor
                      key={`${view.player?.id ?? view.seat}:${view.player?.updatedAt ?? ''}`}
                      player={view.player}
                      stack={view.stack}
                      isHero={view.isHero}
                      onSave={(edit) =>
                        save(view.player ?? { ...createPlayer(session.id, view.seat), startingStack: session.startingStack }, edit)
                      }
                    />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </section>

        {left.length > 0 && (
          <section aria-labelledby="players-left">
            <h2 id="players-left" className="label">
              Left the table
            </h2>
            <ul className="space-y-2">
              {left.map((player) => (
                <li key={player.id}>
                  <details className="card-surface p-3">
                    <summary className="cursor-pointer">
                      <PlayerCard
                        player={player}
                        stack={player.currentStack ?? player.startingStack ?? session.startingStack}
                        stackIsDefault={false}
                        fallback="Unnamed player"
                      />
                    </summary>
                    <div className="mt-3">
                      <PlayerEditor
                        key={`${player.id}:${player.updatedAt}`}
                        player={player}
                        stack={player.currentStack ?? player.startingStack ?? session.startingStack}
                        isHero={false}
                        onSave={(edit) => save(player, edit)}
                      />
                    </div>
                  </details>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-room-400">
              To seat someone again, tap their empty chair on the <Link to="/table" className="underline">Table</Link>.
            </p>
          </section>
        )}
      </div>
    </Page>
  )
}
