import { useId, useState } from 'react'
import { RANKS, RANK_NAME, SUITS, SUIT_NAME, SUIT_SYMBOL, makeCard, type Card, type Rank, type Suit } from '../../domain/poker/cards'
import { exactCard, isExactCard } from '../../domain/poker/draft/memory'
import type { CardMemory } from '../../domain/poker/draft/model'
import { parseCardsShorthand, parseHoleShorthand } from '../../domain/poker/draft/shorthand'
import { cardSpoken } from '../../domain/poker/draft/text'
import { RememberedCard } from './RememberedCard'

const SUIT_TEXT: Record<Suit, string> = {
  s: 'text-room-50',
  h: 'text-chip-red',
  d: 'text-sky-400',
  c: 'text-felt-400',
}

/**
 * Card entry that lets a card be half-remembered.
 *
 * Two taps for a whole card (rank, then suit), and the cursor moves on by
 * itself. "?" stands in for the half you do not remember: "Ace, ?" is an Ace
 * of an unknown suit. Cards already placed elsewhere in the hand cannot be
 * picked. A typed line ("AsKd", "AKs", "T82") fills every slot at once.
 */
export function CardInput({
  legend,
  cards,
  onChange,
  used,
  slotNames,
  hole = false,
}: {
  legend: string
  cards: readonly CardMemory[]
  /** `suited` is set when typed shorthand says suited / offsuit ("AKs"). */
  onChange: (cards: CardMemory[], suited?: boolean | null) => void
  /** Exact cards already somewhere else in the hand. */
  used: readonly Card[]
  slotNames?: readonly string[]
  /** Two hole cards: typed "AKs" / "AKo" also records suited or offsuit. */
  hole?: boolean
}) {
  const id = useId()
  const firstOpen = cards.findIndex((card) => !isExactCard(card))
  const [active, setActive] = useState(firstOpen === -1 ? 0 : firstOpen)
  const [typed, setTyped] = useState('')
  const [typedError, setTypedError] = useState('')
  const index = Math.min(active, cards.length - 1)
  const current = cards[index] ?? { rank: null, suit: null }

  const otherExact = new Set<Card>([
    ...used,
    ...cards.flatMap((card, slot) => {
      const exact = slot === index ? null : exactCard(card)
      return exact ? [exact] : []
    }),
  ])
  const blocked = (rank: Rank, suit: Suit) => otherExact.has(makeCard(rank, suit))
  const rankExhausted = (rank: Rank) => SUITS.every((suit) => blocked(rank, suit))

  const nextSlot = (from: number, next: CardMemory[]) => {
    for (let step = 1; step <= next.length; step += 1) {
      const slot = (from + step) % next.length
      if (!isExactCard(next[slot]!)) return slot
    }
    return from
  }

  const write = (card: CardMemory, advance: boolean) => {
    const next = cards.map((existing, slot) => (slot === index ? card : existing))
    onChange(next)
    if (advance) setActive(nextSlot(index, next))
  }

  const pickRank = (rank: Rank | null) => {
    const suit = rank !== null && current.suit !== null && blocked(rank, current.suit) ? null : current.suit
    write({ rank, suit }, suit !== null)
  }

  const pickSuit = (suit: Suit | null) => write({ rank: current.rank, suit }, true)

  const applyTyped = () => {
    const text = typed.trim()
    if (text === '') return
    if (hole) {
      const parsed = parseHoleShorthand(text)
      if (parsed && fits(parsed.cards)) {
        onChange([...parsed.cards], parsed.suited)
        setTyped('')
        setTypedError('')
        return
      }
    } else {
      const parsed = parseCardsShorthand(text)
      if (parsed && parsed.length === cards.length && fits(parsed)) {
        onChange(parsed)
        setTyped('')
        setTypedError('')
        return
      }
    }
    setTypedError(`Could not read that as ${cards.length} card${cards.length === 1 ? '' : 's'}.`)
  }

  const fits = (next: readonly CardMemory[]) => {
    const exact = next.flatMap((card) => {
      const value = exactCard(card)
      return value ? [value] : []
    })
    return new Set(exact).size === exact.length && exact.every((card) => !used.includes(card))
  }

  const name = (slot: number) => slotNames?.[slot] ?? `Card ${slot + 1}`

  return (
    <fieldset className="min-w-0">
      <legend className="label">{legend}</legend>

      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {cards.map((card, slot) => (
          <button
            key={slot}
            type="button"
            aria-pressed={slot === index}
            aria-label={`${name(slot)}: ${cardSpoken(card)}`}
            onClick={() => setActive(slot)}
            className={`tap flex h-14 items-center justify-center rounded-lg border px-1.5 text-[13px] ${
              slot === index ? 'border-felt-400 bg-room-800' : 'border-room-700 bg-room-850'
            }`}
          >
            <RememberedCard card={card} empty="slot" />
          </button>
        ))}
        <button
          type="button"
          className="btn-ghost ml-auto px-3 text-xs"
          disabled={current.rank === null && current.suit === null}
          onClick={() => write({ rank: null, suit: null }, false)}
        >
          Clear {name(index).toLowerCase()}
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1" role="group" aria-label={`Rank for ${name(index).toLowerCase()}`}>
        {RANKS.map((rank) => (
          <button
            key={rank}
            type="button"
            disabled={rankExhausted(rank)}
            aria-pressed={current.rank === rank}
            onClick={() => pickRank(rank)}
            className={`tap rounded-lg border text-base font-semibold disabled:opacity-30 ${
              current.rank === rank ? 'border-felt-400 bg-felt-500 text-room-950' : 'border-room-700 bg-room-850 text-room-50'
            }`}
          >
            <span aria-hidden="true">{rank === 'T' ? '10' : rank}</span>
            <span className="sr-only">{RANK_NAME[rank]}</span>
          </button>
        ))}
        <button
          type="button"
          aria-pressed={current.rank === null && current.suit !== null}
          onClick={() => pickRank(null)}
          className="tap rounded-lg border border-dashed border-room-500 bg-room-900 text-base font-semibold text-room-300"
        >
          <span aria-hidden="true">?</span>
          <span className="sr-only">Rank unknown</span>
        </button>
      </div>

      <div className="mt-1.5 grid grid-cols-5 gap-1" role="group" aria-label={`Suit for ${name(index).toLowerCase()}`}>
        {SUITS.map((suit) => {
          const disabled = current.rank !== null && blocked(current.rank, suit)
          return (
            <button
              key={suit}
              type="button"
              disabled={disabled}
              aria-pressed={current.suit === suit}
              onClick={() => pickSuit(suit)}
              className={`tap h-12 rounded-lg border text-2xl disabled:opacity-30 ${SUIT_TEXT[suit]} ${
                current.suit === suit ? 'border-felt-400 bg-room-800' : 'border-room-700 bg-room-850'
              }`}
            >
              <span aria-hidden="true">{SUIT_SYMBOL[suit]}</span>
              <span className="sr-only">{current.rank ? `${RANK_NAME[current.rank]} of ${SUIT_NAME[suit]}` : SUIT_NAME[suit]}</span>
            </button>
          )
        })}
        <button
          type="button"
          onClick={() => pickSuit(null)}
          className="tap h-12 rounded-lg border border-dashed border-room-500 bg-room-900 text-sm font-semibold text-room-300"
        >
          <span aria-hidden="true">?</span>
          <span className="sr-only">Suit unknown</span>
        </button>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <label htmlFor={`${id}-typed`} className="shrink-0 text-xs text-room-400">
          Or type
        </label>
        <input
          id={`${id}-typed`}
          className="field min-h-10 py-1.5 text-sm"
          autoComplete="off"
          spellCheck={false}
          placeholder={hole ? 'AsKd, AKs, QQ' : cards.length === 3 ? 'Tc8h2c, T82' : 'Kc, K'}
          value={typed}
          aria-describedby={typedError ? `${id}-typed-error` : undefined}
          onChange={(event) => {
            setTyped(event.target.value)
            setTypedError('')
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              applyTyped()
            }
          }}
          onBlur={applyTyped}
        />
      </div>
      {typedError && (
        <p id={`${id}-typed-error`} role="alert" className="mt-1 text-xs text-chip-red">
          {typedError}
        </p>
      )}
    </fieldset>
  )
}
