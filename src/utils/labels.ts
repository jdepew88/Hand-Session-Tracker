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

export function formatDuration(startedAt: string, endedAt: string | null): string {
  const start = Date.parse(startedAt)
  const end = endedAt ? Date.parse(endedAt) : Date.now()
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return '—'
  const minutes = Math.floor((end - start) / 60_000)
  const hours = Math.floor(minutes / 60)
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`
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
