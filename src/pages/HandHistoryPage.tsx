import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState, Page } from '../components/Page'
import { CardRow } from '../components/PlayingCard'
import { formatCents } from '../domain/money'
import { exactHoleCards } from '../domain/poker/draft/memory'
import { boardText, holeCardsText } from '../domain/poker/draft/text'
import { deriveHand, heroOutcome, heroResultOf } from '../domain/poker/lifecycle'
import { HAND_TAGS, type HandRecord } from '../domain/poker/models'
import { useStore } from '../store/context'
import { formatDateTime } from '../utils/labels'

type ResultFilter = 'any' | 'won' | 'lost'

export function HandHistoryPage() {
  const { hands, sessions, ready } = useStore()

  const [sessionId, setSessionId] = useState('')
  const [location, setLocation] = useState('')
  const [stakes, setStakes] = useState('')
  const [position, setPosition] = useState('')
  const [tag, setTag] = useState('')
  const [result, setResult] = useState<ResultFilter>('any')
  const [favouritesOnly, setFavouritesOnly] = useState(false)
  const [query, setQuery] = useState('')

  const options = useMemo(() => {
    const locations = new Set<string>()
    const stakesSet = new Set<string>()
    const positions = new Set<string>()
    const tags = new Set<string>(HAND_TAGS)
    for (const hand of hands) {
      if (hand.context.location) locations.add(hand.context.location)
      if (hand.context.stakesLabel) stakesSet.add(hand.context.stakesLabel)
      if (hand.context.heroPosition) positions.add(hand.context.heroPosition)
      for (const entry of hand.tags) tags.add(entry)
    }
    return {
      locations: [...locations].sort(),
      stakes: [...stakesSet].sort(),
      positions: [...positions].sort(),
      tags: [...tags].sort(),
    }
  }, [hands])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return hands.filter((hand) => {
      if (sessionId && hand.sessionId !== sessionId) return false
      if (location && hand.context.location !== location) return false
      if (stakes && hand.context.stakesLabel !== stakes) return false
      if (position && hand.context.heroPosition !== position) return false
      if (tag && !hand.tags.includes(tag)) return false
      if (favouritesOnly && !hand.favorite) return false
      if (result !== 'any') {
        // Without amounts, a reconstructed hand still knows who won.
        const net = heroResultOf(hand)
        const outcome = heroOutcome(hand)
        const won = net !== null ? net > 0 : outcome === 'won'
        const lost = net !== null ? net < 0 : outcome === 'lost'
        if (result === 'won' && !won) return false
        if (result === 'lost' && !lost) return false
      }
      if (needle) {
        const haystack = `${hand.notes} ${hand.tags.join(' ')} ${hand.context.location}`.toLowerCase()
        if (!haystack.includes(needle)) return false
      }
      return true
    })
  }, [hands, sessionId, location, stakes, position, tag, favouritesOnly, result, query])

  const net = filtered.reduce((sum, hand) => sum + (heroResultOf(hand) ?? 0), 0)
  const withoutFigure = filtered.filter((hand) => heroResultOf(hand) === null && !deriveHand(hand).inProgress).length

  return (
    <Page
      title="Hand history"
      subtitle={
        <>
          {filtered.length} of {hands.length} hand{hands.length === 1 ? '' : 's'} ·{' '}
          <span className="tabular">{formatCents(net, { sign: true })}</span> across the shown hands
          {withoutFigure > 0 && <> ({withoutFigure} without amounts not counted)</>}
        </>
      }
    >
      <div className="space-y-4 pb-8">
        <section className="card-surface space-y-3 p-3">
          <label className="sr-only" htmlFor="hand-search">
            Search notes and tags
          </label>
          <input
            id="hand-search"
            type="search"
            className="field"
            placeholder="Search notes and tags"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />

          <div className="grid grid-cols-2 gap-2">
            <Select label="Session" value={sessionId} onChange={setSessionId} options={sessions.map((entry) => ({ value: entry.id, label: `${entry.location || 'Unnamed'} · ${new Date(entry.startedAt).toLocaleDateString()}` }))} />
            <Select label="Location" value={location} onChange={setLocation} options={options.locations.map((value) => ({ value, label: value }))} />
            <Select label="Stakes" value={stakes} onChange={setStakes} options={options.stakes.map((value) => ({ value, label: value }))} />
            <Select label="Position" value={position} onChange={setPosition} options={options.positions.map((value) => ({ value, label: value }))} />
            <Select label="Tag" value={tag} onChange={setTag} options={options.tags.map((value) => ({ value, label: value }))} />
            <Select
              label="Result"
              value={result}
              onChange={(value) => setResult(value as ResultFilter)}
              options={[
                { value: 'won', label: 'Winning hands' },
                { value: 'lost', label: 'Losing hands' },
              ]}
              anyLabel="Any result"
              anyValue="any"
            />
          </div>

          <label className="flex items-center gap-3 py-1">
            <input
              type="checkbox"
              className="h-5 w-5 rounded border-room-700 bg-room-850 accent-felt-500"
              checked={favouritesOnly}
              onChange={(event) => setFavouritesOnly(event.target.checked)}
            />
            <span className="text-sm">Favourites only</span>
          </label>
        </section>

        {!ready ? (
          <p className="text-sm text-room-400">Loading…</p>
        ) : filtered.length === 0 ? (
          <EmptyState
            title={hands.length === 0 ? 'No hands yet' : 'Nothing matches those filters'}
            description={
              hands.length === 0
                ? 'Recorded hands appear here with their full action history.'
                : 'Try clearing a filter.'
            }
          />
        ) : (
          <ul className="space-y-2">
            {filtered.map((hand) => (
              <li key={hand.id}>
                <HandCard hand={hand} showLocation />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Page>
  )
}

function Select({
  label,
  value,
  onChange,
  options,
  anyLabel = 'Any',
  anyValue = '',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  anyLabel?: string
  anyValue?: string
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <select className="field" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value={anyValue}>{anyLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export function HandCard({ hand, showLocation = false }: { hand: HandRecord; showLocation?: boolean }) {
  const { state, result, inProgress, draft, reconstructed } = deriveHand(hand)
  const net = heroResultOf(hand)
  const outcome = heroOutcome(hand)
  const heroCards = exactHoleCards(draft.hero)
  const remembered = holeCardsText(draft.hero)
  const board = reconstructed
    ? draft.streets.map(boardText).filter((text): text is string => text !== null).join(' · ')
    : ''

  return (
    <Link
      to={`/hands/${hand.id}`}
      className="card-surface block px-3 py-3 transition-colors hover:border-room-500"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <span>#{hand.handNumber}</span>
            <span className="text-room-400">{hand.context.heroPosition}</span>
            {hand.favorite && (
              <span className="text-chip-amber" role="img" aria-label="Favourite">
                &#9733;
              </span>
            )}
            {inProgress && <span className="chip border-felt-500/50 text-felt-200">In progress</span>}
            {reconstructed && <span className="chip font-normal">Reconstructed</span>}
          </p>
          <p className="mt-0.5 text-xs text-room-400 tabular">
            {formatDateTime(hand.createdAt)}
            {showLocation && hand.context.location ? ` · ${hand.context.location}` : ''} ·{' '}
            {hand.context.stakesLabel}
          </p>
        </div>
        {heroCards ? (
          <CardRow cards={heroCards} size="sm" />
        ) : remembered !== 'Not recorded' ? (
          <span className="chip shrink-0 font-semibold text-room-50">{remembered}</span>
        ) : (
          <CardRow cards={[]} size="sm" placeholders={2} />
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        {result ? (
          <span className="chip tabular">Pot {formatCents(result.grossPot)}</span>
        ) : (
          draft.pot !== null && <span className="chip tabular">Pot about {formatCents(draft.pot)}</span>
        )}
        {!inProgress && net !== null && (
          <span className={`chip tabular ${net >= 0 ? 'text-felt-200' : 'text-chip-red'}`}>
            {formatCents(net, { sign: true })}
          </span>
        )}
        {!inProgress && net === null && outcome && (
          <span className="chip">{outcome === 'won' ? 'Hero won' : outcome === 'lost' ? 'Hero lost' : 'Split pot'}</span>
        )}
        {state && !reconstructed && state.board.length > 0 && <CardRow cards={state.board} size="sm" />}
        {board && <span className="chip tabular text-room-50">{board}</span>}
        {hand.tags.map((entry) => (
          <span key={entry} className="chip">
            {entry}
          </span>
        ))}
      </div>
    </Link>
  )
}
