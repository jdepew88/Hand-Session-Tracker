// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { App } from '../App'
import { createHandRecord, createHandSetup, createSession, defaultSeats, newId } from '../domain/poker/factories'
import type { Session } from '../domain/poker/models'
import { STORES, idb, resetDatabaseConnection } from '../storage/db'
import { indexedDbRepositories } from '../storage/repositories'
import { StoreProvider } from '../store/StoreProvider'

/**
 * The session journal and the session dashboard, against real storage.
 * Every money figure on screen is checked against the cash-out minus buy-ins
 * the session record implies.
 */

function renderApp(route: string) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <StoreProvider repositories={indexedDbRepositories}>
        <App />
      </StoreProvider>
    </MemoryRouter>,
  )
}

const HOUR = 60 * 60_000
const ago = (ms: number) => new Date(Date.now() - ms).toISOString()

async function seed(overrides: Partial<Session> = {}, hands = 0) {
  const session: Session = {
    ...createSession({
      location: 'Commerce Casino',
      gameType: "No-Limit Hold'em",
      smallBlind: 200,
      bigBlind: 500,
      tableSize: 9,
      buyIn: 50_000,
      startingStack: 50_000,
    }),
    ...overrides,
  }
  await indexedDbRepositories.sessions.save(session)
  for (let number = 1; number <= hands; number += 1) {
    const setup = createHandSetup({ session, buttonSeat: 9, heroSeat: 3, seats: defaultSeats(9, 50_000) })
    await indexedDbRepositories.hands.save(createHandRecord(session, setup, number))
  }
  return session
}

/** A finished session: four hours and eighteen minutes, ending two days ago. */
const finished = (cashOut: number | null, extra: Partial<Session> = {}) => ({
  location: 'Bicycle Casino',
  startedAt: ago(48 * HOUR + 258 * 60_000),
  endedAt: ago(48 * HOUR),
  cashOut,
  ...extra,
})

const card = (name: RegExp) => screen.getByRole('link', { name }).closest('article')!

beforeEach(async () => {
  resetDatabaseConnection()
  for (const store of Object.values(STORES)) await idb.clear(store)
})

afterEach(cleanup)

describe('sessions journal', () => {
  it('invites the first session when there are none', async () => {
    renderApp('/sessions')
    expect(await screen.findByRole('heading', { name: 'No sessions yet' })).toBeTruthy()
    expect(screen.getByText(/SessionTracker will keep your table, hands and results together/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Start a session' }).getAttribute('href')).toBe('/sessions/new')
  })

  it('shows a live session apart, with its running time and no invented result', async () => {
    const session = await seed({ startedAt: ago(2 * HOUR + 14 * 60_000 + 20_000), heroSeat: 8, buttonSeat: 8 }, 3)
    renderApp('/sessions')
    expect(await screen.findByRole('heading', { name: 'Live session' })).toBeTruthy()
    const live = card(/^Live session at Commerce Casino/)
    expect(within(live).getByText('LIVE')).toBeTruthy()
    expect(within(live).getByText(/2h 14m so far/)).toBeTruthy()
    expect(within(live).getByText('In progress')).toBeTruthy()
    expect(within(live).queryByText(/^([+-]\$[\d,]+|\$0)$/)).toBeNull()
    expect(within(live).getByText('Buy-in $500')).toBeTruthy()
    expect(within(live).getByText('3 hands')).toBeTruthy()
    expect(within(live).getByText('Seat 8 · BTN')).toBeTruthy()
    expect(within(live).getByRole('link', { name: /^Live session at Commerce Casino/ }).getAttribute('href')).toBe(
      `/sessions/${session.id}`,
    )
  })

  it('takes a live session straight back to the table and the recorder', async () => {
    // An older live session is listed second; its buttons must make it the app's session.
    const older = await seed({ location: 'Hustler Casino', startedAt: ago(5 * HOUR) })
    await seed({ startedAt: ago(HOUR) })
    renderApp('/sessions')
    const hustler = (await screen.findByRole('link', { name: /^Live session at Hustler Casino/ })).closest('article')!
    expect(within(hustler).getByRole('link', { name: 'Record hand' }).getAttribute('href')).toBe('/record')
    fireEvent.click(within(hustler).getByRole('link', { name: 'Return to table' }))
    expect(await screen.findByRole('heading', { name: 'Hustler Casino' })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Seats' })).toBeTruthy()
    expect(older.endedAt).toBeNull()
  })

  it('leads a winning session with its profit', async () => {
    await seed(finished(86_000), 12)
    renderApp('/sessions')
    const entry = await waitFor(() => card(/^Bicycle Casino/))
    expect(within(entry).getByText('+$360')).toBeTruthy()
    expect(within(entry).getByText('Profit')).toBeTruthy()
    expect(within(entry).getByText('+$360').className).toContain('text-gain')
    expect(within(entry).getByText('$2/$5 NLH · 9-handed')).toBeTruthy()
    expect(within(entry).getByText(/· 4h 18m$/)).toBeTruthy()
    expect(within(entry).getByText('12 hands')).toBeTruthy()
    expect(entry.textContent).toContain('$500 → $860')
    expect(within(entry).queryByRole('link', { name: 'Return to table' })).toBeNull()
    expect(within(entry).getByRole('link').getAttribute('aria-label')).toMatch(
      /^Bicycle Casino, \$2\/\$5 No-Limit Hold'em, 9-handed, .+, duration 4 hours 18 minutes, profit \$360, bought in for \$500, cashed out for \$860, 12 hands recorded\.$/,
    )
  })

  it('shows a losing session as a loss, in words as well as colour', async () => {
    await seed(finished(28_000))
    renderApp('/sessions')
    const entry = await waitFor(() => card(/^Bicycle Casino/))
    expect(within(entry).getByText('-$220').className).toContain('text-loss')
    expect(within(entry).getByText('Loss')).toBeTruthy()
    expect(within(entry).getByRole('link').getAttribute('aria-label')).toContain('loss $220')
    expect(within(entry).getByText('0 hands')).toBeTruthy()
  })

  it('shows break-even as $0', async () => {
    await seed(finished(50_000))
    renderApp('/sessions')
    const entry = await waitFor(() => card(/^Bicycle Casino/))
    expect(within(entry).getByText('$0')).toBeTruthy()
    expect(within(entry).getByText('Break-even')).toBeTruthy()
    expect(within(entry).getByRole('link').getAttribute('aria-label')).toContain('broke even')
  })

  it('does not fake a cash-out that was never recorded', async () => {
    await seed(finished(null))
    renderApp('/sessions')
    const entry = await waitFor(() => card(/^Bicycle Casino/))
    expect(within(entry).getByText('No cash-out')).toBeTruthy()
    expect(entry.textContent).not.toContain('→')
    expect(within(entry).getByText('Buy-in $500')).toBeTruthy()
  })

  it('counts rebuys into the buy-in', async () => {
    await seed(
      finished(120_000, {
        buyIns: [
          { id: newId(), amount: 50_000, at: ago(50 * HOUR) },
          { id: newId(), amount: 30_000, at: ago(49 * HOUR) },
        ],
      }),
    )
    renderApp('/sessions')
    const entry = await waitFor(() => card(/^Bicycle Casino/))
    expect(within(entry).getByText('+$400')).toBeTruthy()
    expect(entry.textContent).toContain('$800 → $1,200 · 2 buy-ins')
  })

  it('files finished sessions under their month, newest first', async () => {
    await seed({ ...finished(60_000), location: 'Older Room', startedAt: '2026-08-02T19:00:00.000Z', endedAt: '2026-08-02T23:00:00.000Z' })
    await seed(finished(86_000))
    renderApp('/sessions')
    await waitFor(() => card(/^Older Room/))
    const headings = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)
    expect(headings.at(-1)).toMatch(/August 2026/)
    const rooms = screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)
    expect(rooms).toEqual(['Bicycle Casino', 'Older Room'])
  })

  it('keeps every action a labelled text control, not an icon', async () => {
    await seed()
    renderApp('/sessions')
    await screen.findByRole('link', { name: /^Live session at/ })
    for (const control of [...screen.getAllByRole('link'), ...screen.queryAllByRole('button')]) {
      expect((control.getAttribute('aria-label') ?? control.textContent ?? '').trim()).not.toBe('')
    }
    // Long room names wrap rather than truncate.
    expect(screen.getByRole('heading', { level: 3 }).className).toContain('[overflow-wrap:anywhere]')
  })
})

describe('session dashboard', () => {
  it('summarises a finished session with its result first', async () => {
    const session = await seed(finished(86_000), 2)
    renderApp(`/sessions/${session.id}`)
    expect(await screen.findByRole('heading', { level: 1, name: 'Bicycle Casino' })).toBeTruthy()
    expect(screen.getByText("$2/$5 No-Limit Hold'em · 9-handed")).toBeTruthy()
    const result = screen.getByRole('region', { name: 'Result' })
    expect(within(result).getByText('+$360')).toBeTruthy()
    expect(within(result).getByText('Session profit')).toBeTruthy()
    const value = (term: string) => within(result).getByText(term).nextElementSibling!.textContent
    expect(value('Buy-in')).toBe('$500')
    expect(value('Cash-out')).toBe('$860')
    expect(value('Duration')).toBe('4h 18m')
    expect(value('Hands')).toBe('2')
    expect(screen.getByText(/ – /)).toBeTruthy()
  })

  it('links a live session to the table, the recorder and its hands', async () => {
    const session = await seed({ startedAt: ago(HOUR + 5 * 60_000), heroSeat: 8, buttonSeat: 8 }, 1)
    renderApp(`/sessions/${session.id}`)
    const actions = await screen.findByRole('navigation', { name: 'Session actions' })
    expect(within(actions).getByRole('link', { name: 'Return to table' }).getAttribute('href')).toBe('/table')
    expect(within(actions).getByRole('link', { name: 'Record hand' }).getAttribute('href')).toBe('/record')
    expect(within(actions).getByRole('link', { name: 'View hands' }).getAttribute('href')).toBe('#session-hands')
    expect(document.getElementById('session-hands')).toBeTruthy()

    const result = screen.getByRole('region', { name: 'Result' })
    expect(within(result).getByText('In progress')).toBeTruthy()
    expect(within(result).getByText('Cash-out').nextElementSibling!.textContent).toBe('Not yet')
    expect(within(result).getByText('Playing for').nextElementSibling!.textContent).toBe('1h 5m')
    expect(screen.getByText('LIVE')).toBeTruthy()

    const table = screen.getByRole('link', { name: /^Open the table\./ })
    expect(table.getAttribute('href')).toBe('/table')
    expect(table.getAttribute('aria-label')).toBe(
      'Open the table. You are in seat 8, button. 9-handed, 9 seats occupied. Dealer button on seat 8.',
    )
    expect(within(table).getByText('Seat 8 · BTN')).toBeTruthy()
  })

  it('still ends a session with a cash-out, and then shows the result', async () => {
    const session = await seed({ startedAt: ago(3 * HOUR) })
    renderApp(`/sessions/${session.id}`)
    fireEvent.click(await screen.findByRole('button', { name: 'Cash out and end' }))
    fireEvent.change(screen.getByLabelText('Cash out'), { target: { value: '310' } })
    fireEvent.click(screen.getByRole('button', { name: 'End session' }))
    await waitFor(async () => expect((await indexedDbRepositories.sessions.get(session.id))?.cashOut).toBe(31_000))
    const result = screen.getByRole('region', { name: 'Result' })
    expect(await within(result).findByText('-$190')).toBeTruthy()
    expect(within(result).getByText('Session loss')).toBeTruthy()
    expect(screen.queryByText('LIVE')).toBeNull()
    expect(screen.getByRole('navigation', { name: 'Session actions' }).textContent).not.toContain('Return to table')
  })
})
