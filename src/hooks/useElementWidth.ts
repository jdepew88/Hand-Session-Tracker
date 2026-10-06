import { useEffect, useRef, useState } from 'react'

/**
 * The rendered width of an element, kept current with a ResizeObserver.
 *
 * Charts draw at their real pixel size so axis text and strokes stay crisp at
 * every width; `fallback` is used before the first measurement (and in test
 * environments without ResizeObserver).
 */
export function useElementWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(fallback)
  useEffect(() => {
    const element = ref.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(1, Math.round(entry.contentRect.width)))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}
