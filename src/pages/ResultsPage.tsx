import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Page } from '../components/Page'
import { BankrollActivity } from '../components/results/BankrollActivity'
import { BankrollHero } from '../components/results/BankrollHero'
import { BreakdownPanel } from '../components/results/BreakdownPanel'
import { ExpenseBreakdown } from '../components/results/ExpenseBreakdown'
import { ExpenseForm, type SessionChoice } from '../components/results/ExpenseForm'
import { PerformanceSnapshot } from '../components/results/PerformanceSnapshot'
import { ResultsFilters } from '../components/results/ResultsFilters'
import { ResultsSessionList } from '../components/results/ResultsSessionList'
import { shortDate, stakesChip } from '../components/results/resultsText'
import { Sheet } from '../components/results/Sheet'
import { TransactionForm } from '../components/results/TransactionForm'
import { TrueNetEquation } from '../components/results/TrueNetEquation'
import { TableGlyph } from '../components/sessions/TableGlyph'
import { stakesLabel } from '../domain/poker/factories'
import { ALL_RESULTS, filterOptions, isFiltered, type ResultsFilter } from '../domain/results/filters'
import type { BankrollTransactionKind, ResultsData } from '../domain/results/models'
import { bankrollOverview, performanceOverview } from '../domain/results/overview'
import { settledRows } from '../domain/results/stats'
import { useNow } from '../hooks/useNow'
import { useStore } from '../store/context'
import { useResultsStore, type ResultsBook } from '../store/resultsContext'

/**
 * Results: the 401G bankroll, performance, the true cost of poker, and the
 * breakdowns behind them.
 *
 * Sessions are the player's real sessions. Expenses and bankroll entries are
 * a frontend preview (held in memory); `?demo=1` swaps in a complete made-up
 * record so the screen can be seen full.
 */
export function ResultsPage() {
  const [params] = useSearchParams()
  const book: ResultsBook = params.get('demo') === '1' ? 'demo' : 'yours'
  const { sessions, ready } = useStore()
  const results = useResultsStore()

  const data = useMemo<ResultsData>(
    () => (book === 'demo' ? results.demo : { sessions, ...results.yours }),
    [book, results.demo, results.yours, sessions],
  )
  const empty =
    book === 'yours' &&
    settledRows(sessions).length === 0 &&
    results.yours.expenses.length === 0 &&
    results.yours.transactions.length === 0

  return (
    <Page title="Results" subtitle="Profit, hours and the true cost of poker." wide>
      <div className="space-y-5 pb-10 lg:space-y-6">
        <DataSwitch book={book} />
        {!ready || !results.ready ? (
          <p className="text-sm text-room-400">Loading…</p>
        ) : empty ? (
          <EmptyResults hasLive={sessions.some((session) => session.endedAt === null)} />
        ) : (
          // Keyed by book: switching to the demo starts its filters fresh.
          <ResultsDashboard key={book} book={book} data={data} />
        )}
      </div>
    </Page>
  )
}

function DataSwitch({ book }: { book: ResultsBook }) {
  const item = (active: boolean) =>
    `flex min-h-10 items-center justify-center rounded-lg px-3 text-sm ${
      active ? 'bg-room-700 font-semibold text-bone-50' : 'text-room-300 hover:text-room-50'
    }`
  return (
    <div className="space-y-3">
      <nav aria-label="Results data" className="inline-grid grid-cols-2 gap-1 rounded-xl border border-room-700 bg-room-900 p-1">
        <Link to="/results" aria-current={book === 'yours' ? 'page' : undefined} className={item(book === 'yours')}>
          Your results
        </Link>
        <Link to="/results?demo=1" aria-current={book === 'demo' ? 'page' : undefined} className={item(book === 'demo')}>
          Demo data
        </Link>
      </nav>
      {book === 'demo' && (
        <p role="note" className="rounded-xl border border-chip-amber/35 bg-chip-amber/10 px-3.5 py-2.5 text-sm text-bone-50">
          <span className="font-semibold">Demo data.</span> These sessions, expenses and bankroll entries are made up to
          show what Results does. None of it is yours.
        </p>
      )}
    </div>
  )
}

function EmptyResults({ hasLive }: { hasLive: boolean }) {
  return (
    <section aria-labelledby="results-empty" className="rs-hero flex flex-col items-center px-5 py-12 text-center">
      <span className="rs-badge text-sm">401G</span>
      <TableGlyph seats={9} className="mt-5 h-12 w-16" />
      <h2 id="results-empty" className="mt-4 text-xl font-semibold tracking-tight">
        Build your poker record.
      </h2>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-room-300">
        Complete sessions to start seeing your bankroll, hourly rate and results over time.
        {hasLive && ' Your live session counts once you cash out.'}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link to={hasLive ? '/sessions' : '/sessions/new'} className="btn-primary h-12 px-6">
          {hasLive ? 'Go to your session' : 'Start a session'}
        </Link>
        <Link to="/results?demo=1" className="btn-secondary h-12 px-5">
          Preview with demo data
        </Link>
      </div>
    </section>
  )
}

type SheetState = { kind: 'expense' } | { kind: 'transaction'; direction: BankrollTransactionKind } | null

function ResultsDashboard({ book, data }: { book: ResultsBook; data: ResultsData }) {
  const { setActiveSessionId } = useStore()
  const results = useResultsStore()
  const now = useNow(false)
  const [filter, setFilter] = useState<ResultsFilter>(ALL_RESULTS)
  const [sheet, setSheet] = useState<SheetState>(null)

  const bankroll = useMemo(() => bankrollOverview(data, now), [data, now])
  const performance = useMemo(() => performanceOverview(data, filter, now), [data, filter, now])
  const options = useMemo(() => filterOptions(data), [data])
  const totalSessions = useMemo(() => settledRows(data.sessions).length, [data])
  const sessionsById = useMemo(() => new Map(data.sessions.map((session) => [session.id, session])), [data])

  const sessionChoices = useMemo<SessionChoice[]>(
    () =>
      [...data.sessions]
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
        .slice(0, 40)
        .map((session) => ({
          id: session.id,
          label: `${shortDate(session.startedAt, now)} · ${session.location.trim() || 'Unnamed room'} · ${stakesLabel(session)}`,
          location: session.location.trim(),
          startedAt: session.startedAt,
        })),
    [data, now],
  )

  const sessionLabel = (id: string) => {
    const session = sessionsById.get(id)
    return session ? `${session.location.trim() || 'Unnamed room'}, ${shortDate(session.startedAt, now)}` : null
  }

  const nothingMatches = performance.rows.length === 0 && performance.expenses.length === 0
  const summary = isFiltered(filter)
    ? `Showing ${performance.rows.length} of ${totalSessions} sessions`
    : `${totalSessions} session${totalSessions === 1 ? '' : 's'}, all time`

  return (
    <>
      <BankrollHero
        bankroll={bankroll}
        now={now}
        onAddFunds={() => setSheet({ kind: 'transaction', direction: 'deposit' })}
        onWithdraw={() => setSheet({ kind: 'transaction', direction: 'withdrawal' })}
      />

      <ResultsFilters filter={filter} onChange={setFilter} options={options} summary={summary} />

      {nothingMatches ? (
        <section className="rs-panel px-5 py-10 text-center">
          <h2 className="font-semibold">Nothing matches these filters.</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-room-400">
            {isFiltered(filter)
              ? 'Try a wider date range, or another casino, game or stakes.'
              : 'Cashed-out sessions and expenses will show here.'}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {isFiltered(filter) && (
              <button type="button" onClick={() => setFilter(ALL_RESULTS)} className="btn-secondary">
                Clear filters
              </button>
            )}
            <button type="button" onClick={() => setSheet({ kind: 'expense' })} className="btn-ghost">
              Add expense
            </button>
          </div>
        </section>
      ) : (
        <PerformanceSnapshot stats={performance.stats} net={performance.net} />
      )}

      {/*
        Phone order: true net, expenses, breakdowns, sessions, bankroll activity.
        Desktop: true net with bankroll activity beneath it on the left, the
        (taller) expenses on the right, then breakdowns and sessions full width.
        The 1fr second row lets the expenses span it without stretching row one.
      */}
      <div className="grid items-start gap-5 lg:grid-cols-2 lg:grid-rows-[auto_1fr] lg:gap-6 [&>*]:min-w-0">
        {!nothingMatches && (
          <>
            <div className="lg:col-start-1 lg:row-start-1">
              <TrueNetEquation net={performance.net} />
            </div>
            <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
              <ExpenseBreakdown
                categories={performance.categories}
                expenses={performance.expenses}
                net={performance.net}
                now={now}
                sessionLabel={sessionLabel}
                onAdd={() => setSheet({ kind: 'expense' })}
                onRemove={(expense) => void results.removeExpense(book, expense.id)}
              />
            </div>
            <div className="grid items-start gap-5 md:grid-cols-2 lg:col-span-2 lg:row-start-3 lg:gap-6 xl:grid-cols-3 [&>*]:min-w-0">
              <BreakdownPanel title="By casino" groups={performance.byLocation} />
              <BreakdownPanel
                title="By stakes"
                groups={performance.byStakes}
                marker={(group) => (
                  <span aria-hidden="true" className={`rs-chip rs-chip--${stakesChip(Number(group.key.split('/')[1]))}`} />
                )}
              />
              <BreakdownPanel title="By game" groups={performance.byGame} />
            </div>
          </>
        )}
        {performance.rows.length > 0 && (
          <div className="lg:col-span-2 lg:row-start-4">
            <ResultsSessionList
              rows={performance.rows}
              sessionExpenses={performance.sessionExpenses}
              now={now}
              linkable={book === 'yours'}
              onOpen={setActiveSessionId}
            />
          </div>
        )}
        <div className={nothingMatches ? 'lg:col-span-2' : 'lg:col-start-1 lg:row-start-2'}>
          <BankrollActivity
            transactions={data.transactions}
            now={now}
            onRemove={(transaction) => void results.removeTransaction(book, transaction.id)}
          />
        </div>
      </div>

      <p className="text-xs leading-relaxed text-room-400">
        {book === 'demo'
          ? 'Demo data lives only in this preview and resets when the page reloads.'
          : 'Poker results come from your sessions on this device. Expenses and bankroll entries are a preview: they are kept until you reload the page.'}{' '}
        SessionTracker keeps records; it does not hold money or give financial advice.
      </p>

      <Sheet open={sheet?.kind === 'expense'} title="Add expense" onClose={() => setSheet(null)}>
        <ExpenseForm
          sessions={sessionChoices}
          persistent={book === 'yours' && results.persistent}
          now={now}
          onCancel={() => setSheet(null)}
          onSave={(expense) => {
            void results.saveExpense(book, expense)
            setSheet(null)
          }}
        />
      </Sheet>
      <Sheet
        open={sheet?.kind === 'transaction'}
        title="401G bankroll"
        onClose={() => setSheet(null)}
      >
        {sheet?.kind === 'transaction' && (
          <TransactionForm
            initialKind={sheet.direction}
            persistent={book === 'yours' && results.persistent}
            now={now}
            onCancel={() => setSheet(null)}
            onSave={(transaction) => {
              void results.saveTransaction(book, transaction)
              setSheet(null)
            }}
          />
        )}
      </Sheet>
    </>
  )
}
