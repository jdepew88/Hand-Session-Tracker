import { useState } from 'react'
import {
  RANKS,
  RANK_NAME,
  SUITS,
  SUIT_NAME,
  SUIT_SYMBOL,
  describeCard,
  makeCard,
  type Card,
  type Rank,
  type Suit,
} from '../domain/poker/cards'
import { PlayingCard } from './PlayingCard'

const SUIT_BUTTON: Record<Suit, string> = {
  s: 'text-room-50',
  h: 'text-chip-red',
  d: 'text-sky-400',
  c: 'text-felt-400',
}

/**
 * Two taps per card: rank, then suit.
 *
 * Faster than a 52-card grid on a phone and far less error-prone at a table --
 * thirteen large targets then four very large ones, instead of fifty-two small
 * ones. Cards already known to be somewhere else in the hand are disabled, so a
 * duplicate is impossible to enter rather than merely rejected afterwards.
 */
export function CardPicker({
  count,
  value,
  onChange,
  usedCards,
  legend,
}: {
  count: number
  value: readonly Card[]
  onChange: (cards: Card[]) => void
  /** Cards already spoken for anywhere in this hand. */
  usedCards: readonly Card[]
  legend: string
}) {
  const [pendingRank, setPendingRank] = useState<Rank | null>(null)

  // A physical card exists once. Anything already used in the hand -- including
  // what this picker has already taken -- is disabled rather than merely
  // rejected on tap, so an impossible board cannot be entered in the first place.
  const blocked = new Set<Card>([...usedCards, ...value])
  const full = value.length >= count

  const addCard = (card: Card) => {
    if (blocked.has(card) || value.includes(card) || full) return
    onChange([...value, card])
    setPendingRank(null)
  }

  const removeCard = (card: Card) => {
    onChange(value.filter((entry) => entry !== card))
  }

  const rankIsExhausted = (rank: Rank) => SUITS.every((suit) => blocked.has(makeCard(rank, suit)))

  return (
    <fieldset className="card-surface p-3">
      <legend className="px-1 text-xs font-medium uppercase tracking-wide text-room-400">
        {legend}
      </legend>

      <div className="mb-3 flex min-h-12 flex-wrap items-center gap-2">
        {value.map((card) => (
          <button
            key={card}
            type="button"
            onClick={() => removeCard(card)}
            className="tap inline-flex items-center gap-1.5 rounded-lg border border-room-700 bg-room-850 px-2 py-1 hover:border-chip-red"
            aria-label={`Remove ${describeCard(card)}`}
          >
            <PlayingCard card={card} size="sm" />
            <span aria-hidden="true" className="pr-1 text-room-400">
              &times;
            </span>
          </button>
        ))}
        {value.length === 0 && (
          <p className="text-sm text-room-400">Choose a rank, then a suit.</p>
        )}
        {value.length > 0 && !full && (
          <p className="text-sm text-room-400">
            {count - value.length} more card{count - value.length === 1 ? '' : 's'}.
          </p>
        )}
      </div>

      {!full && (
        <>
          <div className="grid grid-cols-7 gap-1.5">
            {RANKS.map((rank) => {
              const exhausted = rankIsExhausted(rank)
              const selected = pendingRank === rank
              return (
                <button
                  key={rank}
                  type="button"
                  disabled={exhausted}
                  aria-pressed={selected}
                  onClick={() => setPendingRank(selected ? null : rank)}
                  className={`tap rounded-lg border text-base font-semibold transition-colors disabled:opacity-30 ${
                    selected
                      ? 'border-felt-400 bg-felt-500 text-room-950'
                      : 'border-room-700 bg-room-850 text-room-50 hover:border-room-500'
                  }`}
                >
                  <span aria-hidden="true">{rank}</span>
                  <span className="sr-only">{RANK_NAME[rank]}</span>
                </button>
              )
            })}
          </div>

          <div className="mt-2 grid grid-cols-4 gap-1.5">
            {SUITS.map((suit) => {
              const card = pendingRank ? makeCard(pendingRank, suit) : null
              const disabled = !card || blocked.has(card)
              return (
                <button
                  key={suit}
                  type="button"
                  disabled={disabled}
                  onClick={() => card && addCard(card)}
                  className={`tap h-14 rounded-lg border border-room-700 bg-room-850 text-2xl font-semibold transition-colors enabled:hover:border-room-500 disabled:opacity-30 ${SUIT_BUTTON[suit]}`}
                >
                  <span aria-hidden="true">{SUIT_SYMBOL[suit]}</span>
                  <span className="sr-only">
                    {pendingRank
                      ? `${RANK_NAME[pendingRank]} of ${SUIT_NAME[suit]}`
                      : `${SUIT_NAME[suit]} — choose a rank first`}
                  </span>
                </button>
              )
            })}
          </div>
        </>
      )}
    </fieldset>
  )
}
