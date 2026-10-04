import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { EmptyState, Page } from '../components/Page'
import { createHandRecord, createHandSetup, defaultSeats } from '../domain/poker/factories'
import { isHandInProgress } from '../domain/poker/lifecycle'
import { useActiveSession } from '../store/useActiveSession'
import { useStore } from '../store/context'

/**
 * The "Record" tab.
 *
 * Continues the hand already in progress if there is one; otherwise it offers
 * to start the next one. Creating a hand is an explicit tap rather than a side
 * effect of navigating here, so opening the tab to check something never
 * leaves a stray empty hand behind.
 */
export function RecordRoute() {
  const navigate = useNavigate()
  const { hands, players, saveHand } = useStore()
  const { session, sessions, ready } = useActiveSession()
  const [starting, setStarting] = useState(false)

  if (!ready) {
    return (
      <Page title="Record hand">
        <p className="text-sm text-room-400">Loading…</p>
      </Page>
    )
  }

  if (!session) {
    return (
      <Page title="Record hand">
        <EmptyState
          title={sessions.length === 0 ? 'No session yet' : 'No session selected'}
          description="A hand belongs to a session, which is where the room, stakes, table size and drop come from."
          action={
            <Link to={sessions.length === 0 ? '/sessions/new' : '/sessions'} className="btn-primary">
              {sessions.length === 0 ? 'Start a session' : 'Choose a session'}
            </Link>
          }
        />
      </Page>
    )
  }

  const sessionHands = hands.filter((hand) => hand.sessionId === session.id)
  const unfinished = sessionHands.find(isHandInProgress)
  if (unfinished) return <Navigate to={`/hands/${unfinished.id}`} replace />

  const nextNumber = sessionHands.reduce((max, hand) => Math.max(max, hand.handNumber), 0) + 1
  const lineup = players.filter((player) => player.sessionId === session.id)

  const start = async () => {
    if (starting) return
    setStarting(true)
    const setup = createHandSetup({
      session,
      buttonSeat: session.buttonSeat ?? session.tableSize,
      heroSeat: session.heroSeat ?? 1,
      seats: defaultSeats(session.tableSize, session.startingStack, lineup),
    })
    const record = createHandRecord(session, setup, nextNumber)
    await saveHand(record)
    void navigate(`/hands/${record.id}`, { replace: true })
  }

  return (
    <Page
      title={`Hand #${nextNumber}`}
      subtitle={
        <>
          {session.location || 'Unnamed room'} · {session.tableSize}-handed
        </>
      }
      back={{ to: `/sessions/${session.id}`, label: 'Session' }}
    >
      <div className="space-y-4">
        <p className="text-sm text-room-300">
          The table details carry over from the session. You only confirm the button and your seat,
          pick your two cards, and record the action.
        </p>
        <button
          type="button"
          className="btn-primary h-14 w-full text-base"
          disabled={starting}
          onClick={() => void start()}
        >
          Start hand #{nextNumber}
        </button>
        {lineup.length === 0 && (
          <Link to={`/sessions/${session.id}/players`} className="btn-secondary h-12 w-full">
            Set up the table lineup first
          </Link>
        )}
      </div>
    </Page>
  )
}
