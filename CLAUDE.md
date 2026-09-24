# HandForge — project instructions

These instructions govern this repository. HandForge is **unrelated** to the CCNA
Practice Labs project and to the EarthLink/IMAP Workers project; instructions from
`C:\Users\Joe\CLAUDE.md` about email credentials, IMAP destinations, news scraping or a
`PROJECT_SCOPE.md` do not apply here and should not be carried in.

## What this is

A mobile-first web app for recording live No-Limit Hold'em sessions and reconstructing
individual hands — used on a phone, at a table, often one-handed. It runs entirely in
the browser: no accounts, no server, no network calls after load. Hands export and import
as versioned JSON.

**Stack:** React + TypeScript + Vite + Tailwind, deployed to **Cloudflare Pages** as a
static site. No Node server, no Pages Functions.

Read `README.md` for the architecture in depth before changing anything structural.

## Architectural rules

These are not style preferences. Breaking them breaks the correctness guarantees the app
is built on.

**The engine is the product.** Poker domain logic lives in `src/domain/poker/` and must
stay independent of React and of any UI concern. Nothing in `src/domain/` may import from
`src/components/`, `src/pages/`, `src/store/` or `react`.

**The event log is the source of truth.** Hand state comes from exactly one function:

```ts
replay(setup: HandSetup, events: HandEvent[]): HandState
```

An immutable setup plus an ordered event log, replayed deterministically. This is what
makes undo (`events.slice(0, -1)`), correcting an earlier action (splice, then replay),
and importing a foreign hand all use the same code path and stay consistent.

**Never replace replay-derived accounting with mutable bookkeeping.** Do not add a running
pot variable, incremental stack adjustments, or a cached result that is written once and
read later. If a number is expensive to derive, memoise the derivation — do not store a
mutated copy. Deriving is cheap here and always correct.

**Money is integer cents.** Everywhere in the domain and storage layers. Floating-point
dollars silently corrupt pot math. Dollars exist only at the UI edge, via
`formatCents` / `parseDollars`.

**Action amounts are total street contributions, never increments.** `ActionEvent.to` is
what the seat has in for that street *after* the action. Keep this one representation.

**Rake stays out of the wagering model.** Players contribute chips; the house removes a
slice of the resulting pot. Gross pot, drop and net pot stay three separate figures.

## Security

**Imported JSON is untrusted input.** It must continue to be validated before it reaches
the engine or storage: size limit checked before parsing, schema and type checks, bounded
integer amounts, structural invariants (hero seated, unique seats, no duplicate physical
card), string sanitising, and a final replay gate. Never accept a partially-valid record
silently. The exported `result` snapshot is informational and must stay ignored on import.

**Preserve the security headers and the CSP** in `public/_headers`. The CSP contains no
`unsafe-inline` and no `unsafe-eval`, and that is a property of the build:

- Vite's modulepreload polyfill is disabled in `vite.config.ts` because it injects an
  inline `<script>`. Do not re-enable it.
- No component sets a `style` attribute — styling is class-based only.
- Nothing calls `eval` or `new Function`, and nothing uses `dangerouslySetInnerHTML`.

If something genuinely needs an inline script or style, add a hash or a nonce. Do not
widen the CSP. Do not remove `frame-ancestors`, HSTS, `nosniff`, Referrer-Policy,
Permissions-Policy or the cross-origin headers.

## Scope

Keep the project focused on **fast, accurate live poker-hand entry**. The UX target is a
390–430px phone screen: large tap targets, minimal typing, very few modals, and no
re-entering table information between hands.

**Do not add** accounts, authentication, Cloudflare D1 or any server-side database,
payments, subscriptions, analytics, telemetry, social features, or AI/LLM features —
unless explicitly requested. The architecture is deliberately ready for accounts and D1
later (UUID keys, `updatedAt` stamps, repository interfaces); being ready is not
permission to build it.

Avoid unnecessary dependencies.

## Git

- Work on feature branches or worktrees. Do not work directly on `main` or `development`.
- **No push, merge, deploy, force-push, reset --hard, or other destructive Git operation
  without explicit approval.** Committing to the current feature branch when asked is fine.
- The stash stack is shared across worktrees; prefer a temporary WIP commit over `git stash`.

## Before claiming work is complete

Run all four, and report real results:

```bash
npm run typecheck    # tsc -b
npm run lint         # eslint
npm test             # vitest run
npm run build        # production build
```

`npm run verify` runs the lot.

**Do not weaken, skip, or delete a test to make a build pass.** If a test fails, either the
code is wrong or the test's expectation is wrong — work out which and say which. Changing
an assertion is only acceptable when the assertion itself was demonstrably incorrect, and
that should be stated plainly rather than folded into a commit quietly.

The engine deserves significantly more test coverage than the UI. New engine behaviour
needs tests; the worked example in `src/domain/poker/summary.test.ts` is a regression
anchor and should keep passing.

Distinguish clearly in reports between finished behaviour, mocked behaviour, and anything
still requiring Cloudflare configuration.
