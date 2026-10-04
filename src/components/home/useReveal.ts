import { useEffect, useRef } from 'react'

/**
 * Fade an element in the first time it scrolls into view.
 *
 * Content is visible by default. Only an element that starts below the fold,
 * in a browser with IntersectionObserver and without a reduced-motion
 * preference, is hidden and then revealed -- so nothing can be stranded
 * invisible. The flag is a data attribute written straight to the DOM; the
 * transition itself lives in home.css.
 */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null)

  useEffect(() => {
    const element = ref.current
    if (!element || typeof IntersectionObserver === 'undefined') return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    if (element.getBoundingClientRect().top < window.innerHeight) return

    element.dataset.revealed = 'false'
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        element.dataset.revealed = 'true'
        observer.disconnect()
      },
      { rootMargin: '0px 0px -12% 0px' },
    )
    observer.observe(element)
    return () => {
      observer.disconnect()
      element.dataset.revealed = 'true'
    }
  }, [])

  return ref
}
