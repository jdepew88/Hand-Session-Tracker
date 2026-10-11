import { describe, expect, it } from 'vitest'

/**
 * The AI provider key is a server-side secret. Nothing that ships to the
 * browser may name it, the provider's API, or import the server module.
 */

const clientSources = import.meta.glob<string>(['../**/*.{ts,tsx}', '!../server/**', '!../**/*.test.{ts,tsx}', '!../**/fixtures/**'], {
  query: '?raw',
  import: 'default',
  eager: true,
})

const clientFiles = Object.entries(clientSources)

describe('no AI secret on the client', () => {
  it('finds client source to check', () => {
    expect(clientFiles.length).toBeGreaterThan(50)
    expect(clientFiles.some(([path]) => path.endsWith('services/narrationParser.ts'))).toBe(true)
  })

  it('never names the key, the provider API, or imports the server code', () => {
    for (const [path, source] of clientFiles) {
      expect(source, path).not.toMatch(/ANTHROPIC_API_KEY|x-api-key|api\.anthropic\.com|sk-ant-/)
      expect(source, path).not.toMatch(/from ['"][./]*server\//)
    }
  })

  it('only reads public, non-secret build settings', () => {
    for (const [path, source] of clientFiles) {
      for (const name of source.match(/import\.meta\.env\.([A-Z_]+)/g) ?? []) expect(name, path).not.toMatch(/KEY|SECRET|TOKEN/)
    }
  })
})
