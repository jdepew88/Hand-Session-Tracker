import { describe, expect, it } from 'vitest'
import headers from '../public/_headers?raw'

/** The security headers Cloudflare Pages serves. Widening any of these is a deliberate, reviewed change. */

const header = (name: string) => headers.split('\n').find((line) => line.trim().startsWith(`${name}:`))?.trim() ?? ''

describe('security headers', () => {
  it('keeps the strict CSP: no unsafe-inline, no unsafe-eval, same-origin connections only', () => {
    const csp = header('Content-Security-Policy')
    expect(csp).toContain("default-src 'none'")
    expect(csp).toContain("connect-src 'self';")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).not.toMatch(/unsafe-inline|unsafe-eval/)
  })

  it('allows the microphone to this origin only, for Speak hand, and denies every other feature', () => {
    const policy = header('Permissions-Policy')
    expect(policy).toContain('microphone=(self)')
    const features = policy.replace('Permissions-Policy:', '').split(',').map((item) => item.trim())
    for (const feature of features) {
      if (feature.startsWith('microphone=')) continue
      expect(feature, feature).toMatch(/=\(\)$/)
    }
    expect(features).toContain('camera=()')
    expect(features).toContain('geolocation=()')
  })
})
