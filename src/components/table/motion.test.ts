import { describe, expect, it } from 'vitest'
import homeCss from '../home/home.css?raw'
import tableCss from './table.css?raw'

/**
 * Reduced motion is a stylesheet property, so it is checked in the stylesheets:
 * every transition and animation must sit inside a
 * `prefers-reduced-motion: no-preference` block. Anything outside one would
 * still move for someone who asked it not to.
 */

const SHEETS = { 'table.css': tableCss, 'home.css': homeCss }

/** Strip the no-preference blocks (balanced braces) and return what is left. */
function outsideNoPreference(css: string): string {
  let rest = css
  for (;;) {
    const start = rest.indexOf('@media (prefers-reduced-motion: no-preference)')
    if (start === -1) return rest
    let depth = 0
    let end = rest.indexOf('{', start)
    for (; end < rest.length; end += 1) {
      if (rest[end] === '{') depth += 1
      if (rest[end] === '}') {
        depth -= 1
        if (depth === 0) break
      }
    }
    rest = rest.slice(0, start) + rest.slice(end + 1)
  }
}

describe('motion respects prefers-reduced-motion', () => {
  for (const [sheet, css] of Object.entries(SHEETS)) {
    it(`gates every transition and animation in ${sheet}`, () => {
      expect(css).toContain('prefers-reduced-motion: no-preference')
      const ungated = outsideNoPreference(css).replace(/\/\*[\s\S]*?\*\//g, '')
      expect(ungated).not.toMatch(/(^|[\s;{])(transition|animation)\s*:/)
    })
  }
})
