import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState, Page } from '../components/Page'
import { CardRow } from '../components/PlayingCard'
import { formatCents } from '../domain/money'
import { deriveHand } from '../domain/poker/lifecycle'
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
        const net = deriveHand(hand).result.heroResult
        if (result === 'won' && net <= 0) return false
        if (result === 'lost' && net >= 0) return false
      }
      if (needle) {
        const haystack = `${hand.notes} ${hand.tags.join(' ')} ${hand.context.location}`.toLowerCase()
        if (!haystack.includes(needle)) return false
      }
      return true
    })
  }, [hands, sessionId, location, stakes, position, tag, favouritesOnly, result, query])

  const net = filtered.reduce((sum, hand) => sum + deriveHand(hand).result.heroResult, 0)

  return (
    <Page
      title="Hand history"
      subtitle={
        <>
          {filtered.length} of {hands.length} hand{hands.length === 1 ? '' : 's'} ·{' '}
          <span className="tabular">{formatCents(net, { sign: true })}</span> across the shown hands
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
  const { state, result, inProgress } = deriveHand(hand)

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
          </p>
          <p className="mt-0.5 text-xs text-room-400 tabular">
            {formatDateTime(hand.createdAt)}
            {showLocation && hand.context.location ? ` · ${hand.context.location}` : ''} ·{' '}
            {hand.context.stakesLabel}
          </p>
        </div>
        <CardRow cards={hand.setup.heroCards} size="sm" placeholders={2} />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="chip tabular">Pot {formatCents(result.grossPot)}</span>
        {!inProgress && (
          <span
            className={`chip tabular ${result.heroResult >= 0 ? 'text-felt-200' : 'text-chip-red'}`}
          >
            {formatCents(result.heroResult, { sign: true })}
          </span>
        )}
        {state.board.length > 0 && <CardRow cards={state.board} size="sm" />}
        {hand.tags.map((entry) => (
          <span key={entry} className="chip">
            {entry}
          </span>
        ))}
      </div>
    </Link>
  )
}
