// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { App } from '../App'
import { createPlayer, createSession } from '../domain/poker/factories'
import type { PlayerProfile, Session } from '../domain/poker/models'
import { STORES, idb, resetDatabaseConnection } from '../storage/db'
import { indexedDbRepositories } from '../storage/repositories'
import { StoreProvider } from '../store/StoreProvider'

/**
 * The table screen against the real store and storage: every assertion about
 * hero, button or table size is checked in IndexedDB, not just on screen.
 */

function renderTable() {
  return render(
    <MemoryRouter initialEntries={['/table']}>
      <StoreProvider repositories={indexedDbRepositories}>
        <App />
      </StoreProvider>
    </MemoryRouter>,
  )
}

async function seed(overrides: Partial<Session> = {}, players: (s: Session) => PlayerProfile[] = () => []) {
  const session = {
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
  const lineup = players(session)
  if (lineup.length > 0) await indexedDbRepositories.players.saveMany(lineup)
  return session
}

const stored = async (id: string) => (await indexedDbRepositories.sessions.get(id))!

const seatButtons = () =>
  within(screen.getByRole('group', { name: 'Seats' })).getAllByRole('button', { name: /^Seat \d+/ })

const seat = (n: number) =>
  within(screen.getByRole('group', { name: 'Seats' })).getByRole('button', { name: new RegExp(`^Seat ${n}(,|$)`) })

beforeEach(async () => {
  resetDatabaseConnection()
  for (const store of Object.values(STORES)) await idb.clear(store)
})

afterEach(cleanup)

describe('table screen', () => {
  it('keeps the no-session state', async () => {
    renderTable()
    expect(await screen.findByText('No session in progress')).toBeTruthy()
  })

  it('draws one numbered seat per chair with the session summary', async () => {
    await seed()
    renderTable()
    expect(await screen.findByRole('heading', { name: 'Commerce Casino' })).toBeTruthy()
    expect(screen.getByText(/\$2\/\$5 NLH · 9-handed/)).toBeTruthy()
    expect(seatButtons().map((button) => button.getAttribute('data-seat'))).toEqual(
      ['1', '2', '3', '4', '5', '6', '7', '8', '9'],
    )
  })

  it('sets the hero seat, persists it, and allows only one', async () => {
    const session = await seed()
    renderTable()
    fireEvent.click(await screen.findByRole('button', { name: /^Seat 3,/ }))
    fireEvent.click(screen.getByRole('button', { name: 'I sit here' }))
    await waitFor(async () => expect((await stored(session.id)).heroSeat).toBe(3))
    await waitFor(() => expect(seat(3).getAttribute('aria-label')).toContain('you'))

    fireEvent.click(seat(5))
    fireEvent.click(screen.getByRole('button', { name: 'I sit here' }))
    await waitFor(async () => expect((await stored(session.id)).heroSeat).toBe(5))
    await waitFor(() => {
      const heroes = seatButtons().filter((button) => /, you(,|$)/.test(button.getAttribute('aria-label')!))
      expect(heroes.map((button) => button.getAttribute('data-seat'))).toEqual(['5'])
    })
  })

  it('places the dealer button, rotates positions, and keeps a single puck', async () => {
    const session = await seed()
    renderTable()
    // No button yet: no positions.
    expect((await screen.findByRole('button', { name: /^Seat 1,/ })).getAttribute('aria-label')).toBe(
      'Seat 1, no player details',
    )

    fireEvent.click(seat(4))
    fireEvent.click(screen.getByRole('button', { name: 'Button here' }))
    await waitFor(async () => expect((await stored(session.id)).buttonSeat).toBe(4))
    await waitFor(() => expect(seat(4).getAttribute('aria-label')).toContain('Button'))
    expect(seat(5).getAttribute('aria-label')).toContain('Small blind')
    expect(seat(6).getAttribute('aria-label')).toContain('Big blind')
    expect(seat(7).getAttribute('aria-label')).toContain('Under the gun')
    expect(screen.getAllByTestId('dealer-puck').map((puck) => puck.getAttribute('data-seat'))).toEqual(['4'])

    fireEvent.click(seat(9))
    fireEvent.click(screen.getByRole('button', { name: 'Button here' }))
    await waitFor(async () => expect((await stored(session.id)).buttonSeat).toBe(9))
    await waitFor(() => expect(seat(1).getAttribute('aria-label')).toContain('Small blind'))
    expect(seat(2).getAttribute('aria-label')).toContain('Big blind')
    expect(seat(4).getAttribute('aria-label')).not.toContain('Button')
    expect(screen.getAllByTestId('dealer-puck').map((puck) => puck.getAttribute('data-seat'))).toEqual(['9'])
    expect(screen.getByRole('status').textContent).toContain('Small blind seat 1, big blind seat 2')
  })

  it('changes table size, adding and removing seats and clearing seats that no longer exist', async () => {
    const session = await seed({ heroSeat: 8, buttonSeat: 2 })
    renderTable()
    await screen.findByRole('button', { name: /^Seat 9,/ })

    fireEvent.click(screen.getByRole('radio', { name: '6' }))
    await waitFor(async () => expect(await stored(session.id)).toMatchObject({ tableSize: 6, heroSeat: null, buttonSeat: 2 }))
    await waitFor(() => expect(seatButtons()).toHaveLength(6))
    expect(screen.getByRole('status').textContent).toContain('Your seat was removed')
    expect(screen.getByText(/· 6-handed/)).toBeTruthy()
    expect(seat(2).getAttribute('aria-label')).toContain('Button')

    fireEvent.click(screen.getByRole('radio', { name: '10' }))
    await waitFor(() => expect(seatButtons()).toHaveLength(10))
    expect((await stored(session.id)).tableSize).toBe(10)
  })

  it('distinguishes seats with player details and shows their stack', async () => {
    await seed({ buttonSeat: 9 }, (s) => [{ ...createPlayer(s.id, 2), nickname: 'Grey Hoodie', currentStack: 124_000 }])
    renderTable()
    const named = await screen.findByRole('button', { name: /^Seat 2,/ })
    expect(named.getAttribute('aria-label')).toBe('Seat 2, Big blind, Grey Hoodie, stack $1,240')
    expect(within(named).getByText('$1,240')).toBeTruthy()
    expect(within(named).getByText('248 BB')).toBeTruthy()
    expect(named.className).not.toContain('pt-seat--empty')

    // Occupied with nothing noted: a normal seat, just without a stack.
    const bare = seat(3)
    expect(bare.getAttribute('aria-label')).toBe('Seat 3, Under the gun, no player details')
    expect(bare.className).not.toContain('pt-seat--empty')
    expect(within(bare).queryByText(/\$/)).toBeNull()
  })

  it('saves a seat name and stack to the lineup', async () => {
    const session = await seed()
    renderTable()
    fireEvent.click(await screen.findByRole('button', { name: /^Seat 7,/ }))
    fireEvent.change(screen.getByLabelText('Player'), { target: { value: 'Old Man Coffee' } })
    fireEvent.change(screen.getByLabelText('Stack'), { target: { value: '310' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save seat' }))

    await waitFor(async () => {
      const lineup = await indexedDbRepositories.players.listAll()
      expect(lineup).toHaveLength(1)
      expect(lineup[0]).toMatchObject({ sessionId: session.id, seat: 7, nickname: 'Old Man Coffee', currentStack: 31_000 })
    })
    await waitFor(() => expect(seat(7).getAttribute('aria-label')).toBe('Seat 7, Old Man Coffee, stack $310'))
  })

  it('is one tab stop, walked with the arrow keys', async () => {
    await seed()
    renderTable()
    await screen.findByRole('button', { name: /^Seat 1,/ })
    expect(seatButtons().filter((button) => button.tabIndex === 0).map((button) => button.dataset.seat)).toEqual(['1'])

    seat(1).focus()
    fireEvent.keyDown(seat(1), { key: 'ArrowRight' })
    expect(document.activeElement).toBe(seat(2))
    fireEvent.keyDown(seat(2), { key: 'ArrowLeft' })
    fireEvent.keyDown(seat(1), { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(seat(9))
    fireEvent.keyDown(seat(9), { key: 'Home' })
    expect(document.activeElement).toBe(seat(1))
    fireEvent.keyDown(seat(1), { key: 'End' })
    expect(document.activeElement).toBe(seat(9))
    expect(seat(9).tabIndex).toBe(0)

    fireEvent.click(seat(9))
    expect(seat(9).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'I sit here' })).toBeTruthy()
    fireEvent.keyDown(seat(9), { key: 'Escape' })
    expect(screen.queryByRole('button', { name: 'I sit here' })).toBeNull()
  })

  it('marks a seat empty and seats a player there again, keeping its number and lineup entry', async () => {
    const session = await seed({ buttonSeat: 9 }, (s) => [{ ...createPlayer(s.id, 4), nickname: 'Sunglasses' }])
    renderTable()
    fireEvent.click(await screen.findByRole('button', { name: /^Seat 4,/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Mark seat empty' }))

    await waitFor(async () => expect((await stored(session.id)).seatStatus[4]).toBe('empty'))
    await waitFor(() => expect(seat(4).getAttribute('aria-label')).toBe('Seat 4, empty'))
    expect(seat(4).className).toContain('pt-seat--empty')
    expect(within(seat(4)).getByText('EMPTY')).toBeTruthy()
    expect(within(seat(4)).queryByText('Sunglasses')).toBeNull()
    expect(seatButtons().map((button) => button.dataset.seat)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9'])
    // Positions skip the empty chair: seat 5 is now UTG+1 rather than UTG+2.
    expect(seat(3).getAttribute('aria-label')).toContain('Under the gun')
    expect(seat(5).getAttribute('aria-label')).toContain('Under the gun plus 1')
    expect(screen.getByText('8 of 9')).toBeTruthy()
    expect(screen.queryByLabelText('Player')).toBeNull()
    // The lineup entry is kept.
    expect((await indexedDbRepositories.players.listAll())[0]).toMatchObject({ seat: 4, nickname: 'Sunglasses' })

    fireEvent.click(screen.getByRole('button', { name: 'Seat player here' }))
    await waitFor(async () => expect((await stored(session.id)).seatStatus[4]).toBe('occupied'))
    await waitFor(() => expect(seat(4).getAttribute('aria-label')).toContain('Sunglasses'))
    expect(seat(4).className).not.toContain('pt-seat--empty')
  })

  it("clears your seat when it is marked empty, and seats you in an empty one", async () => {
    const session = await seed({ heroSeat: 6, buttonSeat: 2 })
    renderTable()
    fireEvent.click(await screen.findByRole('button', { name: /^Seat 6,/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Mark seat empty' }))
    await waitFor(async () => expect(await stored(session.id)).toMatchObject({ heroSeat: null, seatStatus: { 6: 'empty' } }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('your seat needs setting again'))
    expect(seatButtons().some((button) => /, you(,|$)/.test(button.getAttribute('aria-label')!))).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'I sit here' }))
    await waitFor(async () => expect(await stored(session.id)).toMatchObject({ heroSeat: 6, seatStatus: { 6: 'occupied' } }))
  })

  it('keeps the button on an emptied seat as a dead button', async () => {
    const session = await seed({ buttonSeat: 5 })
    renderTable()
    fireEvent.click(await screen.findByRole('button', { name: /^Seat 5,/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Mark seat empty' }))
    await waitFor(async () => expect(await stored(session.id)).toMatchObject({ buttonSeat: 5, seatStatus: { 5: 'empty' } }))
    await waitFor(() => expect(seat(5).getAttribute('aria-label')).toBe('Seat 5, empty, dead button'))
    expect(screen.getAllByTestId('dealer-puck').map((puck) => puck.getAttribute('data-seat'))).toEqual(['5'])
    expect(screen.getByText('Dead button')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('dead button')
    expect(seat(6).getAttribute('aria-label')).toBe('Seat 6, no player details')
  })

  it('will not empty the last two occupied seats', async () => {
    await seed({ tableSize: 2 })
    renderTable()
    fireEvent.click(await screen.findByRole('button', { name: /^Seat 1,/ }))
    const mark = screen.getByRole('button', { name: 'Mark seat empty' }) as HTMLButtonElement
    expect(mark.disabled).toBe(true)
    expect(screen.getByText(/at least 2 players/)).toBeTruthy()
  })

  it('shows every chair of a pre-occupancy session as occupied', async () => {
    const { seatStatus: _dropped, ...old } = await seed({ heroSeat: 3, buttonSeat: 9 })
    void _dropped
    await idb.put(STORES.sessions, old)
    renderTable()
    await screen.findByRole('button', { name: /^Seat 3,/ })
    expect(seatButtons().filter((button) => button.className.includes('pt-seat--empty'))).toHaveLength(0)
    expect(screen.getByText('9 of 9')).toBeTruthy()
    expect(seat(3).getAttribute('aria-label')).toBe('Seat 3, Under the gun, you, no player details')
  })

  it('remembers empty seats when the table shrinks and grows back', async () => {
    const session = await seed({ seatStatus: { 8: 'empty' } })
    renderTable()
    await screen.findByRole('button', { name: /^Seat 8, empty/ })
    fireEvent.click(screen.getByRole('radio', { name: '6' }))
    await waitFor(() => expect(seatButtons()).toHaveLength(6))
    fireEvent.click(screen.getByRole('radio', { name: '9' }))
    await waitFor(() => expect(seatButtons()).toHaveLength(9))
    expect(seat(8).getAttribute('aria-label')).toBe('Seat 8, empty')
    expect((await stored(session.id)).seatStatus[8]).toBe('empty')
  })

  it('describes the table for screen readers', async () => {
    await seed({ heroSeat: 3, buttonSeat: 9 })
    renderTable()
    const group = await screen.findByRole('group', { name: 'Seats' })
    const summary = document.getElementById(group.getAttribute('aria-describedby')!)!
    expect(summary.textContent).toContain('You are in seat 3, under the gun. The dealer button is on seat 9.')
  })
})
