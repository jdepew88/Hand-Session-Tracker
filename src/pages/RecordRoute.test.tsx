// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { App } from '../App'
import { createHandRecord, createHandSetup, createPlayer, createSession, defaultSeats } from '../domain/poker/factories'
import type { HandRecord, Session } from '../domain/poker/models'
import { STORES, idb, resetDatabaseConnection } from '../storage/db'
import { indexedDbRepositories } from '../storage/repositories'
import { StoreProvider } from '../store/StoreProvider'

/**
 * Record, against the real store and storage.
 *
 * The table: six chairs, seat 4 empty, Hero on the button in seat 6. With
 * five players dealt in, seat 1 is the small blind, 2 the big blind, 3 UTG
 * and 5 the cutoff ("Hoodie guy").
 */

function renderAt(route: string) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <StoreProvider repositories={indexedDbRepositories}>
        <App />
      </StoreProvider>
    </MemoryRouter>,
  )
}

async function seed(): Promise<Session> {
  const session: Session = {
    ...createSession({
      location: 'Commerce Casino',
      gameType: "No-Limit Hold'em",
      smallBlind: 200,
      bigBlind: 500,
      tableSize: 6,
      buyIn: 100_000,
      startingStack: 100_000,
      heroSeat: 6,
      buttonSeat: 6,
    }),
  }
  session.seatStatus = { ...session.seatStatus, 4: 'empty' }
  await indexedDbRepositories.sessions.save(session)
  await indexedDbRepositories.players.saveMany([{ ...createPlayer(session.id, 5), nickname: 'Hoodie guy', currentStack: 64_000 }])
  return session
}

const savedHands = () => indexedDbRepositories.hands.listAll()

const seatsGroup = () => screen.getByRole('group', { name: /^Seats/ })
const seat = (n: number) => within(seatsGroup()).getByRole('button', { name: new RegExp(`^Seat ${n},`) })
const button = (name: string | RegExp) => screen.getByRole('button', { name })

async function startQuick(route = '/record') {
  renderAt(route)
  await screen.findByRole('heading', { name: 'Who was in the hand?' })
}

/** Hero vs the cutoff, A♠ K♦: the first three steps. */
async function heroVsCutoffWithCards() {
  await startQuick()
  fireEvent.click(seat(5))
  fireEvent.click(button('Next: cards'))
  const cards = (await screen.findByRole('group', { name: "Hero's two cards" })) as HTMLElement
  fireEvent.click(within(cards).getByRole('button', { name: 'Ace' }))
  fireEvent.click(within(cards).getByRole('button', { name: 'Ace of spades' }))
  fireEvent.click(within(cards).getByRole('button', { name: 'King' }))
  fireEvent.click(within(cards).getByRole('button', { name: 'King of diamonds' }))
  fireEvent.click(button('Next: preflop'))
  await screen.findByRole('heading', { name: 'Preflop' })
}

beforeEach(async () => {
  resetDatabaseConnection()
  for (const store of Object.values(STORES)) await idb.clear(store)
  localStorage.clear()
  await seed()
})

afterEach(cleanup)

describe('choosing a mode', () => {
  it('opens Quick Reconstruct by default, from the table', async () => {
    await startQuick()
    const modes = screen.getByRole('navigation', { name: 'Recording mode' })
    expect(within(modes).getByRole('link', { name: /Quick Reconstruct/ }).getAttribute('aria-current')).toBe('page')
    expect(within(modes).getByRole('link', { name: /Live Track/ }).getAttribute('aria-current')).toBeNull()

    // Positions, names and empty chairs come from the table; nothing is asked again.
    expect(seat(5).getAttribute('aria-label')).toBe('Seat 5, Cutoff, Hoodie guy')
    expect(seat(1).getAttribute('aria-label')).toBe('Seat 1, Small blind')
    expect(seat(4).getAttribute('aria-label')).toBe('Seat 4, empty')
    expect(screen.getByText('Commerce Casino · $2/$5 NLH')).toBeTruthy()
  })

  it('remembers the mode last chosen', async () => {
    await startQuick()
    fireEvent.click(screen.getByRole('link', { name: /Live Track/ }))
    expect(await screen.findByRole('button', { name: 'Deal hand #1' })).toBeTruthy()
    cleanup()

    renderAt('/record')
    expect(await screen.findByRole('button', { name: 'Deal hand #1' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Live Track/ }).getAttribute('aria-current')).toBe('page')
  })
})

describe('Quick Reconstruct', () => {
  it('starts with Hero in the hand and adds opponents from the table', async () => {
    await startQuick()
    expect(seat(6).getAttribute('aria-label')).toMatch(/you, in the hand\. Hero is always in the hand\.$/)
    expect(seat(6).getAttribute('aria-pressed')).toBe('true')
    expect(button('Next: cards').hasAttribute('disabled')).toBe(true)

    fireEvent.click(seat(6))
    expect(seat(6).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(seat(4))
    expect(seat(4).getAttribute('aria-pressed')).toBe('false')

    fireEvent.click(seat(5))
    expect(seat(5).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getAllByText('Hero BTN vs CO (Hoodie guy)').length).toBeGreaterThan(0)
    expect(button('Next: cards').hasAttribute('disabled')).toBe(false)

    // The same choice from the position list.
    const opponents = screen.getByRole('group', { name: 'Opponents' })
    fireEvent.click(within(opponents).getByRole('button', { name: /BB/ }))
    expect(screen.getAllByText('Hero BTN vs BB, CO (Hoodie guy)').length).toBeGreaterThan(0)
  })

  it('saves a useful hand with gaps, and never fills them in', async () => {
    await heroVsCutoffWithCards()
    fireEvent.click(button('CO raises, Hero 3-bets, CO calls'))
    fireEvent.click(button('Next: flop'))
    await screen.findByRole('heading', { name: 'Flop' })
    fireEvent.click(button('Don’t remember'))
    await screen.findByRole('heading', { name: 'Turn' })
    fireEvent.click(button('Review & save'))

    await screen.findByRole('heading', { name: 'Review and save' })
    expect(screen.getAllByText('Details not recorded').length).toBeGreaterThan(0)
    const gaps = screen.getByText('Not recorded', { selector: 'h3' }).parentElement!
    expect(within(gaps).getByText("Preflop: CO's raise amount")).toBeTruthy()
    expect(within(gaps).getByText('Flop action')).toBeTruthy()
    expect(within(gaps).getByText('Winner')).toBeTruthy()
    expect(screen.getByText(/Not worked out — Preflop: CO's raise amount not recorded/)).toBeTruthy()

    fireEvent.click(button('Save hand'))
    await waitFor(async () => expect(await savedHands()).toHaveLength(1))
    const [hand] = (await savedHands()) as [HandRecord]
    expect(hand.events).toEqual([])
    expect(hand.setup.seats.map((entry) => entry.seat)).toEqual([1, 2, 3, 5, 6])
    expect(hand.setup.seats.find((entry) => entry.seat === 5)).toMatchObject({ label: 'Hoodie guy', startingStack: 64_000 })
    expect(hand.context.heroPosition).toBe('BTN')
    const draft = hand.reconstruction!
    expect(draft.participants).toEqual([5, 6])
    expect(draft.hero.cards).toEqual([
      { rank: 'A', suit: 's' },
      { rank: 'K', suit: 'd' },
    ])
    expect(draft.streets[0]!.actions.map((action) => [action.seat, action.action, action.amount])).toEqual([
      [5, 'raise', null],
      [6, 'raise', null],
      [5, 'call', null],
    ])
    expect(draft.streets[1]).toMatchObject({ street: 'flop', actions: [] })
    expect(draft.winners).toBeNull()

    // The saved hand opens as its story.
    expect(await screen.findByRole('button', { name: 'Edit hand' })).toBeTruthy()
    expect(screen.getByText(/Quick Reconstruct · \$2\/\$5 · BTN/)).toBeTruthy()
  })

  it('takes an amount only when one is given', async () => {
    await heroVsCutoffWithCards()
    const action = screen.getByRole('group', { name: "Cutoff's action" })
    fireEvent.click(within(action).getByRole('button', { name: 'Raise' }))

    const amount = screen.getByLabelText('CO raise amount') as HTMLInputElement
    expect(amount.value).toBe('')
    expect(amount.placeholder).toBe('Not recorded')
    fireEvent.change(amount, { target: { value: '20' } })

    // The engine's turn order moves on to Hero without being asked.
    const heroAction = screen.getByRole('group', { name: "Hero's action" })
    fireEvent.click(within(heroAction).getByRole('button', { name: 'Call' }))
    expect(screen.getByRole('list', { name: 'Preflop action so far' }).textContent).toContain('Cutoff raised to $20.')
    expect(screen.getByRole('list', { name: 'Preflop action so far' }).textContent).toContain('Hero called.')

    fireEvent.click(button('Review & save'))
    fireEvent.click(await screen.findByRole('button', { name: 'Save hand' }))
    await waitFor(async () => expect(await savedHands()).toHaveLength(1))
    const [hand] = (await savedHands()) as [HandRecord]
    expect(hand.reconstruction!.streets[0]!.actions.map((entry) => entry.amount)).toEqual([2_000, null])
  })

  it('records flop, turn and river action, a mucked opponent and the winner', async () => {
    await heroVsCutoffWithCards()
    fireEvent.click(button('CO raises, Hero calls'))
    for (const street of ['flop', 'turn', 'river'] as const) {
      fireEvent.click(button(`Next: ${street}`))
      await screen.findByRole('heading', { name: street[0]!.toUpperCase() + street.slice(1) })
      fireEvent.click(button('CO checks, Hero bets, CO calls'))
    }
    const river = screen.getByRole('list', { name: 'River action so far' })
    expect(river.textContent).toContain('Cutoff checked.')
    expect(river.textContent).toContain('Hero bet.')

    fireEvent.click(button('Next: showdown'))
    await screen.findByRole('heading', { name: 'Showdown' })
    const cutoff = screen.getByRole('group', { name: 'CO · Hoodie guy' })
    fireEvent.click(within(cutoff).getByRole('button', { name: 'Mucked' }))
    const winner = screen.getByRole('group', { name: 'Who won?' })
    fireEvent.click(within(winner).getByRole('button', { name: 'Hero' }))
    expect(within(winner).getByText('Hero wins')).toBeTruthy()

    fireEvent.click(button('Review'))
    await screen.findByRole('heading', { name: 'Review and save' })
    expect(screen.getByText('CO mucks')).toBeTruthy()
    expect(screen.getByText('Hero shows A♠ K♦')).toBeTruthy()

    fireEvent.click(button('Save hand'))
    await waitFor(async () => expect(await savedHands()).toHaveLength(1))
    const [hand] = (await savedHands()) as [HandRecord]
    expect(hand.reconstruction!.showdown).toEqual([{ seat: 5, status: 'mucked', cards: null }])
    expect(hand.reconstruction!.winners).toEqual([6])
    expect(hand.reconstruction!.streets.map((street) => street.street)).toEqual(['preflop', 'flop', 'turn', 'river'])
  })

  it('records a split pot and an opponent win', async () => {
    await heroVsCutoffWithCards()
    fireEvent.click(button('Showdown'))
    await screen.findByRole('heading', { name: 'Showdown' })
    const winner = screen.getByRole('group', { name: 'Who won?' })
    fireEvent.click(within(winner).getByRole('button', { name: 'CO' }))
    expect(within(winner).getByText('CO wins')).toBeTruthy()
    fireEvent.click(within(winner).getByRole('button', { name: 'Hero' }))
    expect(within(winner).getByText('Split pot: CO and Hero')).toBeTruthy()
  })

  it('shows a conflicting all-in, and corrects the stack for this hand only', async () => {
    await heroVsCutoffWithCards()
    fireEvent.click(button('CO raises, Hero calls'))
    fireEvent.change(screen.getByLabelText('CO raise amount'), { target: { value: '20' } })
    fireEvent.click(button('Next: flop'))
    await screen.findByRole('heading', { name: 'Flop' })
    // The table has the cutoff on $640, so $620 left after the preflop $20.
    fireEvent.click(within(screen.getByRole('group', { name: "Cutoff's action" })).getByRole('button', { name: 'All-in' }))
    fireEvent.change(screen.getByLabelText('CO all-in amount'), { target: { value: '500' } })
    fireEvent.click(within(screen.getByRole('group', { name: "Hero's action" })).getByRole('button', { name: 'Call' }))
    fireEvent.click(button('Review & save'))

    await screen.findByRole('heading', { name: 'Review and save' })
    expect(screen.getByText("Flop: CO's all-in for $500 does not match the $620 they had in this hand.")).toBeTruthy()
    expect(screen.queryByText('$1,047')).toBeNull()

    fireEvent.click(button('Start CO on $520 for this hand'))
    // Blinds $2 + $5 from players not in the hand, $20 each preflop, $500 each on the flop.
    expect(screen.getByText('$1,047')).toBeTruthy()
    expect((screen.getByLabelText('CO starting stack') as HTMLInputElement).value).toBe('520')

    fireEvent.click(button('Save hand'))
    await waitFor(async () => expect(await savedHands()).toHaveLength(1))
    const [hand] = (await savedHands()) as [HandRecord]
    expect(hand.setup.seats.find((entry) => entry.seat === 5)!.startingStack).toBe(52_000)
    expect(hand.reconstruction!.streets[1]!.actions[0]).toMatchObject({ action: 'allin', amount: 50_000 })

    // The Table still has the cutoff on $640.
    const [player] = await indexedDbRepositories.players.listAll()
    expect(player).toMatchObject({ seat: 5, currentStack: 64_000 })
    const session = (await indexedDbRepositories.sessions.list())[0]!
    expect(session.startingStack).toBe(100_000)
  })

  it('takes an all-in with no amount as the stack left, with nothing missing', async () => {
    await heroVsCutoffWithCards()
    fireEvent.click(button('CO raises, Hero calls'))
    fireEvent.change(screen.getByLabelText('CO raise amount'), { target: { value: '20' } })
    fireEvent.click(button('Next: flop'))
    await screen.findByRole('heading', { name: 'Flop' })
    fireEvent.click(within(screen.getByRole('group', { name: "Cutoff's action" })).getByRole('button', { name: 'All-in' }))
    fireEvent.click(within(screen.getByRole('group', { name: "Hero's action" })).getByRole('button', { name: 'Call' }))
    fireEvent.click(button('Review & save'))
    await screen.findByRole('heading', { name: 'Review and save' })
    // $47 preflop ($2 + $5 + 2 x $20), then the cutoff's $620 and Hero's call.
    expect(screen.getByText('$1,287')).toBeTruthy()
    expect(screen.queryByText(/all-in amount/)).toBeNull()
  })

  it('will not take a card already in the hand', async () => {
    await heroVsCutoffWithCards()
    fireEvent.click(button('Next: flop'))
    const flop = (await screen.findByRole('group', { name: 'Flop cards' })) as HTMLElement
    fireEvent.click(within(flop).getByRole('button', { name: 'Ace' }))
    expect(within(flop).getByRole('button', { name: 'Ace of spades' }).hasAttribute('disabled')).toBe(true)
    expect(within(flop).getByRole('button', { name: 'Ace of hearts' }).hasAttribute('disabled')).toBe(false)
  })

  it('keeps unknown suits unknown: typed "T82" stays three ranks', async () => {
    await heroVsCutoffWithCards()
    fireEvent.click(button('Next: flop'))
    const typed = (await screen.findByPlaceholderText('Tc8h2c, T82')) as HTMLInputElement
    fireEvent.change(typed, { target: { value: 'T82' } })
    fireEvent.keyDown(typed, { key: 'Enter' })
    const flop = screen.getByRole('group', { name: 'Flop cards' })
    expect(within(flop).getByRole('button', { name: 'First flop card: Ten, suit unknown' })).toBeTruthy()
    expect(within(flop).getByRole('button', { name: 'Third flop card: Two, suit unknown' })).toBeTruthy()
  })

  it('keeps its controls in the tray above the tab bar', async () => {
    await startQuick()
    const tray = button('Next: cards').closest('.rc-tray')
    expect(tray).toBeTruthy()
    expect(within(tray as HTMLElement).getByRole('button', { name: /Back/ })).toBeTruthy()
  })

  it('picks up an unsaved draft after a reload', async () => {
    await startQuick()
    fireEvent.click(seat(5))
    cleanup()
    renderAt('/record')
    expect(await screen.findByText(/Picked up the hand you hadn/)).toBeTruthy()
    expect(screen.getAllByText('Hero BTN vs CO (Hoodie guy)').length).toBeGreaterThan(0)
    fireEvent.click(button('Start over'))
    expect(await screen.findByRole('heading', { name: 'Who was in the hand?' })).toBeTruthy()
  })
})

describe('unsaved hands kept in this browser', () => {
  const storedRaw = () => localStorage.getItem('handforge:reconstructDraft')
  const coStack = () => (screen.getByLabelText('CO starting stack') as HTMLInputElement).value

  async function correctCutoffTo520() {
    await heroVsCutoffWithCards()
    fireEvent.click(button('Review & save'))
    await screen.findByRole('heading', { name: 'Review and save' })
    expect(coStack()).toBe('640')
    fireEvent.change(screen.getByLabelText('CO starting stack'), { target: { value: '520' } })
  }

  it('restores a hand-only stack correction with the draft, and leaves the Table alone', async () => {
    await correctCutoffTo520()
    expect(JSON.parse(storedRaw()!).stacks).toEqual({ 5: 52_000 })
    cleanup()

    renderAt('/record')
    expect(await screen.findByText(/Picked up the hand you hadn/)).toBeTruthy()
    await screen.findByRole('heading', { name: 'Review and save' })
    expect(coStack()).toBe('520')

    // Saving keeps the correction on the hand; the Table still has $640.
    fireEvent.click(button('Save hand'))
    await waitFor(async () => expect(await savedHands()).toHaveLength(1))
    const [hand] = (await savedHands()) as [HandRecord]
    expect(hand.setup.seats.find((entry) => entry.seat === 5)!.startingStack).toBe(52_000)
    const [player] = await indexedDbRepositories.players.listAll()
    expect(player).toMatchObject({ seat: 5, currentStack: 64_000 })
    expect(storedRaw()).toBeNull()
  })

  it('throws the correction away with the draft on "Start over"', async () => {
    await correctCutoffTo520()
    cleanup()

    renderAt('/record')
    fireEvent.click(await screen.findByRole('button', { name: 'Start over' }))
    expect(storedRaw()).toBeNull()
    await screen.findByRole('heading', { name: 'Who was in the hand?' })
    fireEvent.click(seat(5))
    fireEvent.click(button('Review & save'))
    await screen.findByRole('heading', { name: 'Review and save' })
    expect(coStack()).toBe('640')
    expect(JSON.parse(storedRaw()!).stacks).toBeUndefined()
  })

  it('restores a draft with no corrections exactly as before', async () => {
    await heroVsCutoffWithCards()
    const stored = JSON.parse(storedRaw()!)
    expect(Object.keys(stored).sort()).toEqual(['draft', 'sessionId'])
    cleanup()

    renderAt('/record')
    expect(await screen.findByText(/Picked up the hand you hadn/)).toBeTruthy()
    expect(screen.getAllByText('Hero BTN vs CO (Hoodie guy)').length).toBeGreaterThan(0)
    expect(coStack()).toBe('640')
  })

  it('ignores a stored correction for a seat that is not dealt in', async () => {
    await heroVsCutoffWithCards()
    const stored = JSON.parse(storedRaw()!)
    localStorage.setItem('handforge:reconstructDraft', JSON.stringify({ ...stored, stacks: { 4: 52_000 } }))
    cleanup()

    renderAt('/record')
    expect(await screen.findByRole('heading', { name: 'Who was in the hand?' })).toBeTruthy()
    expect(screen.queryByText(/Picked up the hand you hadn/)).toBeNull()
  })
})

describe('player identity in Record', () => {
  it('names the players from the table while recording', async () => {
    await heroVsCutoffWithCards()
    const acting = screen.getByRole('group', { name: 'Player acting' })
    expect(within(acting).getByRole('button', { name: /^CO · Hoodie guy/ })).toBeTruthy()
  })

  it('keeps the names a saved hand was recorded with, after a rename and after the player leaves', async () => {
    await heroVsCutoffWithCards()
    fireEvent.click(button('CO raises, Hero calls'))
    fireEvent.click(button('Review & save'))
    fireEvent.click(await screen.findByRole('button', { name: 'Save hand' }))
    await screen.findByRole('button', { name: 'Edit hand' })
    const [hand] = (await savedHands()) as [HandRecord]
    cleanup()

    // Later: Hoodie guy turns out to be Mike, then leaves; someone new sits in seat 5.
    const [hoodie] = await indexedDbRepositories.players.listAll()
    await indexedDbRepositories.players.save({ ...hoodie!, nickname: 'Mike', seat: null, leftAt: new Date().toISOString() })
    const newcomer = { ...createPlayer(hand.sessionId, 5), nickname: 'Quiet Woman' }
    await indexedDbRepositories.players.save(newcomer)

    renderAt(`/hands/${hand.id}`)
    expect(await screen.findByText('Hero BTN vs CO (Hoodie guy)')).toBeTruthy()
    expect(screen.queryByText(/Mike|Quiet Woman/)).toBeNull()
    const stored = (await indexedDbRepositories.hands.get(hand.id))!
    expect(stored.setup.seats.find((entry) => entry.seat === 5)).toMatchObject({ label: 'Hoodie guy', playerId: hoodie!.id })
    cleanup()

    // The next hand deals the new occupant.
    renderAt('/record?mode=quick')
    await screen.findByRole('heading', { name: 'Who was in the hand?' })
    expect(seat(5).getAttribute('aria-label')).toBe('Seat 5, Cutoff, Quiet Woman')
  })
})

describe('Live Track', () => {
  it('deals from the table and lets the engine move the action', async () => {
    renderAt('/record?mode=live')
    fireEvent.click(await screen.findByRole('button', { name: 'Deal hand #1' }))
    expect(await screen.findByText('Your hole cards')).toBeTruthy()

    await waitFor(async () => expect(await savedHands()).toHaveLength(1))
    const [created] = (await savedHands()) as [HandRecord]
    // The empty chair is not dealt in; the lineup's name and stack are.
    expect(created.setup.seats.map((entry) => entry.seat)).toEqual([1, 2, 3, 5, 6])
    expect(created.setup.seats.find((entry) => entry.seat === 5)).toMatchObject({ label: 'Hoodie guy', startingStack: 64_000 })
    expect(created.setup).toMatchObject({ heroSeat: 6, buttonSeat: 6, smallBlind: 200, bigBlind: 500 })

    fireEvent.click(button('Skip cards'))
    const action = await screen.findByRole('region', { name: 'Action' })
    expect(within(action).getByRole('heading').textContent).toMatch(/^UTG/)

    // UTG folds; the cutoff is next, then Hero on the button.
    fireEvent.click(within(action).getByRole('button', { name: /^Fold$/ }))
    await waitFor(() =>
      expect(within(screen.getByRole('region', { name: 'Action' })).getByRole('heading').textContent).toMatch(/^CO · Hoodie guy/),
    )
    await waitFor(async () => {
      const [hand] = (await savedHands()) as [HandRecord]
      expect(hand.events).toMatchObject([{ kind: 'action', seat: 3, action: 'fold' }])
    })
  })

  it('folds to Hero in one tap', async () => {
    renderAt('/record?mode=live')
    fireEvent.click(await screen.findByRole('button', { name: 'Deal hand #1' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Skip cards' }))
    fireEvent.click(await screen.findByRole('button', { name: /Fold to Hero/ }))
    await waitFor(async () => {
      const [hand] = (await savedHands()) as [HandRecord]
      // Seats 3 (UTG) and 5 (CO) fold; the action is on Hero.
      expect(hand.events.map((event) => (event.kind === 'action' ? [event.seat, event.action] : null))).toEqual([
        [3, 'fold'],
        [5, 'fold'],
      ])
    })
    expect(within(screen.getByRole('region', { name: 'Action' })).getByRole('heading').textContent).toMatch(/^Hero/)
    expect(screen.getByText(/2 players fold|Hero to act/)).toBeTruthy()
  })

  it('describes the table in words', async () => {
    renderAt('/record?mode=live')
    fireEvent.click(await screen.findByRole('button', { name: 'Deal hand #1' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Skip cards' }))
    const table = await screen.findByRole('img', { name: 'The table' })
    const description = document.getElementById(table.getAttribute('aria-describedby')!)!
    expect(description.textContent).toBe('5 of 5 players still in. Under the gun to act. Pot $7.')
  })
})

describe('saved hands', () => {
  async function sessionId() {
    return (await indexedDbRepositories.sessions.list())[0]!.id
  }

  it('opens a hand recorded before this change exactly as before', async () => {
    const session = (await indexedDbRepositories.sessions.list())[0]!
    // A complete live hand in the original shape: setup plus event log, no reconstruction.
    const setup = createHandSetup({ session, buttonSeat: 6, heroSeat: 6, seats: defaultSeats(6, 100_000).filter((entry) => entry.seat !== 4) })
    setup.heroCards = ['As', 'Kd']
    const record = createHandRecord(session, setup, 1)
    record.events = [
      { id: 'e1', kind: 'action', street: 'preflop', seat: 3, action: 'fold', to: 0 },
      { id: 'e2', kind: 'action', street: 'preflop', seat: 5, action: 'fold', to: 0 },
      { id: 'e3', kind: 'action', street: 'preflop', seat: 6, action: 'raise', to: 1_500 },
      { id: 'e4', kind: 'action', street: 'preflop', seat: 1, action: 'fold', to: 200 },
      { id: 'e5', kind: 'action', street: 'preflop', seat: 2, action: 'fold', to: 500 },
    ]
    await indexedDbRepositories.hands.save(record)

    renderAt(`/hands/${record.id}`)
    expect(await screen.findByText(/Live Track · \$2\/\$5 · BTN/)).toBeTruthy()
    expect(screen.getByText(/Everyone else folded\. Hero wins/)).toBeTruthy()
    // Blinds $2 + $5 won, Hero's unmatched $10 returned.
    expect(screen.getByText(/^\+\$7/)).toBeTruthy()
    cleanup()

    renderAt('/hands')
    // The heading renders before the hands load; wait for the list.
    expect(await screen.findByText('+$7', { selector: '.chip' })).toBeTruthy()
    expect(screen.queryByText('Reconstructed')).toBeNull()
  })

  it('edits a reconstructed hand and lists it honestly', async () => {
    await heroVsCutoffWithCards()
    fireEvent.click(button('CO raises, Hero calls'))
    fireEvent.click(button('Review & save'))
    fireEvent.click(await screen.findByRole('button', { name: 'Save hand' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Edit hand' }))

    fireEvent.click(await screen.findByRole('button', { name: 'Showdown' }))
    const winner = screen.getByRole('group', { name: 'Who won?' })
    fireEvent.click(within(winner).getByRole('button', { name: 'Hero' }))
    fireEvent.click(button('Review'))
    fireEvent.click(await screen.findByRole('button', { name: 'Save changes' }))

    await waitFor(async () => {
      const [hand] = (await savedHands()) as [HandRecord]
      expect(hand.reconstruction!.winners).toEqual([6])
      expect(hand.sessionId).toBe(await sessionId())
    })
    expect(await screen.findByRole('button', { name: 'Edit hand' })).toBeTruthy()
    cleanup()

    // No amounts, so no dollar figure: the list says who won instead of inventing one.
    renderAt('/hands')
    expect(await screen.findByText('Reconstructed', { selector: '.chip' })).toBeTruthy()
    expect(screen.getByText('Hero won')).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Ace of spades' })).toBeTruthy()
  })
})
