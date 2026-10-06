// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { App } from '../App'
import { createSession, newId } from '../domain/poker/factories'
import type { Session } from '../domain/poker/models'
import { STORES, idb, resetDatabaseConnection } from '../storage/db'
import { indexedDbRepositories } from '../storage/repositories'
import { StoreProvider } from '../store/StoreProvider'

/**
 * Results against real session storage. Poker figures are checked against the
 * cash-out minus buy-ins of the seeded sessions; expenses and bankroll entries
 * go through the forms, so the separation between them is tested end to end.
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

async function seed(daysAgo: number, cashOut: number | null, extra: Partial<Session> = {}) {
  const start = Date.now() - daysAgo * 24 * HOUR
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
    startedAt: new Date(start).toISOString(),
    endedAt: cashOut === null ? null : new Date(start + 4 * HOUR).toISOString(),
    cashOut,
    ...extra,
  }
  await indexedDbRepositories.sessions.save(session)
  return session
}

const region = (name: string | RegExp) => screen.getByRole('region', { name })

/** A lead figure's plate, found by its label: "Poker profit", "Hourly", "True net". */
const lead = (within_: HTMLElement, label: string) => within(within_).getByText(label).parentElement!.textContent

/** The 401G balance figure. */
const balance = (hero: HTMLElement) => hero.querySelector('.rs-emboss')!.textContent

beforeEach(async () => {
  resetDatabaseConnection()
  for (const store of Object.values(STORES)) await idb.clear(store)
})

afterEach(cleanup)

describe('results navigation', () => {
  it('is a main tab, reached from anywhere in the app', async () => {
    renderApp('/sessions')
    const nav = await screen.findByRole('navigation', { name: 'Main' })
    const tab = within(nav).getByRole('link', { name: 'Results' })
    expect(tab.getAttribute('href')).toBe('/results')
    fireEvent.click(tab)
    expect(await screen.findByRole('heading', { level: 1, name: 'Results' })).toBeTruthy()
    expect(within(nav).getByRole('link', { name: 'Results' }).getAttribute('aria-current')).toBe('page')
  })

  it('keeps Settings reachable from the Sessions header when the tab bar is short', async () => {
    renderApp('/sessions')
    const header = (await screen.findByRole('heading', { level: 1, name: 'Sessions' })).closest('header')!
    expect(within(header).getByRole('link', { name: 'Settings' }).getAttribute('href')).toBe('/settings')
  })
})

describe('results with no record', () => {
  it('explains how to start instead of showing zeros', async () => {
    renderApp('/results')
    expect(await screen.findByRole('heading', { name: 'Build your poker record.' })).toBeTruthy()
    expect(screen.getByText(/Complete sessions to start seeing your bankroll, hourly rate and results over time/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Start a session' }).getAttribute('href')).toBe('/sessions/new')
    expect(screen.getByRole('link', { name: 'Preview with demo data' }).getAttribute('href')).toBe('/results?demo=1')
    expect(screen.queryByRole('region', { name: 'Performance' })).toBeNull()
  })

  it('does not count a live session until it is cashed out', async () => {
    await seed(0, null)
    renderApp('/results')
    expect(await screen.findByText(/Your live session counts once you cash out/)).toBeTruthy()
  })
})

describe('results from real sessions', () => {
  async function seedRecord() {
    const win = await seed(10, 86_000, { location: 'Bicycle Casino' })
    const loss = await seed(5, 28_000)
    const even = await seed(2, 50_000)
    return { win, loss, even }
  }

  it('derives profit, hourly and session counts from cash-out minus buy-ins', async () => {
    await seedRecord()
    renderApp('/results')
    const performance = await screen.findByRole('region', { name: 'Performance' })
    // +$360 - $220 + $0 over three 4-hour sessions.
    expect(lead(performance, 'Poker profit')).toContain('+$140')
    expect(lead(performance, 'Hourly')).toContain('+$11.67/hr')
    expect(within(performance).getByText('12h')).toBeTruthy()
    expect(within(performance).getByText('33%')).toBeTruthy()
    expect(within(performance).getByText('1 of 3')).toBeTruthy()
    expect(within(performance).getByText('+$360')).toBeTruthy()
    expect(within(performance).getByText('-$220')).toBeTruthy()
  })

  it('colours results only alongside a sign, and shows break-even plainly', async () => {
    await seedRecord()
    renderApp('/results')
    const sessions = await screen.findByRole('region', { name: 'Sessions in these results' })
    const figure = (text: string) => within(sessions).getByText(text)
    expect(figure('+$360').className).toContain('text-gain')
    expect(figure('-$220').className).toContain('text-loss')
    expect(figure('$0').className).not.toMatch(/text-(gain|loss)/)
    expect(within(sessions).getByRole('link', { name: /^Bicycle Casino, \$2\/\$5 No-Limit Hold'em, .*profit \$360/ })).toBeTruthy()
  })

  it('shows the no-expenses state, and true net equals profit until an expense exists', async () => {
    await seedRecord()
    renderApp('/results')
    const expenses = await screen.findByRole('region', { name: 'True cost of poker' })
    expect(within(expenses).getByText('No expenses recorded yet.')).toBeTruthy()
    expect(within(expenses).getByRole('button', { name: 'Add expense' })).toBeTruthy()
    const equation = region('Winnings vs. true net')
    expect(within(equation).getAllByText('+$140')).toHaveLength(2)
  })

  it('takes an added expense off true net, never off poker profit', async () => {
    await seedRecord()
    renderApp('/results')
    fireEvent.click(await screen.findByRole('button', { name: 'Add expense' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add expense' })
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Parking' }))
    expect((within(dialog).getByRole('radio', { name: /Playing cost/ }) as HTMLInputElement).checked).toBe(true)
    fireEvent.change(within(dialog).getByLabelText('Amount'), { target: { value: '18' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save expense' }))

    const expenses = region('True cost of poker')
    await waitFor(() => expect(within(expenses).getByText('Parking', { selector: 'span.truncate' })).toBeTruthy())
    expect(within(expenses).getAllByText('$18').length).toBeGreaterThan(0)
    expect(within(expenses).getByText('100%')).toBeTruthy()
    expect(lead(region('Performance'), 'Poker profit')).toContain('+$140')
    expect(lead(region('Performance'), 'True net')).toContain('+$122')
    expect(within(region('Winnings vs. true net')).getByText('+$122')).toBeTruthy()
  })

  it('refuses an expense with no amount', async () => {
    await seedRecord()
    renderApp('/results')
    fireEvent.click(await screen.findByRole('button', { name: 'Add expense' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add expense' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save expense' }))
    expect(within(dialog).getByRole('alert').textContent).toMatch(/Enter an amount/)
  })

  it('moves the bankroll with deposits and withdrawals, but not poker results', async () => {
    await seedRecord()
    renderApp('/results')
    const hero = await screen.findByRole('region', { name: 'Your poker bankroll' })
    expect(balance(hero)).toBe('$140')

    fireEvent.click(within(hero).getByRole('button', { name: 'Add funds' }))
    let dialog = await screen.findByRole('dialog', { name: '401G bankroll' })
    expect(within(dialog).getByText(/it is not a win/)).toBeTruthy()
    fireEvent.change(within(dialog).getByLabelText('Amount'), { target: { value: '2000' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add to bankroll' }))
    await waitFor(() => expect(balance(hero)).toBe('$2,140'))

    fireEvent.click(within(hero).getByRole('button', { name: 'Withdraw funds' }))
    dialog = await screen.findByRole('dialog', { name: '401G bankroll' })
    fireEvent.change(within(dialog).getByLabelText('Amount'), { target: { value: '500' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Withdraw from bankroll' }))
    await waitFor(() => expect(balance(hero)).toBe('$1,640'))

    const activity = region('Bankroll activity')
    expect(within(activity).getByText('Added $2,000 to poker bankroll')).toBeTruthy()
    expect(within(activity).getByText('Moved $500 to liferoll')).toBeTruthy()
    const performance = region('Performance')
    expect(lead(performance, 'Poker profit')).toContain('+$140')
    expect(lead(performance, 'True net')).toContain('+$140')
    expect(within(performance).getByText('33%')).toBeTruthy()
    expect(lead(performance, 'Hourly')).toContain('+$11.67/hr')
  })
})

describe('results demo data', () => {
  it('is labelled as made up and leaves the player’s own record alone', async () => {
    renderApp('/results?demo=1')
    expect(await screen.findByText(/None of it is yours/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Demo data' }).getAttribute('aria-current')).toBe('page')
    expect(await screen.findByRole('region', { name: 'Your poker bankroll' })).toBeTruthy()
    // Demo sessions are not links into the player's session pages.
    expect(within(region('Sessions in these results')).queryAllByRole('link')).toHaveLength(0)
  })

  it('describes the bankroll chart in words and lets the keyboard walk it', async () => {
    renderApp('/results?demo=1')
    const slider = await screen.findByRole('slider', { name: /Bankroll history/ })
    const summary = document.getElementById(slider.getAttribute('aria-describedby')!)!
    expect(summary.textContent).toMatch(/^Bankroll (rose|fell) from \$[\d,]+ on .+ to \$[\d,]+ on .+(peak)/)
    const last = slider.getAttribute('aria-valuenow')
    fireEvent.keyDown(slider, { key: 'ArrowLeft' })
    expect(slider.getAttribute('aria-valuenow')).toBe(String(Number(last) - 1))
    expect(slider.getAttribute('aria-valuetext')).toMatch(/bankroll \$[\d,]+/)
    fireEvent.keyDown(slider, { key: 'Home' })
    expect(slider.getAttribute('aria-valuenow')).toBe('1')
  })

  it('filters the figures by stakes and by date, and clears back', async () => {
    renderApp('/results?demo=1')
    const filters = await screen.findByRole('region', { name: 'Filter results' })
    const all = within(filters).getByText(/sessions, all time/).textContent!
    const total = Number(all.split(' ')[0])

    fireEvent.change(within(filters).getByLabelText('Stakes'), { target: { value: '100/200' } })
    expect(within(filters).getByText(new RegExp(`^Showing \\d+ of ${total} sessions$`))).toBeTruthy()
    const games = region('By game')
    expect(within(games).getByText('Pot-Limit Omaha')).toBeTruthy()
    expect(within(games).queryByText("No-Limit Hold'em")).toBeNull()

    fireEvent.click(within(filters).getByRole('button', { name: 'Clear filters' }))
    expect(within(filters).getByText(all)).toBeTruthy()

    fireEvent.change(within(filters).getByLabelText('Dates'), { target: { value: '30d' } })
    const shown = within(filters).getByText(/^Showing \d+ of/).textContent!
    expect(Number(shown.split(' ')[1])).toBeLessThan(total)
  })

  it('keeps games to the ones SessionTracker supports', async () => {
    renderApp('/results?demo=1')
    const filters = await screen.findByRole('region', { name: 'Filter results' })
    const options = within(within(filters).getByLabelText('Game')).getAllByRole('option').map((option) => option.textContent)
    expect(options).toEqual(['All games', "No-Limit Hold'em", 'Pot-Limit Omaha'])
  })
})

it('offers sessions to tie an expense to', async () => {
  const session = await seed(1, 70_000, { id: newId(), startedAt: ago(30 * HOUR) })
  renderApp('/results')
  fireEvent.click(await screen.findByRole('button', { name: 'Add expense' }))
  const dialog = await screen.findByRole('dialog', { name: 'Add expense' })
  const select = within(dialog).getByLabelText(/Session/) as HTMLSelectElement
  expect([...select.options].map((option) => option.value)).toContain(session.id)
})
