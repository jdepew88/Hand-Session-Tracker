# HandForge

A mobile-first tool for recording live No-Limit Hold'em sessions and reconstructing
individual hands — at the table, or right after you walk away from it.

Everything runs in the browser. There are no accounts, no server, and nothing leaves
the device. Hands export and import as versioned JSON files.

---

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check, then build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run the test suite once |
| `npm run test:watch` | Watch mode |
| `npm run typecheck` | `tsc -b` |
| `npm run lint` | ESLint |
| `npm run verify` | typecheck + lint + tests + build |
| `npm run deploy` | `npx wrangler@latest pages deploy dist` |

---

## Architecture

The poker engine is the product; the UI is a thin layer over it. Game logic lives in
`src/domain/poker/` and imports nothing from React.

```
src/
  domain/
    money.ts                 integer-cents money type and formatting
    poker/
      cards.ts               card primitives, duplicate detection
      positions.ts           position naming and action order from the button
      models.ts              every domain type; the schema of record
      rake.ts                drop structures and computation
      pot.ts                 side pots, rake deduction, odd-chip splitting
      betting.ts             legal actions, sizing, validation
      reducer.ts             THE ENGINE: replay(setup, events) -> state
      evaluator.ts           7-card Hold'em evaluator
      showdown.ts            pot awards, ties, manual winners
      summary.ts             human-readable hand history
      serialize.ts           versioned JSON export/import
      validation.ts          untrusted-input validation
      lifecycle.ts           record + derived state helpers
      factories.ts           constructors for sessions, hands, players
  storage/
    db.ts                    minimal IndexedDB wrapper
    repositories.ts          repository interfaces + IndexedDB implementations
    preferences.ts           localStorage, for preferences only
  store/                     React context over the repositories
  components/                reusable UI
  pages/                     one file per screen
  utils/                     labels, file download/read helpers
```

### 1. The hand-state engine

There is exactly one way state is produced:

```ts
replay(setup: HandSetup, events: HandEvent[]): HandState
```

`HandSetup` is the immutable start of the hand — seats, stacks, button, blinds, antes,
straddles, dead money, hero's cards, the drop structure. `HandEvent[]` is an ordered log
of player actions, board deals and card reveals. Nothing else exists. There is no pot
variable that survives between calls and no incremental stack bookkeeping, so nothing
can drift out of sync.

Consequences that fall out of this for free:

- **Undo** is `events.slice(0, -1)`.
- **Correcting an earlier action** is a splice followed by another replay. Every later
  amount, the pot, the stacks, the rake and the winner are all recalculated. There is no
  way to leave the pot and the stacks disagreeing.
- **An imported hand** is replayed by exactly the same code as a locally recorded one.
- **Debugging** means reproducing from one array.

Forced bets are *derived* from the setup rather than stored as events, so posting the
blinds can never be undone into an inconsistent state.

Street completion is automatic. Each street tracks `seatsToAct`, an ordered list of live
players who still owe an action. A fold or a call removes a player; a bet or raise
re-adds everyone else who can still act. When the list empties the betting round is
closed, and the app asks for the next board card rather than making you press "next
street". If only one player remains unfolded, the hand ends immediately. If everyone
left is all-in, betting is skipped and you enter the remaining board cards straight
through to the river.

`HandStatus` moves through `setup → preflop → flop → turn → river → showdown → complete`.

### 2. Pot and stack accounting

**All money is integer cents.** Floating-point dollars silently corrupt pot math
(`0.1 + 0.2 !== 0.3`), and a tracker that is off by a cent after twelve actions is
useless. Dollars exist only at the UI edge.

**Bet amounts use one representation everywhere.** An `ActionEvent`'s `to` field is the
seat's *total contribution for that street* after the action — never an increment. "Opens
to $15, raised to $50" stores `1500` and `5000`. This removes the entire class of
hand-history bug where a raise is misread as an addition on top of a call. The chips
actually leaving the stack are derived (`to - alreadyInThisStreet`), and a call is capped
at the stack, so no player can ever wager more than they have.

Every seat satisfies `stack + committed === startingStack` at all times; there is a test
that asserts exactly this across a multi-street, multi-raise hand.

**Uncalled bets are returned.** When a betting round closes, any amount by which one
player's contribution exceeds every other player's is given back. Bet $15 into a $5 blind
and everyone folds, and the pot is $15 (three players' $5), not $25 — which also keeps
the drop honest.

**Side pots are derived, not accumulated.** `buildPots` layers the contributions: each
distinct contribution level defines a pot that every player pays into up to that ceiling,
and only unfolded players who reached that ceiling can win it. Folded players' chips stay
in the pot but win nothing, and a folded short stack does not manufacture a phantom side
pot. Multiple all-ins of different sizes work today, in the engine and in the UI.

Odd chips in a split go to the first player clockwise from the button.

### 3. Rake and drop

Rake is kept completely out of the wagering model: players contribute chips, and the
house removes a slice of the resulting pot. A player's investment is unaffected by what
the house takes, so mixing the two would make stack accounting wrong.

A `RakeStructure` supports a per-street drop (preflop / flop / turn / river, additive as
each street is reached), a separate jackpot/promotional drop taken on a configurable
street, an optional cap on the rake, a no-flop-no-drop switch, and free-text notes. The
drop can never exceed the pot, and the promotional drop is waived first when it would.

Every amount is editable and presets can be saved. **The presets shipped with the app are
examples to verify, not a record of any room's current structure.** The UI labels them as
such. The pot display always shows gross pot, drop and net pot as three separate figures.

### 4. Local persistence

IndexedDB behind repository interfaces (`SessionRepository`, `HandRepository`,
`PlayerRepository`, `RakePresetRepository`, `SettingsRepository`). No component touches
IndexedDB. Object stores: `sessions`, `hands`, `players`, `rakePresets`, `settings`, with
indexes on `sessionId` and timestamps.

`localStorage` is used only for disposable preferences (which session is open), with every
read and write guarded — Safari private mode and blocked site data must not break the app.

A React context loads everything once and writes through to storage, so what is on screen
always matches what is stored.

### 5. JSON import and export

A single hand exports as versioned JSON:

```jsonc
{
  "schemaVersion": 1,
  "kind": "handforge.hand",
  "exportedAt": "…",
  "hand":    { "id": "…", "favorite": true, "tags": [], "notes": "", "context": { … } },
  "table":   { "buttonSeat": 6, "heroSeat": 3, "smallBlind": 500, "rake": { … }, … },
  "players": [ { "seat": 1, "startingStack": 50000 }, … ],
  "actions": [ { "kind": "action", "seat": 3, "action": "raise", "to": 1500 }, … ],
  "result":  { … }
}
```

The file stores the **event log**, not final totals — everything needed to replay the hand
from the first blind to the last chip. `result` is a convenience snapshot for tools that
do not want to implement the engine, and is **ignored on import**: the hand is re-derived,
so a stale or tampered snapshot can never corrupt accounting. (There is a test for this.)

Filenames read like `2026-09-24-commerce-casino-5-5-hand-001.json`.

The `hand` / `table` / `players` / `actions` / `result` split leaves room for the planned
session and batch exports: those become a `kind` of `handforge.session` or
`handforge.bundle` wrapping arrays of these same objects at the same `schemaVersion`.

### 6. Security

Imported JSON is treated as hostile — it comes from a file the app did not write.

- **Size limit** (512 KB) is checked *before* parsing.
- **Schema validation**: every field is type-checked; unknown `kind` or `schemaVersion`
  is rejected outright.
- **Bounded amounts**: integers only, non-negative, capped at $1,000,000; `2.5` cents and
  `-500` are both rejected.
- **Structural invariants**: hero must be seated, the button must be seated, seats must be
  unique, a flop must be exactly three real cards, and no physical card may appear twice
  across hole cards, board and reveals.
- **String hygiene**: control characters stripped, lengths clamped.
- **Replay gate**: the record must replay without throwing before it is accepted.

Every issue found is reported to the user; nothing partially-valid is silently kept.

Imported strings are never treated as markup. React escapes text nodes and no component
uses `dangerouslySetInnerHTML` — there is no HTML sink in the application.

**HTTP headers** are in `public/_headers` (copied to `dist/` at build time):

```
Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self';
  img-src 'self' data:; font-src 'self'; connect-src 'self'; manifest-src 'self';
  worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self';
  frame-ancestors 'none'; upgrade-insecure-requests
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), geolocation=(), microphone=(), payment=(), … (all denied)
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
X-Frame-Options: DENY
```

**There is no `unsafe-inline` and no `unsafe-eval`.** That is a property of the build, not
a hope:

- Vite's modulepreload polyfill is **disabled in `vite.config.ts`** specifically because it
  injects an inline `<script>`. Every browser this app targets supports modulepreload
  natively.
- No component sets a `style` attribute — all styling is class-based — so `style-src 'self'`
  holds.
- Nothing in the bundle calls `eval` or `new Function`.

`default-src 'none'` means every fetch type is opted into explicitly, so a directive that
gets forgotten fails closed. If a future dependency needs an inline script or style, add a
hash or a nonce for it rather than widening these.

### 7. Accessibility

- Semantic controls throughout: real `<button>`, `<label>`, `<fieldset>`/`<legend>`,
  `<nav>`, `<dl>`. No click handlers on `<div>`s.
- Visible focus ring on every focusable element, plus a skip link.
- 44px minimum tap target on every control.
- **Nothing is communicated by colour alone.** Cards use a four-colour deck for speed, but
  the rank character and suit glyph are always rendered and the accessible name spells the
  card out ("Ace of spades"). Player status reads as the words "Folded", "All-in", "To act".
  The active nav tab is marked by weight and a rule as well as colour.
- `aria-pressed` on toggle buttons, `role="alert"` / `role="status"` on validation and
  confirmation messages, `aria-live` on the running bet amount.
- `prefers-reduced-motion` is respected.

---

## Testing

`npm test` — 110 tests. The engine is tested far more heavily than the UI, deliberately.

Engine coverage includes: blinds and antes entering the pot without changing what a player
owes; a straddle becoming the live bet and doubling the opening raise; short stacks capped
when posting; raises stored as totals rather than increments; minimum-raise tracking across
several raises; a player never wagering more than their stack; folds ending a hand
immediately; uncalled bets being returned; the big blind's option closing preflop; a raise
reopening the action for limpers; flop/turn/river transitions carrying pot, stacks and
contributions; betting skipped once everyone is all-in; an unmatched all-in still requiring
an answer; stack/committed balance across every seat; replay determinism; undo restoring
exact prior state; correcting an earlier action recalculating everything after it.

Also: rake per street, caps, no-flop-no-drop, short pots; side pots across three different
all-in sizes; odd-chip splitting; every hand category, the wheel, kickers, board-plays
ties; split pots; short stacks winning only the pot they paid into; undetermined winners
and manual winner selection; full JSON round trip (twice), and a dozen malicious-import
cases.

The **worked example from the spec** is played out end-to-end through the real engine and
asserted against the spec's own numbers: $200 preflop, $360 on the flop, a $610 gross pot,
$6.50 drop, hero at **-$270**, with the hijack winning with two pair, Kings and Queens.

Ten jsdom smoke tests drive the actual screens against the actual storage layer — creating
a session, picking cards, recording an action, undoing it — to catch what a type-checker
cannot.

---

## Deploying to Cloudflare Pages

The app is fully static. No Node server, no Functions, no bindings.

### Option A — Git integration (recommended)

Push the repository, then in the Cloudflare dashboard: **Workers & Pages → Create →
Pages → Connect to Git**, and set:

| Setting | Value |
| --- | --- |
| Framework preset | Vite |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Node version | 20 or later (`NODE_VERSION` environment variable) |

### Option B — Direct upload

```bash
npm run build
npx wrangler@latest pages deploy dist
```

`wrangler.toml` declares `pages_build_output_dir = "dist"`, which is what makes this a
Pages project rather than a Worker. Wrangler is intentionally not pinned as a
devDependency; `npx` fetches it on demand.

`public/_redirects` contains `/* /index.html 200` so deep links like `/hands/<uuid>`
survive a hard refresh. Static assets are matched before that rule, so bundles are never
shadowed by it.

After the first deploy, confirm the headers landed:

```bash
curl -sI https://<your-project>.pages.dev | grep -i -E 'content-security|strict-transport|x-content-type|referrer|permissions|cross-origin|x-frame'
```

---

## Known limitations

- **Hold'em only.** The evaluator is a five-from-seven Texas Hold'em evaluator. "Pot-Limit
  Omaha" can be selected as a session game type and hands will record, but automatic
  showdown evaluation does not apply Omaha's use-exactly-two rule — pick the winner
  manually for those.
- **Raise-reopening rights are not enforced.** An all-in that falls short of a full raise
  correctly moves the current bet without raising the minimum increment, but the app still
  asks everyone who has not matched to act, rather than restricting them to call-or-fold.
  The money is right; the strict rule is not modelled. This is deliberate for a recorder.
- **Sub-minimum raises warn rather than block.** The app records what happened at a table,
  including the occasional unusual floor ruling. Anything that would corrupt the money
  (over-stack wagers, checking into a bet, wrong seat) is a hard error.
- **Hand setup is locked once action starts.** To change the button, your seat or a
  starting stack, undo back to the start of the hand. Editing an action mid-hand is
  supported by the engine but is not yet exposed in the UI — only undo is.
- **No table diagram.** Seats are shown as an ordered list rather than a felt ring. The
  list is faster to tap and reads better on a phone; a desktop ring view is a v2 item.
- **Missed-blind handling is simplified.** Dead money goes to the pot without counting as
  a live bet. A posted missed big blind, which some rooms treat as live, is not modelled
  separately.
- **Session P/L needs a cash-out.** Figures derived from recorded hands are shown, but
  labelled explicitly: if you only record interesting pots, they are not a sample of how
  the session went, and the app says so rather than implying otherwise.
- **Storage is per-browser.** Clearing site data deletes everything. Export anything worth
  keeping.

---

## Where this goes next (v2)

1. **Session and batch export/import.** The JSON root shape and `kind` field were designed
   for this; it is additive.
2. **Edit any action, not just undo.** The engine already supports splice-and-replay; this
   is a UI affordance plus a confirmation flow.
3. **Cross-session player profiles.** `PlayerProfile.sessionId` is already nullable for
   exactly this, and hand seats already carry a `playerId`.
4. **Accounts and sync** — Cloudflare Pages + Workers + D1. The migration path is written
   into the architecture: every id is a UUID (never an array index or timestamp), every
   record carries `createdAt`/`updatedAt`, and all data access already goes through
   repository interfaces. An `ApiSessionRepository` implementing the same five methods
   against a Worker drops in beside the IndexedDB one; the only genuinely new problem is
   conflict resolution, for which the UUID keys and `updatedAt` stamps are the raw
   material. The hand model needs no change.
5. **Replay view** — step through a saved hand action by action. `replay(setup,
   events.slice(0, n))` already does the work.
6. **Desktop table ring** with seat positions laid out on a felt.
7. **Trusted Types** (`require-trusted-types-for 'script'`) once the dependency tree is
   verified compatible.
