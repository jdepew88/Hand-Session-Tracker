// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../App'
import { createPlayer, createSession } from '../domain/poker/factories'
import type { HandRecord, Session } from '../domain/poker/models'
import { emptyInterpretation } from '../domain/poker/narration/schema'
import type { HandNarrationParser } from '../domain/poker/narration/parser'
import type * as NarrationParserModule from '../services/narrationParser'
import { SERVICE_NOTICE } from '../services/narrationParser'
import { STORES, idb, resetDatabaseConnection } from '../storage/db'
import { indexedDbRepositories } from '../storage/repositories'
import { StoreProvider } from '../store/StoreProvider'

/**
 * Describing a hand in words, against the real store and storage.
 *
 * The table: six chairs, seat 4 empty, Hero on the button in seat 6. With
 * five players dealt in, seat 1 is the small blind, 2 the big blind, 3 UTG
 * and 5 the cutoff ("Hoodie guy").
 *
 * By default the build's own parser is used (the on-device practice parser:
 * no network). Individual tests swap in a failing or remote parser.
 */

const swap = vi.hoisted(() => ({ parser: null as HandNarrationParser | null }))

vi.mock('../services/narrationParser', async (importOriginal) => {
  const actual = await importOriginal<typeof NarrationParserModule>()
  return { ...actual, activeNarrationParser: () => swap.parser ?? actual.activeNarrationParser() }
})

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
  const session: Session = createSession({
    location: 'Commerce Casino',
    gameType: "No-Limit Hold'em",
    smallBlind: 200,
    bigBlind: 500,
    tableSize: 6,
    buyIn: 100_000,
    startingStack: 100_000,
    heroSeat: 6,
    buttonSeat: 6,
  })
  session.seatStatus = { ...session.seatStatus, 4: 'empty' }
  await indexedDbRepositories.sessions.save(session)
  await indexedDbRepositories.players.saveMany([
    { ...createPlayer(session.id, 5), nickname: 'Hoodie guy', notes: 'PRIVATE: never send this', currentStack: 64_000 },
  ])
  return session
}

const savedHands = () => indexedDbRepositories.hands.listAll()
const button = (name: string | RegExp) => screen.getByRole('button', { name })
const description = () => screen.getByLabelText('Hand description') as HTMLTextAreaElement

async function openTextMode() {
  renderAt('/record')
  await screen.findByRole('heading', { name: 'Who was in the hand?' })
  fireEvent.click(button('Paste / type'))
  expect(button('Paste / type').getAttribute('aria-pressed')).toBe('true')
  await screen.findByRole('heading', { name: 'Tell me the hand however you remember it.' })
}

function describeHand(text: string) {
  fireEvent.change(description(), { target: { value: text } })
  fireEvent.click(screen.getAllByRole('button', { name: 'Build draft' })[0]!)
}

beforeEach(async () => {
  resetDatabaseConnection()
  for (const store of Object.values(STORES)) await idb.clear(store)
  localStorage.clear()
  swap.parser = null
  await seed()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('describing a hand in words', () => {
  it('builds a draft for review, and saves only after the player confirms and saves', async () => {
    await openTextMode()
    expect(screen.getByText(/Practice parser: reads common shorthand on this device\. Nothing is sent anywhere\./)).toBeTruthy()
    describeHand(
      "I'm on the button with ace king suited. Hoodie guy opens to 20, I make it 65, he calls. Flop ten eight two two clubs. He checks, I bet 50, he folds.",
    )

    await screen.findByRole('heading', { name: 'Check the draft' })
    // Interpretation states are words, for the eye and the ear.
    expect(screen.getByRole('heading', { name: /Interpreted/ })).toBeTruthy()
    expect(screen.getByRole('heading', { name: /Confirmed/ })).toBeTruthy()
    expect(screen.getByText('Interpreted: Cutoff, Hoodie guy, raises to $20.')).toBeTruthy()
    expect(screen.getByText("Confirmed: Hero's cards: Ace King suited, exact suits unknown.")).toBeTruthy()
    expect(await savedHands()).toHaveLength(0)

    fireEvent.click(button('Confirm draft'))
    expect(await screen.findByRole('heading', { name: 'Review and save' })).toBeTruthy()
    expect(screen.getByText('Built from your description. Check it, then save.')).toBeTruthy()
    // Still nothing saved: the recorder's own Save does that.
    expect(await savedHands()).toHaveLength(0)

    fireEvent.click(button('Save hand'))
    await waitFor(async () => expect(await savedHands()).toHaveLength(1))
    const [hand] = (await savedHands()) as [HandRecord]
    expect(hand.reconstruction!.participants).toEqual([5, 6])
    expect(hand.reconstruction!.hero).toMatchObject({ suited: true, cards: [{ rank: 'A', suit: null }, { rank: 'K', suit: null }] })
    expect(hand.reconstruction!.streets[0]!.actions.map((action) => [action.seat, action.action, action.amount])).toEqual([
      [5, 'raise', 2000],
      [6, 'raise', 6500],
      [5, 'call', null],
    ])
  })

  it('asks what it cannot know, answers locally, and keeps the hand’s own button', async () => {
    await openTextMode()
    describeHand('Folds to me in the cutoff. I raise to 15, he calls.')
    await screen.findByRole('heading', { name: 'Check the draft' })

    // "In the cutoff" puts this hand's button on seat 1; the Table has it on seat 6.
    expect(screen.getByText('Button for this hand: Seat 1.', { exact: false })).toBeTruthy()
    const question = screen.getByRole('group', { name: /Who is “he”\?/ })
    expect(screen.queryByRole('button', { name: 'Confirm draft' })).toBeNull()
    expect(screen.getByText('One question needs an answer before confirming.')).toBeTruthy()

    fireEvent.click(within(question).getByRole('button', { name: 'Seat 3 · BB' }))
    expect(within(question).getByRole('button', { name: /Seat 3 · BB/ }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(button('Confirm draft'))
    await screen.findByRole('heading', { name: 'Review and save' })

    // A reload keeps the confirmed draft and this hand's own button.
    cleanup()
    renderAt('/record')
    await screen.findByRole('heading', { name: 'Review and save' })
    expect(screen.getByText('Picked up the hand you hadn’t saved.')).toBeTruthy()
    fireEvent.click(button('Save hand'))
    await waitFor(async () => expect(await savedHands()).toHaveLength(1))
    const [hand] = (await savedHands()) as [HandRecord]
    expect(hand.setup.buttonSeat).toBe(1)
    expect(hand.reconstruction!.participants).toEqual([3, 6])
    const [session] = (await indexedDbRepositories.sessions.list()) as [Session]
    expect(session.buttonSeat).toBe(6)
  })

  it('keeps remembered words as the hand’s notes', async () => {
    await openTextMode()
    describeHand('I raise to 15 on the button, Hoodie guy calls. Flop queen jack five. Checks through. Turn was a brick. He bets two thirds pot, I call.')
    await screen.findByRole('heading', { name: 'Check the draft' })
    const notes = screen.getByRole('heading', { name: 'Kept as notes with the hand' }).parentElement!
    expect(within(notes).getByText('Turn: brick')).toBeTruthy()
    fireEvent.click(button('Confirm draft'))
    fireEvent.click(await screen.findByRole('button', { name: 'Save hand' }))
    await waitFor(async () => expect(await savedHands()).toHaveLength(1))
    const [hand] = (await savedHands()) as [HandRecord]
    expect(hand.notes).toContain('Turn: brick')
    expect(hand.notes).toContain('Turn: CO (Hoodie guy) bets 2/3 pot')
    expect(hand.reconstruction!.streets[2]!.actions[0]!.amount).toBeNull()
  })

  it('keeps the description across a reload', async () => {
    await openTextMode()
    fireEvent.change(description(), { target: { value: 'Hoodie guy limps, I check my option' } })
    cleanup()
    renderAt('/record')
    await screen.findByRole('heading', { name: 'Tell me the hand however you remember it.' })
    expect(description().value).toBe('Hoodie guy limps, I check my option')
  })

  it('keeps the description through a failure, with Retry and Continue manually', async () => {
    const parse = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    swap.parser = { kind: 'service', description: SERVICE_NOTICE, parse }
    await openTextMode()
    expect(screen.getByText(SERVICE_NOTICE)).toBeTruthy()
    describeHand('I raise to 15, big blind calls.')

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('Couldn’t build the draft right now.')).toBeTruthy()
    expect(description().value).toBe('I raise to 15, big blind calls.')
    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(parse).toHaveBeenCalledTimes(2))

    fireEvent.click(within(await screen.findByRole('alert')).getByRole('button', { name: 'Continue manually' }))
    expect(await screen.findByRole('heading', { name: 'Who was in the hand?' })).toBeTruthy()
    fireEvent.click(button('Paste / type'))
    expect(description().value).toBe('I raise to 15, big blind calls.')
  })

  it('does not call the service when offline, and says so', async () => {
    const parse = vi.fn(async () => emptyInterpretation())
    swap.parser = { kind: 'service', description: SERVICE_NOTICE, parse }
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    await openTextMode()
    describeHand('I raise to 15, big blind calls.')
    expect(await screen.findByText(/You appear to be offline\./)).toBeTruthy()
    expect(parse).not.toHaveBeenCalled()
  })

  it('sends the service only the description and minimum context, never notes', async () => {
    const parse = vi.fn(async () => emptyInterpretation())
    swap.parser = { kind: 'service', description: SERVICE_NOTICE, parse }
    await openTextMode()
    describeHand('Hoodie guy calls.')
    await screen.findByRole('heading', { name: 'Check the draft' })
    const [request] = parse.mock.calls[0] as unknown as [{ text: string; context: unknown }]
    expect(request.text).toBe('Hoodie guy calls.')
    expect(JSON.stringify(request)).toContain('Hoodie guy')
    expect(JSON.stringify(request)).not.toContain('PRIVATE')
  })

  it('shows anything the parser returns as plain text, never markup', async () => {
    swap.parser = {
      kind: 'service',
      description: SERVICE_NOTICE,
      parse: async () => ({ ...emptyInterpretation(), unplaced: ['<img src=x onerror=alert(1)>'] }),
    }
    await openTextMode()
    describeHand('Something odd.')
    await screen.findByRole('heading', { name: 'Check the draft' })
    expect(screen.getAllByText('“<img src=x onerror=alert(1)>”').length).toBeGreaterThan(0)
    expect(document.querySelector('main img[src="x"]')).toBeNull()
  })
})
