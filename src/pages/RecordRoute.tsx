import { useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { EmptyState, Page } from '../components/Page'
import { QuickReconstruct } from '../components/record/QuickReconstruct'
import { RecordTable } from '../components/record/RecordTable'
import { draftSeatViews } from '../components/record/draftSeats'
import { readStoredDraft, writeStoredDraft } from '../components/record/storedDraft'
import { createDraft } from '../domain/poker/draft/ops'
import type { HandDraft } from '../domain/poker/draft/model'
import { createHandRecord, createHandSetup, handContext, stakesLabel } from '../domain/poker/factories'
import { isHandInProgress } from '../domain/poker/lifecycle'
import type { HandSetup, PlayerProfile, Session } from '../domain/poker/models'
import { newHandSeating } from '../domain/poker/occupancy'
import { positionName } from '../domain/poker/tableView'
import { PREFERENCE_KEYS, readPreference, writePreference } from '../storage/preferences'
import { useStore } from '../store/context'
import { useActiveSession } from '../store/useActiveSession'
import { gameShort } from '../utils/labels'

export type RecordMode = 'quick' | 'live'

const MODES: { id: RecordMode; label: string; hint: string }[] = [
  { id: 'quick', label: 'Quick Reconstruct', hint: 'From memory, after the hand' },
  { id: 'live', label: 'Live Track', hint: 'Action by action, as it happens' },
]

/**
 * The "Record" tab: two ways to record the next hand at the current table.
 *
 * Quick Reconstruct captures a remembered hand; Live Track follows one as it
 * is played. Both start from the table and save the same kind of hand record.
 * The mode last used is remembered; an explicit `?mode=` wins, and a live
 * hand still in progress takes you back to it.
 */
export function RecordRoute() {
  const { session, sessions, ready } = useActiveSession()
  const { hands, players } = useStore()
  const [params] = useSearchParams()

  if (!ready) {
    return (
      <Page title="Record">
        <p className="text-sm text-room-400">Loading…</p>
      </Page>
    )
  }

  if (!session) {
    return (
      <Page title="Record">
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
  const unfinished = sessionHands.find((hand) => !hand.reconstruction && isHandInProgress(hand))
  const requested = params.get('mode')
  const remembered = readPreference(PREFERENCE_KEYS.recordMode)
  const mode: RecordMode =
    requested === 'quick' || requested === 'live'
      ? requested
      : unfinished
        ? 'live'
        : remembered === 'live'
          ? 'live'
          : 'quick'

  if (mode === 'live' && unfinished) return <Navigate to={`/hands/${unfinished.id}`} replace />

  const nextNumber = sessionHands.reduce((max, hand) => Math.max(max, hand.handNumber), 0) + 1
  const lineup = players.filter((player) => player.sessionId === session.id)

  return (
    <Page
      title={`Record hand #${nextNumber}`}
      subtitle={
        <>
          {session.location || 'Unnamed room'} · {stakesLabel(session)} {gameShort(session.gameType)}
        </>
      }
      wide
    >
      <ModeSwitch mode={mode} />
      {mode === 'quick' ? (
        <QuickRecord key={session.id} session={session} lineup={lineup} handNumber={nextNumber} />
      ) : (
        <LiveStart session={session} lineup={lineup} handNumber={nextNumber} />
      )}
    </Page>
  )
}

function ModeSwitch({ mode }: { mode: RecordMode }) {
  return (
    <nav aria-label="Recording mode" className="mb-3">
      <ul className="grid grid-cols-2 gap-1 rounded-xl border border-room-700 bg-room-900 p-1">
        {MODES.map((entry) => (
          <li key={entry.id}>
            <Link
              to={`/record?mode=${entry.id}`}
              replace
              aria-current={mode === entry.id ? 'page' : undefined}
              onClick={() => writePreference(PREFERENCE_KEYS.recordMode, entry.id)}
              className={`flex min-h-12 flex-col items-center justify-center rounded-lg px-2 py-1.5 text-center leading-tight ${
                mode === entry.id ? 'bg-room-700 font-semibold text-room-50' : 'text-room-400 hover:text-room-50'
              }`}
            >
              <span className="text-sm">{entry.label}</span>
              <span className="text-[0.68rem] font-normal text-room-400 max-[359px]:hidden">{entry.hint}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/** Setup for the next hand at this table: only occupied seats are dealt in. */
function useNextHandSetup(session: Session, lineup: readonly PlayerProfile[]): HandSetup {
  return useMemo(() => createHandSetup({ session, ...newHandSeating(session, lineup) }), [session, lineup])
}

function TableNotice({ session }: { session: Session }) {
  const missing = [session.heroSeat === null ? 'your seat' : null, session.buttonSeat === null ? 'the dealer button' : null].filter(Boolean)
  if (missing.length === 0) return null
  return (
    <p className="mt-2 rounded-lg border border-chip-amber/40 bg-chip-amber/10 px-3 py-2 text-sm text-chip-amber">
      The table doesn&rsquo;t have {missing.join(' or ')} set, so positions are a best guess.{' '}
      <Link to="/table" className="font-semibold underline">
        Set up the table
      </Link>
    </p>
  )
}

function QuickRecord({ session, lineup, handNumber }: { session: Session; lineup: readonly PlayerProfile[]; handNumber: number }) {
  const navigate = useNavigate()
  const { saveHand } = useStore()
  const setup = useNextHandSetup(session, lineup)
  const [restored] = useState(() => readStoredDraft(session.id, setup))
  const [attempt, setAttempt] = useState(0)
  const fromStorage = attempt === 0 ? restored : null
  const initial: HandDraft = fromStorage?.draft ?? createDraft(setup)
  // The hand's own stacks: the table's, plus any correction kept with the draft.
  const initialSetup = fromStorage?.setup ?? setup

  // `handSetup` is this hand's snapshot, including any stack corrected for this hand only.
  const save = async (draft: HandDraft, handSetup: HandSetup) => {
    const record = {
      ...createHandRecord(session, handSetup, handNumber),
      context: handContext(session, handSetup),
      reconstruction: draft,
    }
    await saveHand(record)
    writeStoredDraft(session.id, null)
    void navigate(`/hands/${record.id}`)
  }

  return (
    <QuickReconstruct
      key={attempt}
      setup={initialSetup}
      header={`${stakesLabel(session)} ${gameShort(session.gameType)}`}
      initialDraft={initial}
      onSave={save}
      onDraftChange={(draft, handSetup) => writeStoredDraft(session.id, { draft, setup: handSetup, tableSetup: setup })}
      notice={
        <>
          <TableNotice session={session} />
          {attempt === 0 && restored && (
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-room-300">
              Picked up the hand you hadn&rsquo;t saved.
              <button
                type="button"
                className="btn-ghost px-3 text-sm"
                onClick={() => {
                  writeStoredDraft(session.id, null)
                  setAttempt((value) => value + 1)
                }}
              >
                Start over
              </button>
            </p>
          )}
        </>
      }
    />
  )
}

function LiveStart({ session, lineup, handNumber }: { session: Session; lineup: readonly PlayerProfile[]; handNumber: number }) {
  const navigate = useNavigate()
  const { saveHand } = useStore()
  const setup = useNextHandSetup(session, lineup)
  const [starting, setStarting] = useState(false)
  // Everyone dealt in is in a live hand until they fold.
  const everyone = { ...createDraft(setup), participants: setup.seats.map((seat) => seat.seat) }
  const seats = draftSeatViews(setup, everyone, { street: null, end: false, choosingPlayers: true, actor: null })
  const heroPosition = seats.find((view) => view.hero)?.position

  const start = async () => {
    if (starting) return
    setStarting(true)
    const record = createHandRecord(session, setup, handNumber)
    await saveHand(record)
    void navigate(`/hands/${record.id}`, { replace: true })
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
      <div className="min-w-0">
        <RecordTable
          seatCount={setup.tableSize}
          seats={seats}
          buttonSeat={setup.buttonSeat}
          label={`The table: ${setup.seats.length} players dealt in${heroPosition ? `, Hero ${positionName(heroPosition).toLowerCase()}` : ''}`}
          center={<span className="rc-center__street">Hand #{handNumber}</span>}
        />
        <TableNotice session={session} />
      </div>
      <div className="space-y-3">
        <p className="text-sm text-room-300">
          Everything comes from the table: {setup.seats.length} players dealt in, the blinds posted, Hero
          {heroPosition ? ` on the ${heroPosition}` : ''}. Pick your cards, then tap each action as it happens. The engine
          knows who acts next.
        </p>
        <button type="button" className="btn-primary h-14 w-full text-base" disabled={starting} onClick={() => void start()}>
          Deal hand #{handNumber}
        </button>
        <Link to="/table" className="btn-secondary h-12 w-full">
          Change the table first
        </Link>
      </div>
    </div>
  )
}
