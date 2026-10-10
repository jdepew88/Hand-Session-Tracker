import { useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { HandSummaryPanel } from '../components/HandSummaryPanel'
import { Page } from '../components/Page'
import { DraftSummaryView } from '../components/record/DraftSummaryView'
import { LiveTrack } from '../components/record/LiveTrack'
import { QuickReconstruct } from '../components/record/QuickReconstruct'
import { RecordTable } from '../components/record/RecordTable'
import { RememberedCard } from '../components/record/RememberedCard'
import { draftBoard, draftSeatViews } from '../components/record/draftSeats'
import { formatCents } from '../domain/money'
import { checkDraft } from '../domain/poker/draft/check'
import type { HandDraft } from '../domain/poker/draft/model'
import { participantsLine, summarizeDraft } from '../domain/poker/draft/text'
import { deriveHand } from '../domain/poker/lifecycle'
import type { HandRecord, Session } from '../domain/poker/models'
import { useStore } from '../store/context'
import { gameShort } from '../utils/labels'

/**
 * One hand. Live-tracked hands open in Live Track, which carries on from the
 * last action; reconstructed hands open as the story that was saved, ready to
 * edit.
 *
 * All mutation goes through `update`, which writes the new record to storage
 * and mirrors it locally so the screen never lags a tap behind.
 */
export function RecordHandPage() {
  const { handId } = useParams()
  const { hands, sessions, saveHand, deleteHand, ready } = useStore()

  const stored = hands.find((hand) => hand.id === handId)
  const [working, setWorking] = useState<HandRecord | null>(stored ?? null)
  const [workingId, setWorkingId] = useState<string | null>(stored?.id ?? null)

  // Switching to a different hand reloads the local copy; edits to the current
  // one are not clobbered by the store echoing our own write back.
  if ((stored?.id ?? null) !== workingId) {
    setWorkingId(stored?.id ?? null)
    setWorking(stored ?? null)
  }

  const record = working ?? stored ?? null
  const session = sessions.find((entry) => entry.id === record?.sessionId)

  if (!ready) {
    return (
      <Page title="Hand">
        <p className="text-sm text-room-400">Loading…</p>
      </Page>
    )
  }
  if (!record) return <Navigate to="/hands" replace />

  const update = (next: HandRecord) => {
    const stamped = { ...next, updatedAt: new Date().toISOString() }
    setWorking(stamped)
    void saveHand(stamped)
  }

  const back = session
    ? { to: `/sessions/${session.id}`, label: session.location || 'Session' }
    : { to: '/hands', label: 'Hand history' }

  if (record.reconstruction) {
    return (
      <ReconstructedHand
        record={record}
        draft={record.reconstruction}
        session={session}
        back={back}
        update={update}
        onDelete={() => void deleteHand(record.id)}
      />
    )
  }

  return (
    <Page
      title={`Hand #${record.handNumber}`}
      back={back}
      wide
      subtitle={
        <>
          Live Track · {record.context.stakesLabel} · {record.context.heroPosition} · {record.context.tableSize}-handed
        </>
      }
      action={
        <Link to="/record?mode=quick" className="btn-ghost shrink-0 text-sm">
          Quick Reconstruct
        </Link>
      }
    >
      <div className="-mx-3 sm:mx-0">
        <LiveTrack record={record} session={session} update={update} onDelete={() => void deleteHand(record.id)} />
      </div>
    </Page>
  )
}

function ReconstructedHand({
  record,
  draft,
  session,
  back,
  update,
  onDelete,
}: {
  record: HandRecord
  draft: HandDraft
  session: Session | undefined
  back: { to: string; label: string }
  update: (next: HandRecord) => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const derived = useMemo(() => deriveHand(record), [record])
  const summary = useMemo(() => summarizeDraft(record.setup, draft), [record.setup, draft])
  const check = useMemo(() => checkDraft(record.setup, draft), [record.setup, draft])
  const header = `${record.context.stakesLabel} ${session ? gameShort(session.gameType) : gameShort(record.context.gameType)}`
  const seats = draftSeatViews(record.setup, draft, { street: null, end: true, choosingPlayers: false, actor: null })
  const board = draftBoard(draft, null)

  return (
    <Page
      title={`Hand #${record.handNumber}`}
      back={back}
      wide
      subtitle={
        <>
          Quick Reconstruct · {record.context.stakesLabel} · {record.context.heroPosition}
        </>
      }
      action={
        !editing && (
          <button type="button" className="btn-secondary shrink-0" onClick={() => setEditing(true)}>
            Edit hand
          </button>
        )
      }
    >
      {editing ? (
        <QuickReconstruct
          setup={record.setup}
          header={header}
          initialDraft={draft}
          saveLabel="Save changes"
          onSave={(next, setup) => {
            update({ ...record, setup, reconstruction: next })
            setEditing(false)
          }}
          notice={
            <button type="button" className="btn-ghost mt-2 text-sm" onClick={() => setEditing(false)}>
              Cancel editing
            </button>
          }
        />
      ) : (
        <div className="grid gap-4 pb-8 lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-start">
          <div className="min-w-0">
            <RecordTable
              seatCount={record.setup.tableSize}
              seats={seats}
              buttonSeat={record.setup.buttonSeat}
              label={`The table at the end of the hand: ${participantsLine(record.setup, draft.participants)}`}
              center={
                <>
                  <span className="rc-center__street">{header}</span>
                  {board.length > 0 && (
                    <span className="rc-center__board">
                      {board.map((card, index) => (
                        <RememberedCard key={index} card={card} />
                      ))}
                    </span>
                  )}
                  {derived.result && <span className="rc-center__pot">Pot {formatCents(derived.result.grossPot)}</span>}
                </>
              }
            />
          </div>

          <div className="min-w-0 space-y-4">
            <section aria-label="The hand" className="card-surface p-3">
              <DraftSummaryView summary={summary} heroSeat={record.setup.heroSeat} header={header} />
            </section>

            <section aria-label="Pot and result" className="text-sm">
              {derived.result ? (
                <p className="tabular">
                  Pot <span className="font-semibold">{formatCents(derived.result.grossPot)}</span>
                  {!derived.result.undetermined && (
                    <>
                      {' '}
                      · Hero{' '}
                      <span className={`font-semibold ${derived.result.heroResult >= 0 ? 'text-gain' : 'text-loss'}`}>
                        {formatCents(derived.result.heroResult, { sign: true })}
                      </span>
                    </>
                  )}
                  <span className="block text-xs text-room-400">Worked out from the amounts recorded.</span>
                </p>
              ) : derived.conflicts.length > 0 ? (
                <p role="status" className="rounded-lg border border-chip-amber/50 bg-chip-amber/10 px-3 py-2 text-chip-amber">
                  {derived.conflicts[0]!.message}. The hand&rsquo;s stack has not been changed: edit the hand to correct the
                  amount or that player&rsquo;s starting stack for this hand.
                </p>
              ) : (
                <p className="text-room-300">
                  {draft.pot !== null ? <>Pot about {formatCents(draft.pot)}, as remembered. </> : null}
                  Pot and result not worked out — {derived.missing[0] ?? 'not enough detail'}.
                </p>
              )}
            </section>

            {check.gaps.length > 0 && (
              <section aria-label="Not recorded" className="text-sm">
                <h2 className="label">Not recorded</h2>
                <ul className="flex flex-wrap gap-1.5">
                  {check.gaps.map((gap) => (
                    <li key={gap} className="chip border-dashed">
                      {gap}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <HandSummaryPanel record={record} result={derived.result} onChange={update} showText={false} />

            <button type="button" className="btn-danger w-full" onClick={onDelete}>
              Delete hand
            </button>
          </div>
        </div>
      )}
    </Page>
  )
}
