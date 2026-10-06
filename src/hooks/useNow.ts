import { useEffect, useState } from 'react'

/**
 * The current time, refreshed every `intervalMs` while `active`.
 *
 * Live session durations only change by the minute, so one restrained timer
 * at page level re-renders the page once a minute rather than every second.
 */
export function useNow(active: boolean, intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [active, intervalMs])
  return now
}
