import type { SeatState } from '../domain/poker/models'

/** How a seat is named across the UI: position first, nickname as context. */
export function seatTitle(seat: SeatState, heroSeat: number): string {
  if (seat.seat === heroSeat) return 'Hero'
  const nickname = seat.label?.trim()
  return nickname ? `${seat.position} · ${nickname}` : seat.position
}

/** Short form for tight spaces (seat chips, history cards). */
export function seatShort(seat: SeatState, heroSeat: number): string {
  return seat.seat === heroSeat ? `Hero (${seat.position})` : seat.position
}

export function formatDateTime(iso: string): string {
  const time = Date.parse(iso)
  if (Number.isNaN(time)) return '—'
  return new Date(time).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function formatDate(iso: string): string {
  const time = Date.parse(iso)
  if (Number.isNaN(time)) return '—'
  return new Date(time).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/** "4h 18m", "45m". Null (unusable times) reads as a dash. */
export function formatMinutes(minutes: number | null): string {
  if (minutes === null) return '—'
  const hours = Math.floor(minutes / 60)
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`
}

/** "4 hours 18 minutes", for screen readers. */
export function spokenMinutes(minutes: number | null): string {
  if (minutes === null) return 'unknown duration'
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  const unit = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`
  if (hours === 0) return unit(rest, 'minute')
  return rest === 0 ? unit(hours, 'hour') : `${unit(hours, 'hour')} ${unit(rest, 'minute')}`
}

const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`

export function formatClock(iso: string): string {
  const time = Date.parse(iso)
  if (Number.isNaN(time)) return '—'
  return new Date(time).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

/** "Today", "Yesterday", "Oct 2", or "Oct 2, 2025" outside the current year. */
export function formatRelativeDay(iso: string, now: number = Date.now()): string {
  const time = Date.parse(iso)
  if (Number.isNaN(time)) return '—'
  const date = new Date(time)
  const today = new Date(now)
  const yesterday = new Date(now)
  yesterday.setDate(today.getDate() - 1)
  if (dayKey(date) === dayKey(today)) return 'Today'
  if (dayKey(date) === dayKey(yesterday)) return 'Yesterday'
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() === today.getFullYear() ? {} : { year: 'numeric' }),
  })
}

/** "Today · 7:15 PM", "Oct 2 · 6:45 PM". */
export function formatJournalDate(iso: string, now: number = Date.now()): string {
  return `${formatRelativeDay(iso, now)} · ${formatClock(iso)}`
}

/** "October 4", or "October 4, 2025" outside the current year, for screen readers. */
export function spokenDate(iso: string, now: number = Date.now()): string {
  const time = Date.parse(iso)
  if (Number.isNaN(time)) return 'unknown date'
  const date = new Date(time)
  return date.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    ...(date.getFullYear() === new Date(now).getFullYear() ? {} : { year: 'numeric' }),
  })
}

const GAME_SHORT: Record<string, string> = {
  "No-Limit Hold'em": 'NLH',
  'Pot-Limit Omaha': 'PLO',
  "Limit Hold'em": 'LHE',
}

/** "NLH" for the known games, otherwise the game as entered. */
export function gameShort(gameType: string): string {
  return GAME_SHORT[gameType] ?? gameType
}

/** Today as a date-input value, "2026-10-04", in local time. */
export function dateInputValue(time: number = Date.now()): string {
  const date = new Date(time)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/**
 * A date-input value as an ISO time at local noon (so it stays on the same
 * calendar day in any nearby time zone); null if it is not a date.
 */
export function dateInputToIso(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12)
  return Number.isNaN(date.getTime()) || date.getDate() !== Number(match[3]) ? null : date.toISOString()
}
