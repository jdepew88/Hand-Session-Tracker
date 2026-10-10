import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState, Page } from '../components/Page'
import { ChipStacks } from '../components/table/ChipStack'
import { DealerPuck } from '../components/table/DealerButton'
import { stackDepth } from '../components/table/depth'
import { PokerSeat } from '../components/table/PokerSeat'
import { PokerTable } from '../components/table/PokerTable'
import type { PlayerEdit } from '../components/table/PlayerEditor'
import { SeatPanel } from '../components/table/SeatPanel'
import { formatCents } from '../domain/money'
import { createPlayer, stakesLabel } from '../domain/poker/factories'
import type { PlayerProfile, Session } from '../domain/poker/models'
import { cannotMarkEmpty, isSeatOccupied, seatHero, setSeatStatus } from '../domain/poker/occupancy'
import { leaveTable, movePlayer, playersWhoLeft, seatedPlayer, staleOccupants, takeSeat, withPlayerDetails } from '../domain/poker/players'
import { TABLE_SIZES } from '../domain/poker/positions'
import { describeTable, positionName, resizeTable, seatLabel, tableSummary } from '../domain/poker/tableView'
import { useStore } from '../store/context'
import { gameShort } from '../utils/labels'
import { useActiveSession } from '../store/useActiveSession'

/** The "Table" tab: the live table of whichever session is being played. */
export function TableRoute() {
  const { session, sessions, ready } = useActiveSession()

  if (!ready) {
    return (
      <Page title="Table">
        <p className="text-sm text-room-400">Loading…</p>
      </Page>
    )
  }

  if (!session) {
    return (
      <Page title="Table">
        <EmptyState
          title="No session in progress"
          description="Start a session to set your room, stakes, table size and drop once, then record hands against it."
          action={
            <Link to={sessions.length === 0 ? '/sessions/new' : '/sessions'} className="btn-primary">
              {sessions.length === 0 ? 'Start a session' : 'Choose a session'}
            </Link>
          }
        />
      </Page>
    )
  }

  return <TableScreen session={session} />
}

/**
 * Hero seat, button seat, seat occupancy and table size are the session's own
 * fields, and a
 * seat's name and stack are its lineup entry: every change here is written
 * straight through the store, so the hand recorder picks it up as its
 * defaults for the next hand.
 */
function TableScreen({ session }: { session: Session }) {
  const { players, saveSession, savePlayers } = useStore()
  const summaryId = useId()
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null)
  const [focusSeat, setFocusSeat] = useState(1)
  const [status, setStatus] = useState('')
  const seatButtons = useRef(new Map<number, HTMLButtonElement>())

  const views = useMemo(() => describeTable(session, players), [session, players])
  const seatCount = session.tableSize
  const selected = views.find((view) => view.seat === selectedSeat) ?? null
  const rovingSeat = focusSeat <= seatCount ? focusSeat : 1
  const hero = views.find((view) => view.isHero)
  const button = views.find((view) => view.isButton)
  const blinds = {
    sb: views.find((view) => view.position === 'SB')?.seat,
    bb: views.find((view) => view.position === 'BB')?.seat,
  }

  const panel = useRef<HTMLDivElement>(null)

  const select = (seat: number) => {
    const opening = selectedSeat !== seat
    setSelectedSeat(opening ? seat : null)
    setFocusSeat(seat)
    // On a phone the actions sit below the table; bring them up without
    // moving focus. A no-op wherever the panel is already on screen.
    if (opening) {
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? true
      requestAnimationFrame(() =>
        panel.current?.scrollIntoView?.({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' }),
      )
    }
  }

  const moveFocus = (seat: number) => {
    setFocusSeat(seat)
    seatButtons.current.get(seat)?.focus()
  }

  // Arrow keys walk the chairs clockwise / anticlockwise, so the whole table is
  // one tab stop and Tab goes straight on to the seat's actions.
  const onSeatKey = (seat: number) => (event: KeyboardEvent<HTMLButtonElement>) => {
    const next = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key]
    if (next !== undefined) {
      event.preventDefault()
      moveFocus(((seat - 1 + next + seatCount) % seatCount) + 1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      moveFocus(1)
    } else if (event.key === 'End') {
      event.preventDefault()
      moveFocus(seatCount)
    } else if (event.key === 'Escape' && selectedSeat !== null) {
      event.preventDefault()
      setSelectedSeat(null)
    }
  }

  /**
   * Whoever a profile still places in this chair has left: the person who
   * sits down now is someone new. Their notes stay with the session.
   */
  const clearChair = async (seat: number, now: string) => {
    const stale = staleOccupants(players, session.id, seat)
    if (stale.length > 0) await savePlayers(stale.map((player) => leaveTable(player, now)))
  }

  const setHero = async (seat: number) => {
    if (session.heroSeat === seat) return
    if (!isSeatOccupied(session, seat)) await clearChair(seat, new Date().toISOString())
    await saveSession(seatHero(session, seat))
    setStatus(`You are now in seat ${seat}.`)
  }

  const setOccupied = async (seat: number, occupied: boolean) => {
    const now = new Date().toISOString()
    const leaving = occupied ? null : seatedPlayer(players, session, seat)
    const { session: next, cleared } = setSeatStatus(session, seat, occupied ? 'occupied' : 'empty')
    await clearChair(seat, now)
    await saveSession(next)
    if (occupied) {
      setStatus(`Seat ${seat} has a new player, dealt into new hands. Nothing carries over from whoever sat there before.`)
      return
    }
    const who = leaving?.nickname.trim()
    setStatus(
      `Seat ${seat} marked empty.` +
        (who ? ` ${who} has left; their notes stay with this session.` : '') +
        (cleared.includes('hero') ? ' You were sitting there, so your seat needs setting again.' : '') +
        (session.buttonSeat === seat
          ? ` The button stays on seat ${seat} as a dead button; positions return once it is in front of a player.`
          : ''),
    )
  }

  const move = async (fromSeat: number, toSeat: number) => {
    const { session: next, moved } = movePlayer(session, players, fromSeat, toSeat)
    await saveSession(next)
    if (moved) await savePlayers([moved])
    setSelectedSeat(toSeat)
    setFocusSeat(toSeat)
    const who = moved?.nickname.trim() || (session.heroSeat === fromSeat ? 'You' : `The player in seat ${fromSeat}`)
    setStatus(`${who} moved from seat ${fromSeat} to seat ${toSeat}. Seat ${fromSeat} is empty.`)
  }

  const bringBack = async (seat: number, player: PlayerProfile) => {
    await clearChair(seat, new Date().toISOString())
    await saveSession(setSeatStatus(session, seat, 'occupied').session)
    await savePlayers([takeSeat(player, seat)])
    setStatus(`${player.nickname.trim() || 'That player'} is back, in seat ${seat}.`)
  }

  const setButton = async (seat: number) => {
    if (session.buttonSeat === seat) return
    const next = { ...session, buttonSeat: seat }
    await saveSession(next)
    const after = describeTable(next, players)
    const sb = after.find((view) => view.position === 'SB')?.seat
    const bb = after.find((view) => view.position === 'BB')?.seat
    setStatus(
      `Dealer button moved to seat ${seat}.` +
        (after.find((view) => view.seat === seat)?.isEmpty
          ? ' That seat is empty, so it is a dead button and positions are not shown.'
          : sb !== undefined && bb !== undefined
            ? ` Small blind seat ${sb}, big blind seat ${bb}.`
            : ''),
    )
  }

  const resize = async (tableSize: number) => {
    if (tableSize === seatCount) return
    const { session: next, cleared } = resizeTable(session, tableSize)
    await saveSession(next)
    if (selectedSeat !== null && selectedSeat > tableSize) setSelectedSeat(null)
    const lost =
      cleared.length === 2
        ? ' Your seat and the dealer button were on removed seats, so both need setting again.'
        : cleared[0] === 'hero'
          ? ' Your seat was removed, so it needs setting again.'
          : cleared[0] === 'button'
            ? ' The dealer button was on a removed seat, so it needs placing again.'
            : ''
    setStatus(`Table set to ${tableSize} seats.${lost}`)
  }

  const savePlayer = async (seat: number, edit: PlayerEdit) => {
    const view = views.find((entry) => entry.seat === seat)
    const base = view?.player ?? { ...createPlayer(session.id, seat), startingStack: session.startingStack }
    const { stack, stackChanged, ...details } = edit
    await savePlayers([withPlayerDetails(base, { ...details, ...(stackChanged ? { stack } : {}) }, new Date().toISOString())])
    setStatus(`Seat ${seat} saved.`)
  }

  const gameAbbrev = gameShort(session.gameType)

  return (
    <div className="mx-auto w-full max-w-[1240px] px-3 pb-8 pt-3 sm:px-5">
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight">{session.location || 'Unnamed room'}</h1>
          <p className="text-sm text-room-400">
            {stakesLabel(session)} {gameAbbrev} · {seatCount}-handed
          </p>
        </div>
        <Link to={`/sessions/${session.id}`} className="btn-ghost shrink-0 text-sm">
          Session
        </Link>
      </header>

      <dl className="mb-2 flex flex-wrap gap-2 text-sm">
        <div className="chip gap-1.5 py-1.5 text-[0.8rem]">
          <dt className="text-room-400">You</dt>
          <dd className="font-semibold text-room-50">
            {hero ? `Seat ${hero.seat}${hero.position ? ` · ${hero.position}` : ''}` : 'Not set'}
          </dd>
        </div>
        <div className="chip gap-1.5 py-1.5 text-[0.8rem]">
          <dt className="text-room-400">Button</dt>
          <dd className="font-semibold text-room-50">
            {button ? `Seat ${button.seat}${button.isEmpty ? ' · dead' : ''}` : 'Not placed'}
          </dd>
        </div>
        <div className="chip gap-1.5 py-1.5 text-[0.8rem]">
          <dt className="text-room-400">Players</dt>
          <dd className="font-semibold tabular text-room-50">
            {views.filter((view) => !view.isEmpty).length} of {seatCount}
          </dd>
        </div>
      </dl>

      <p id={summaryId} className="sr-only">
        {tableSummary(views)} Use the arrow keys to move between seats and Enter to choose one.
      </p>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start">
        <div role="group" aria-label="Seats" aria-describedby={summaryId}>
          <PokerTable
            seatCount={seatCount}
            center={
              !button ? (
                <>
                  <strong>Place the button</strong>
                  Choose the dealer&rsquo;s seat to see positions
                </>
              ) : button.isEmpty ? (
                <>
                  <strong>Dead button</strong>
                  Seat {button.seat} is empty. Positions show once the button is in front of a player
                </>
              ) : !hero ? (
                <>
                  <strong>Where are you?</strong>
                  Choose the seat you&rsquo;re sitting in
                </>
              ) : (
                <>
                  <strong>
                    {stakesLabel(session)} {gameAbbrev}
                  </strong>
                  {blinds.sb !== undefined && blinds.bb !== undefined && `SB seat ${blinds.sb} · BB seat ${blinds.bb}`}
                </>
              )
            }
          >
            {views
              .filter((view) => view.hasDetails && !view.isEmpty)
              .map((view) => (
                <span key={`chips-${view.seat}`} className={`pt-chips pt-chips-${view.seat}`} aria-hidden="true">
                  <ChipStacks depth={stackDepth(view.stack / session.bigBlind)} seed={view.seat} />
                </span>
              ))}

            {button && <DealerPuck seat={button.seat} />}

            {views.map((view) => (
              <PokerSeat
                key={view.seat}
                seat={view.seat}
                position={view.position}
                hero={view.isHero}
                empty={view.isEmpty}
                selected={view.seat === selectedSeat}
                {...(view.nickname && !view.isEmpty ? { name: view.nickname } : {})}
                {...(view.hasDetails && !view.isEmpty
                  ? {
                      stack: formatCents(view.stack),
                      bigBlinds: `${Math.round(view.stack / session.bigBlind)} BB`,
                    }
                  : {})}
                label={seatLabel(view)}
                tabIndex={view.seat === rovingSeat ? 0 : -1}
                buttonRef={(element) => {
                  if (element) seatButtons.current.set(view.seat, element)
                  else seatButtons.current.delete(view.seat)
                }}
                onSelect={() => select(view.seat)}
                onKeyDown={onSeatKey(view.seat)}
              />
            ))}
          </PokerTable>
        </div>

        <div ref={panel} className="scroll-mb-24 space-y-4">
          <p role="status" className="min-h-5 text-sm text-felt-200">
            {status}
          </p>

          {selected ? (
            <SeatPanel
              // A different person in the chair (or nobody) starts the panel afresh.
              key={`${selected.seat}:${selected.isEmpty ? 'empty' : (selected.player?.id ?? 'new')}`}
              view={selected}
              emptySeats={views.filter((view) => view.isEmpty).map((view) => view.seat)}
              returning={playersWhoLeft(players, session)}
              onMove={(toSeat) => void move(selected.seat, toSeat)}
              onBringBack={(player) => void bringBack(selected.seat, player)}
              lineupHref={`/sessions/${session.id}/players`}
              emptyBlockedReason={cannotMarkEmpty(session, selected.seat)}
              onClose={() => {
                setSelectedSeat(null)
                seatButtons.current.get(selected.seat)?.focus()
              }}
              onSetHero={() => void setHero(selected.seat)}
              onSetButton={() => void setButton(selected.seat)}
              onSetOccupied={(occupied) => void setOccupied(selected.seat, occupied)}
              onSavePlayer={(edit) => savePlayer(selected.seat, edit)}
            />
          ) : (
            <section className="card-surface p-4 text-sm text-room-300">
              <p className="font-semibold text-room-50">Tap a seat</p>
              <p className="mt-1">
                Mark where you&rsquo;re sitting, put the dealer button in front of a seat, mark empty chairs, or
                note who&rsquo;s there and how deep they are.
              </p>
              <ul className="mt-3 space-y-1.5 text-xs text-room-400">
                <li className="flex items-center gap-2">
                  <span aria-hidden="true" className="rounded-full bg-felt-400 px-1.5 text-[0.6rem] font-extrabold text-room-950">
                    YOU
                  </span>
                  your seat
                </li>
                <li className="flex items-center gap-2">
                  <span aria-hidden="true" className="grid h-4 w-4 place-items-center rounded-full bg-ivory text-[0.55rem] font-extrabold text-room-950">
                    D
                  </span>
                  dealer button; positions count from it
                </li>
                <li className="flex items-center gap-2">
                  <span aria-hidden="true" className="h-3 w-5 rounded border border-dashed border-room-400" />
                  empty seat, not dealt into new hands
                </li>
              </ul>
            </section>
          )}

          <TableSizePicker value={seatCount} onChange={(size) => void resize(size)} />
          {hero?.position && (
            <p className="text-xs text-room-400">
              Next hand you&rsquo;re {positionName(hero.position).toLowerCase()}. New hands start from this seat and
              button.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function TableSizePicker({ value, onChange }: { value: number; onChange: (size: number) => void }) {
  const name = useId()
  return (
    <fieldset>
      <legend className="label">Seats at this table</legend>
      <div className="flex flex-wrap gap-1.5">
        {[...TABLE_SIZES]
          .sort((a, b) => a - b)
          .map((size) => (
            <label key={size} className="cursor-pointer">
              <input
                type="radio"
                name={name}
                value={size}
                checked={value === size}
                onChange={() => onChange(size)}
                className="peer sr-only"
              />
              <span
                className="tap inline-flex items-center justify-center rounded-lg border border-room-700 bg-room-850 px-3 text-sm font-semibold tabular text-room-300 peer-checked:border-felt-400 peer-checked:bg-room-800 peer-checked:text-room-50 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-felt-400"
              >
                {size}
              </span>
            </label>
          ))}
      </div>
      <p className="mt-1.5 text-xs text-room-400">
        Hands already recorded keep their own table. Names, stacks and empty seats on removed seats come back if you
        switch back.
      </p>
    </fieldset>
  )
}
