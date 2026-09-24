// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { App } from './App'
import { createHandRecord, createHandSetup, createSession, defaultSeats } from './domain/poker/factories'
import { EXAMPLE_STREET_DROP } from './domain/poker/rake'
import { STORES, idb, resetDatabaseConnection } from './storage/db'
import { indexedDbRepositories } from './storage/repositories'
import { StoreProvider } from './store/StoreProvider'

/**
 * Smoke tests for the screens.
 *
 * The engine carries the detailed testing; these exist to catch the failures a
 * type checker cannot see -- a screen that throws on mount, a control wired to
 * nothing, an action that does not reach the event log. Each one drives the
 * real components against the real storage layer.
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

async function seedSession() {
  const session = createSession({
    location: 'Commerce Casino',
    gameType: "No-Limit Hold'em",
    smallBlind: 500,
    bigBlind: 500,
    tableSize: 6,
    buyIn: 50_000,
    startingStack: 50_000,
    rake: EXAMPLE_STREET_DROP,
    buttonSeat: 6,
    heroSeat: 3,
  })
  await indexedDbRepositories.sessions.save(session)
  return session
}

beforeEach(async () => {
  resetDatabaseConnection()
  for (const store of Object.values(STORES)) await idb.clear(store)
})

afterEach(cleanup)

describe('sessions', () => {
  it('shows the empty state before anything is recorded', async () => {
    renderApp('/')
    expect(await screen.findByText('No sessions yet')).toBeTruthy()
  })

  it('lists a saved session with its stakes', async () => {
    await seedSession()
    renderApp('/')
    expect(await screen.findByText('Commerce Casino')).toBeTruthy()
    expect(screen.getByText(/\$5\/\$5/)).toBeTruthy()
  })

  it('creates a session from the form', async () => {
    renderApp('/sessions/new')
    const location = await screen.findByLabelText('Location')
    fireEvent.change(location, { target: { value: 'Local Card Room' } })
    fireEvent.click(screen.getByRole('button', { name: 'Start session' }))

    await waitFor(async () => {
      const sessions = await indexedDbRepositories.sessions.list()
      expect(sessions).toHaveLength(1)
      expect(sessions[0]!.location).toBe('Local Card Room')
    })
  })
})

describe('recording a hand', () => {
  async function seedHand() {
    const session = await seedSession()
    const setup = createHandSetup({
      session,
      buttonSeat: 6,
      heroSeat: 3,
      seats: defaultSeats(6, 50_000),
    })
    const record = createHandRecord(session, setup, 1)
    await indexedDbRepositories.hands.save(record)
    return { session, record }
  }

  it('asks for hole cards before any action can be recorded', async () => {
    const { record } = await seedHand()
    renderApp(`/hands/${record.id}`)

    expect(await screen.findByText('Your hole cards')).toBeTruthy()
    const start = screen.getByRole('button', { name: 'Choose your two cards' })
    expect(start.hasAttribute('disabled')).toBe(true)
  })

  it('selects a card with a rank tap then a suit tap', async () => {
    const { record } = await seedHand()
    renderApp(`/hands/${record.id}`)

    const picker = (await screen.findByText('Your hole cards')).closest('fieldset')!
    fireEvent.click(within(picker).getByRole('button', { name: 'Ace' }))
    fireEvent.click(within(picker).getByRole('button', { name: 'Ace of spades' }))

    await waitFor(async () => {
      const saved = await indexedDbRepositories.hands.get(record.id)
      expect(saved?.setup.heroCards).toEqual(['As'])
    })

    // The same physical card cannot be chosen twice.
    fireEvent.click(within(picker).getByRole('button', { name: 'Ace' }))
    expect(
      within(picker).getByRole('button', { name: 'Ace of spades' }).hasAttribute('disabled'),
    ).toBe(true)
  })

  it('records preflop action and updates the pot', async () => {
    const { session } = await seedSession().then(async (session) => {
      const setup = createHandSetup({
        session,
        buttonSeat: 6,
        heroSeat: 3,
        seats: defaultSeats(6, 50_000),
      })
      setup.heroCards = ['As', 'Ks']
      const record = createHandRecord(session, setup, 1)
      await indexedDbRepositories.hands.save(record)
      return { session, record }
    })

    const hands = await indexedDbRepositories.hands.listBySession(session.id)
    const record = hands[0]!
    renderApp(`/hands/${record.id}`)

    // Blinds are already in: $5 + $5.
    expect(await screen.findByText('Gross pot')).toBeTruthy()
    // Hero is seat 3, which is under the gun with the button on seat 6, so the
    // panel names them as Hero rather than by position.
    const action = screen.getByRole('region', { name: 'Action' })
    expect(within(action).getByText('Hero')).toBeTruthy()

    fireEvent.click(within(action).getByRole('button', { name: /^Fold$/ }))

    await waitFor(async () => {
      const saved = await indexedDbRepositories.hands.get(record.id)
      expect(saved?.events).toHaveLength(1)
      expect(saved?.events[0]).toMatchObject({ kind: 'action', action: 'fold', seat: 3 })
    })

    // Action has moved on to the next seat.
    await waitFor(() => {
      expect(
        within(screen.getByRole('region', { name: 'Action' })).getByText('HJ'),
      ).toBeTruthy()
    })
  })

  it('undoes the last action', async () => {
    const session = await seedSession()
    const setup = createHandSetup({
      session,
      buttonSeat: 6,
      heroSeat: 3,
      seats: defaultSeats(6, 50_000),
    })
    setup.heroCards = ['As', 'Ks']
    const record = createHandRecord(session, setup, 1)
    record.events = [{ id: 'e1', kind: 'action', street: 'preflop', seat: 3, action: 'fold', to: 0 }]
    await indexedDbRepositories.hands.save(record)

    renderApp(`/hands/${record.id}`)
    fireEvent.click(await screen.findByRole('button', { name: 'Undo last' }))

    await waitFor(async () => {
      const saved = await indexedDbRepositories.hands.get(record.id)
      expect(saved?.events).toHaveLength(0)
    })
  })
})

describe('hand history and settings', () => {
  it('renders the history filters and the empty state', async () => {
    renderApp('/hands')
    expect(await screen.findByText('No hands yet')).toBeTruthy()
    expect(screen.getByLabelText('Search notes and tags')).toBeTruthy()
  })

  it('renders settings with the built-in rake presets', async () => {
    renderApp('/settings')
    expect(await screen.findByText('Rake presets')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'No rake' })).toBeTruthy()
  })

  it('sends someone with no session to the session flow', async () => {
    renderApp('/record')
    expect(await screen.findByText('No session yet')).toBeTruthy()
  })
})
