import { defineConfig } from 'vitest/config'

/**
 * The LIVE narration evaluation (`npm run eval:narration`). It calls the
 * real AI provider with the development key in `.dev.vars`, so it is kept
 * out of `npm test` / `npm run verify` and never runs in a build or deploy.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['eval/**/*.eval.ts'],
    testTimeout: 60 * 60 * 1000,
    reporters: ['default'],
  },
})
