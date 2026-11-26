# Reliable Signals (0.29.1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the desktop app and in VS Code the sea, the campfire and the hourglass show what the engine reports, and one empty reading never takes a signal away.

**Architecture:** A pure module, `hooks/reading.ts`, merges the three sources of the session's figures (the `session.measure` event, the `$.session.usage()` poll, and what was last seen) into one `Reading`. `hooks/register.tsx` builds a `Reading` wherever it polls today and feeds the tide, the hourglass and the campfire from it. `/crab debug` reports each source, so a pasted output from a real surface says which one failed.

**Tech Stack:** TypeScript, the Claude Code plugin engine (`claude-code`, `claude-code/testing`), no dependencies. Tests: `claude plugin test .` (runs every test file, about 40 s, no filter). Types: `scripts/validate.sh`.

**Spec:** `docs/superpowers/specs/2026-11-26-reliable-signals-calm-beach-design.md`, Part A.

## Global Constraints

- No package.json, no new dependencies.
- `hooks/news.ts` `VERSION` equals `.claude-plugin/plugin.json` `version`: both become `0.29.1` in Task 7 and nowhere earlier.
- CI pins Claude Code 2.1.316: read the event's `rateLimits` and `cost` through a local type and a cast, as `hooks/register.tsx:2143` does for `context`, never through a type that may be missing there.
- Nothing new is sent anywhere. `/crab debug` ends with "Nothing is sent from this command."
- Everything drawn on desktop has a terminal counterpart in `hooks/terminal.ts`.
- A kept limit window is dropped once its `resetsAt` has passed, or five hours (`5 * 3_600_000` ms) after it was seen when it has no reset time.
- The hourglass on desktop is at least 9 px wide and 12 px tall.
- Every task ends with `claude plugin test .` at 0 fail and `scripts/validate.sh` printing "No type errors."
- Commit messages follow the repo's: one plain sentence, no prefix (see `git log --oneline`).
- An anti-goal of the spec: no fix counts as done on the fake engine alone. Task 1 and Task 7 each have a step only the owner can do on a real surface.

## Review Focus

1. A poll that throws while the event carried everything: the sea, hourglass and fire still update (today `refreshContext` returns at `if (!usage) return`). Test in Task 3.
2. Limits present, then absent for one reading, then present: the hourglass never leaves and its 80% sign is not raised twice. Test in Task 3.
3. A kept limit whose `resetsAt` passed while the laptop slept: the hourglass goes, it does not show a stale 95%. Test in Task 2.
4. API billing with `budgetUsd` set and a cost only in the event, never in the poll: the budget hourglass shows. Test in Task 3.
5. A limit window arriving after the fire was lit on a five-minute lifetime: the fire lives an hour from when it was lit, not from when the limit arrived. Test in Task 5.

---

### Task 0: evidence from 0.29.0, before any code

**Files:**
- Create: `hooks/fixtures/debug-desktop-0.29.0.txt`, `hooks/fixtures/debug-vscode-0.29.0.txt`

- [ ] **Step 1: Owner's step, a gate.** Ask the owner to run three turns on the desktop app and in VS Code with the installed 0.29.0 and paste `/crab debug` from each. It already prints the sea's three sources, "(no plan limits seen)", the fire's state and when the turn and measurement hooks last came.
- [ ] **Step 2: Read them against the spec's hypotheses.** Expected if they hold: "plain usage: none" or "unavailable" and "local count: none" on a surface where the sea stays out; "(no plan limits seen)" where the hourglass is missing; a "5 min cache (api)" fire on a subscription. If instead a size and limits arrive and the signals still fail, the cause is elsewhere: stop, and take the outputs back to the owner before Task 1.
- [ ] **Step 3: Commit the two files verbatim.** `git add hooks/fixtures && git commit -m "What /crab debug says on the desktop app and in VS Code, 0.29.0"`

### Task 1: `/crab debug` reports every source

**Files:**
- Modify: `hooks/register.tsx:114-120` (the `probe` and `seen` records), `:509-534` (`debugText`), `:1228-1240` (`refreshContext`, where the poll is read), `:2138-2143` (`session.measure`)
- Test: `hooks/tide.test.tsx` (extend the test named "/crab debug says which source the sea goes by, and sends nothing")

**Interfaces:**
- Produces: `type Carried = { tokens: boolean; limits: string[]; cost: boolean; breakdown?: boolean }` in `hooks/register.tsx`; `probe.sent: Carried | null` (the last measurement event) and `probe.polled: Carried | null | 'failed'` (the last poll). Task 3 keeps both filled.

- [ ] **Step 1: Write the failing test.** In `hooks/tide.test.tsx`, after a `measure` with `rateLimits: [{ kind: 'five_hour', percentUsed: 18 }]` and `cost: { usd: 1.2 }` in the event and `isOnPlan: false` in the fake poll:

```ts
const text = (await crab($, 'debug')).text
expect(text).toContain('measurement carried: no size, limits five_hour, cost')
expect(text).toContain('poll answered: no size, no limits, no cost, a breakdown')
expect(text).toContain('The hourglass (the usage limit):')
expect(text).toContain('Nothing is sent from this command.')
```

- [ ] **Step 2: Run `claude plugin test .`** Expected: that test fails on the first `toContain`.
- [ ] **Step 3: Implement.** Fill `probe.sent` in the `session.measure` handler and `probe.polled` in `refreshContext` (`'failed'` when the poll threw). `debugText` gains two lines under "The sea" in the wording the test pins, and a third block:

```
The hourglass (the usage limit):
  <usageStat words, or one of: no usage limit reported yet | API billing and no budget set (budgetUsd) | switched off>
  limits known from: <event | poll | kept | none>
```

  In this task "limits known from" prints `poll` or `none`. Task 3 completes it.
- [ ] **Step 4: Run `claude plugin test .` and `scripts/validate.sh`.** Expected: 0 fail, "No type errors."
- [ ] **Step 5: Commit.** `git commit -am "/crab debug says what each source carried, and why there is no hourglass"`

### Task 2: `hooks/reading.ts`, the merge

**Files:**
- Create: `hooks/reading.ts`
- Test: `hooks/reading.test.tsx`

**Interfaces:**
- Produces:

```ts
export type Limit = { kind: string; percentUsed: number; resetsAt?: string }
export type Figures = { context?: { tokens?: number; window?: number }; rateLimits?: readonly Limit[]; cost?: { usd?: number }; changed?: readonly string[] }
export type KeptLimits = { limits: readonly Limit[]; at: number } | null
export type Source = 'event' | 'poll' | 'kept' | 'none'
export type Reading = {
  tokens: number | null; tokensFrom: 'event' | 'poll' | 'none'
  window: number | null
  limits: readonly Limit[]; limitsFrom: Source
  /** The event named `rateLimits` as changed and carried none, and the poll has none either: the windows left. Nothing kept is used, and nothing stays kept. A poll that still has windows wins (limitsFrom 'poll', hasLeft false). */
  hasLeft: boolean
  usd: number | undefined
}
export const LIMIT_KEEP_MS = 5 * 3_600_000
/** The kept windows still running at `now`; null when none is. */
export const stillKept = (kept: KeptLimits, now: number): KeptLimits
/** What to keep after this reading: null when `r.hasLeft`, else the newest non-empty list, else what `stillKept` leaves. */
export const keepLimits = (kept: KeptLimits, r: Reading, now: number): KeptLimits
export const mergeReading = (sent: Figures | undefined, polled: Figures | null, kept: KeptLimits, now: number): Reading
```

- [ ] **Step 1: Write the failing tests** in `hooks/reading.test.tsx` (pure, modelled on `hooks/cache.test.tsx`):

```ts
const NOW = new Date(2026, 10, 26, 12).getTime()
const five = (percentUsed: number, inMin = 60): Limit => ({ kind: 'five_hour', percentUsed, resetsAt: new Date(NOW + inMin * 60_000).toISOString() })

test('the event wins, the poll fills gaps, the kept limits come last', () => {
  expect(mergeReading({ context: { tokens: 50_000, window: 200_000 }, rateLimits: [five(20)], cost: { usd: 1 } }, null, null, NOW))
    .toMatchObject({ tokens: 50_000, tokensFrom: 'event', window: 200_000, limitsFrom: 'event', usd: 1 })
  expect(mergeReading({ context: { window: 200_000 }, rateLimits: [] }, { context: { tokens: 40_000, window: 200_000 }, rateLimits: [five(30)], cost: { usd: 2 } }, null, NOW))
    .toMatchObject({ tokens: 40_000, tokensFrom: 'poll', limitsFrom: 'poll', usd: 2 })
  expect(mergeReading(undefined, { context: { window: 200_000 }, rateLimits: [] }, { limits: [five(40)], at: NOW - 60_000 }, NOW))
    .toMatchObject({ tokens: null, tokensFrom: 'none', limitsFrom: 'kept', limits: [five(40)] })
  expect(mergeReading(undefined, null, null, NOW)).toMatchObject({ tokens: null, window: null, limits: [], limitsFrom: 'none', usd: undefined })
})
test('a kept window goes once its reset has passed, or after five hours with no reset time', () => {
  expect(stillKept({ limits: [five(40, -1)], at: NOW - 3_600_000 }, NOW)).toBe(null)
  expect(stillKept({ limits: [five(40, -1), { ...five(10, 90), kind: 'seven_day' }], at: NOW }, NOW)?.limits.map(l => l.kind)).toEqual(['seven_day'])
  expect(stillKept({ limits: [{ kind: 'five_hour', percentUsed: 40 }], at: NOW - LIMIT_KEEP_MS + 1 }, NOW)).not.toBe(null)
  expect(stillKept({ limits: [{ kind: 'five_hour', percentUsed: 40 }], at: NOW - LIMIT_KEEP_MS }, NOW)).toBe(null)
})
test('a size that is not a finite number of zero or more is no size', () => {
  for (const tokens of [NaN, -1, Infinity, '5' as never]) expect(mergeReading({ context: { tokens } }, null, null, NOW).tokens).toBe(null)
})
test('what is kept is the newest list seen, never an empty one', () => {
  const r = mergeReading({ rateLimits: [five(50)] }, null, { limits: [five(40)], at: NOW - 1000 }, NOW)
  expect(keepLimits({ limits: [five(40)], at: NOW - 1000 }, r, NOW)).toEqual({ limits: [five(50)], at: NOW })
  const empty = mergeReading({ rateLimits: [] }, { rateLimits: [] }, { limits: [five(40)], at: NOW - 1000 }, NOW)
  expect(keepLimits({ limits: [five(40)], at: NOW - 1000 }, empty, NOW)).toEqual({ limits: [five(40)], at: NOW - 1000 })
})
test('an empty list the engine names as changed means the windows left', () => {
  const kept = { limits: [five(40)], at: NOW - 1000 }
  const left = mergeReading({ rateLimits: [], changed: ['rateLimits'] }, { rateLimits: [] }, kept, NOW)
  expect(left).toMatchObject({ limits: [], limitsFrom: 'none', hasLeft: true })
  expect(mergeReading({ rateLimits: [], changed: ['rateLimits'] }, null, kept, NOW)).toMatchObject({ limitsFrom: 'none', hasLeft: true })
  expect(mergeReading({ rateLimits: [], changed: ['rateLimits'] }, { rateLimits: [five(40)] }, kept, NOW)).toMatchObject({ limitsFrom: 'poll', hasLeft: false })
  expect(keepLimits(kept, left, NOW)).toBe(null)
  expect(mergeReading({ rateLimits: [], changed: ['context'] }, null, kept, NOW)).toMatchObject({ limitsFrom: 'kept', hasLeft: false })
})
```

- [ ] **Step 2: Run `claude plugin test .`** Expected: `hooks/reading.test.tsx` fails, module not found.
- [ ] **Step 3: Implement `hooks/reading.ts`** to the signatures above. `window` follows the same order as `tokens` (the event's only when the event also has a size, as `hooks/register.tsx:1251` does today, else the poll's).
- [ ] **Step 4: Run `claude plugin test .` and `scripts/validate.sh`.** Expected: 0 fail, "No type errors."
- [ ] **Step 5: Commit.** `git add hooks/reading.ts hooks/reading.test.tsx && git commit -m "One reading from the event, the poll and what was last seen"`

### Task 3: the tide, the hourglass and the spend go by the reading

**Files:**
- Modify: `hooks/register.tsx:72` (add the atom), `:1096-1118` (`refreshUsage`, `refreshSpend`), `:1228-1267` (`refreshContext`), `:2138-2150` (`session.measure`), `:509-534` (`debugText`)
- Create: `hooks/signals.test.tsx`

**Interfaces:**
- Consumes: `mergeReading`, `keepLimits`, `Figures`, `Reading` from Task 2; `probe.sent`, `probe.polled` from Task 1.
- Produces: the atom `limitsKept` (`atom({ plugin: 'crab-buddy', key: 'limitsKept' } as const, null)`, value `KeptLimits`); `async function takeReading($: EngineInterface, sent?: Figures): Promise<Reading>` in `hooks/register.tsx`, which polls once, merges, stores what `keepLimits` returns and fills `probe` (`probe.polled` always; `probe.sent` only when `sent` is given, so a call without an event leaves the last event's record standing). `refreshContext($, sent?: Figures, isCountDue?: boolean)` now takes the whole event. Task 5 calls `takeReading`.

- [ ] **Step 1: Write the failing tests** in `hooks/signals.test.tsx`. Copy the `engine`, `start`, `crab` and `BAND` helpers from `hooks/tide.test.tsx:11-64`, with two changes: the fake poll takes `poll: 'full' | 'empty' | 'throws'` (`'empty'`: `{ startedAt, context: { window }, rateLimits: [] }`; `'throws'`: the hook throws), and `measure($, figures, changed = ['context'])` sends `{ ...figures, changed }`. Add `const band = async ($) => String((await (await $.ui.mount({ ...BAND, surface: 'desktop', props: { ...BAND.props } })).find({ type: 'Svg' }))?.props.source ?? '')`. Tests:

```ts
const PLAN = [{ kind: 'five_hour', percentUsed: 62, resetsAt: new Date(T0 + 3_600_000).toISOString() }]
const EVENT = { context: { tokens: 120_000, window: 200_000 }, rateLimits: PLAN, cost: { usd: 3.1 } }

test('with a poll that throws, the event alone raises the sea and stands the hourglass', async ($, on) => {
  engine(on, { poll: 'throws' }); await start($)
  const before = seaX(await band($))
  await measure($, EVENT)
  expect(seaX(await band($))).toBeLessThan(before)
  expect(await band($)).toContain('class="hourglass"')
})
test('with an empty poll, the event alone does the same', /* as above with poll: 'empty' */)
test('one reading with no limits leaves the hourglass standing', async ($, on) => {
  engine(on, { poll: 'empty' }); await start($)
  await measure($, EVENT)
  await measure($, { context: { tokens: 130_000, window: 200_000 }, rateLimits: [] })
  expect(await band($)).toContain('class="hourglass"')
  expect((await crab($, 'debug')).text).toContain('limits known from: kept')
})
test('limits the engine says have left take the hourglass away', async ($, on) => {
  engine(on, { poll: 'empty' }); await start($)
  await measure($, EVENT)
  await measure($, { context: { tokens: 130_000, window: 200_000 }, rateLimits: [] }, ['context', 'rateLimits'])
  expect(await band($)).not.toContain('class="hourglass"')
})
test('limits that leave for a reading and come back raise the 80% sign once', async ($, on) => {
  const toasts = engine(on, { poll: 'empty' }); await start($)   // test options: { signs: 'off' }
  const at82 = [{ ...PLAN[0], percentUsed: 82 }]
  await measure($, { ...EVENT, rateLimits: at82 }); await measure($, { ...EVENT, rateLimits: [] }); await measure($, { ...EVENT, rateLimits: at82 })
  expect(toasts.filter(t => t.startsWith('Usage limit at 82%'))).toHaveLength(1)
})
test('on API billing a cost that only the event carries fills the budget hourglass', { options: { budgetUsd: 10 } }, async ($, on) => {
  engine(on, { poll: 'empty' }); await start($)
  await measure($, { context: { tokens: 10_000, window: 200_000 }, rateLimits: [], cost: { usd: 4 } })
  expect((await crab($, 'stats')).text).toContain('spent $4.00 of $10')
})
```

  `seaX` is the regex `hooks/tide.test.tsx:70` uses. Options go in the test's second argument, as `hooks/assist.test.tsx:468` does; `signs: 'off'` is the `signs` option there.
- [ ] **Step 2: Run `claude plugin test .`** Expected: the new tests fail (the first on `toBeLessThan`: `refreshContext` returns when the poll fails), except "limits the engine says have left", which passes already and guards the change.
- [ ] **Step 3: Implement.** `takeReading` replaces the three direct `$.session.usage()` reads in `refreshContext`. `refreshContext` no longer returns early when the poll failed: it returns only when the reading has neither a size nor limits nor a cost. `refreshUsage` and `refreshSpend` take `reading.limits` and `reading.usd`. The idle mark at `hooks/register.tsx:1254` uses `reading.limits.length`. `probe.used` keeps its three words. `debugText` prints `reading.limitsFrom`.
- [ ] **Step 4: Run `claude plugin test .` and `scripts/validate.sh`.** Expected: 0 fail (the 23 tests of `hooks/tide.test.tsx` included), "No type errors."
- [ ] **Step 5: Commit.** `git add -A hooks && git commit -m "The sea, the hourglass and the cost go by whichever source has them"`

### Task 4: the hourglass says why it is absent

**Files:**
- Modify: `hooks/usage.ts` (new function), `hooks/legend.ts:16,53`, `hooks/register.tsx:1765-1773` (`/crab what`), `:509-534` (`debugText`)
- Test: `hooks/assist.test.tsx` (beside the hourglass tests from `:403`), `hooks/crab.test.tsx:3704-3712` (the `/crab what` test)

**Interfaces:**
- Produces: `export const noHourglass = (i: { isOff: boolean; hasLimits: boolean; budgetUsd: number; hasCost: boolean }): string | null` in `hooks/usage.ts`. In this order: `isOff`: `'switched off (/crab hourglass on)'`; `hasLimits`, or `budgetUsd > 0 && hasCost`: `null` (an hourglass stands); `hasCost` (a cost is known, no limit window is, no budget is set): `'no usage limit reported, as on API billing (budgetUsd sets a budget to count down)'`; else `'no usage limit reported yet'`. The third string does not claim API billing: a subscription whose limits never arrive looks the same from here, which is the bug this plan is about.

- [ ] **Step 1: Write the failing tests.** Pure, in `hooks/assist.test.tsx`: the four return values above, one assertion per branch, and `budgetUsd: 10` with `hasCost: false` giving `'no usage limit reported yet'`. In `hooks/crab.test.tsx`, in the `/crab what` test, with no limits and no budget: `expect(quiet).toContain('No hourglass: no usage limit reported yet.')`.
- [ ] **Step 2: Run `claude plugin test .`** Expected: both fail.
- [ ] **Step 3: Implement.** `legend.ts` gains `noHourglass?: string | null` on its input and the line `No hourglass: ${why}.` when set. `debugText` uses the same function for the line Task 1 added.
- [ ] **Step 4: Run `claude plugin test .` and `scripts/validate.sh`.** Expected: 0 fail, "No type errors."
- [ ] **Step 5: Commit.** `git commit -am "/crab what and /crab debug say why there is no hourglass"`

### Task 5: the campfire knows a subscription, and lights from a counted sea

**Files:**
- Modify: `hooks/cache.ts` (new function), `hooks/register.tsx:1122-1146` (`cacheTtl`, `feedFire`), `:2142-2148` (`session.measure`), `:1096-1105` (`refreshUsage`, to call the correction)
- Test: `hooks/cache.test.tsx`, `hooks/signals.test.tsx`

**Interfaces:**
- Consumes: `takeReading` and the atom `limitsKept` from Task 3.
- Produces: `export const retimed = (c: Cache, ttl: { ms: number; why: TtlWhy }, now: number): Cache` in `hooks/cache.ts`: when `c` is set, `c.why === 'api'`, `ttl.why === 'subscription'` and `now < c.at + ttl.ms`, the same cache with `ttlMs: ttl.ms`, `why: ttl.why`, `nudged: false`, `coldTipped` removed and `fire: fireOf(...)`; otherwise `c` itself (same reference). `c.at` never changes.

- [ ] **Step 1: Write the failing tests.** In `hooks/cache.test.tsx`:

```ts
test('a fire lit as an API key becomes a subscription\'s, from when it was lit', () => {
  const lit: NonNullable<Cache> = { at: T0, ttlMs: TTL_5M, why: 'api', tokens: 60_000, model: 'm', nudged: true, fire: 'ashes' }
  const hour = retimed(lit, { ms: TTL_1H, why: 'subscription' }, T0 + 10 * 60_000)
  expect(hour).toMatchObject({ at: T0, ttlMs: TTL_1H, why: 'subscription', nudged: false, fire: 'blaze' })
  expect(retimed(lit, { ms: TTL_1H, why: 'subscription' }, T0 + TTL_1H)).toBe(lit)
  expect(retimed({ ...lit, why: 'setting' }, { ms: TTL_1H, why: 'subscription' }, T0 + 1000)).toMatchObject({ why: 'setting' })
})
```

  In `hooks/signals.test.tsx`:

```ts
test('with no limits at the turn\'s end and limits a moment later, the fire lives an hour', async ($, on) => {
  engine(on, { poll: 'empty' }); await start($)
  await $.turn.complete(TURN)                     // lit on five minutes
  await measure($, { ...EVENT, rateLimits: PLAN }) // the plan shows itself
  expect((await crab($, 'cache')).text).toMatch(/60 min|an hour/)
})
test('a sea that goes by the local count still lights the fire when it grows', async ($, on) => {
  const ctx = engine(on, { poll: 'counted', counted: 40_000 }); await start($)
  await measure($, { context: { window: 200_000 }, rateLimits: [] })
  ctx.counted = 55_000
  await clock.advance(21_000)                      // past COUNT_EVERY_MS
  await measure($, { context: { window: 200_000 }, rateLimits: [] })
  expect(await band($)).toContain('class="cfire"')
})
```

  `poll: 'counted'` answers the plain call with no size and the `breakdown: 'summary'` call with `totalTokens: ctx.counted`, as `hooks/tide.test.tsx:40-45` does. Read the exact `/crab cache` wording from `cacheText` (`hooks/cache.ts:120-166`) and pin it instead of the regex.
- [ ] **Step 2: Run `claude plugin test .`** Expected: the three fail.
- [ ] **Step 3: Implement.** `cacheTtl($, limits?: readonly Limit[])` uses the limits it is given, else `(await takeReading($)).limits`. `refreshUsage` receives the reading's limits already: it ends by applying `retimed(cache, await cacheTtl($, limits), now)` to the `cache` atom and, when the result is another object, calling `keepCache` and `tendFire`. It never calls `takeReading` itself (that would poll again inside a poll). In `session.measure`, `hasGrown` drops its two `!isCounted` terms.
- [ ] **Step 4: Run `claude plugin test .` and `scripts/validate.sh`.** Expected: 0 fail, "No type errors."
- [ ] **Step 5: Commit.** `git commit -am "The campfire knows a subscription late, and lights from a counted sea"`

### Task 6: an hourglass that can be seen

**Files:**
- Modify: `hooks/scene.ts:468-484` (`hourglassSvg`), `:54-57` (two CSS classes for its outline, light and dark)
- Test: `hooks/assist.test.tsx` (beside `:409`)

**Interfaces:**
- Produces: `hourglassSvg(used: number): string`, unchanged in signature. The `<g class="hourglass">` and the `class="trk"` grain keep their names: `hooks/assist.test.tsx:406` and `scripts/check-animations.ts` find them by those.

- [ ] **Step 1: Write the failing test** in `hooks/assist.test.tsx`:

```ts
test('the hourglass is big and dark enough to see', () => {
  const g = hourglassSvg(0.4)
  const xs = [...g.matchAll(/x="([\d.]+)"/g)].map(m => Number(m[1])), ys = [...g.matchAll(/y="([\d.]+)"/g)].map(m => Number(m[1]))
  expect(Math.max(...xs) - Math.min(...xs) + 1).toBeGreaterThanOrEqual(9)
  expect(Math.max(...ys) - Math.min(...ys) + 1).toBeGreaterThanOrEqual(12)
  expect(g).toContain('class="hgo"')            // the outline, themed in CSS
  expect(Math.min(...xs)).toBeGreaterThanOrEqual(0)
  expect(Math.max(...xs)).toBeLessThan(26)       // left of TRACK_MIN: it never stands in the crab's track
})
```

- [ ] **Step 2: Run `claude plugin test .`** Expected: fails on the width.
- [ ] **Step 3: Implement.** Redraw at 9 by 13 cells on the same footing (centred on the home shell, `HOME_SHELL_X = 14`), sand in proportion to `used` as today (red from 0.95), outline cells with `class="hgo"`: `#6E5A3C` on light, `#D9C9A3` under `@media (prefers-color-scheme: dark)`. Existing hourglass tests that count sand cells (`hooks/assist.test.tsx:409-470`) are updated to the new cell counts in the same step.
- [ ] **Step 4: Look at it.** Render widths 300, 725 and 1100 with `usage` 0.2, 0.6 and 0.96 through `sceneSvg`, as `scripts/make-demo.ts:28-36` builds its input, screenshot with Playwright at `deviceScaleFactor: 2` on both a light and a dark page background, and read the pictures. The fill must be tellable apart at the three values. Do not commit the script or the pictures.
- [ ] **Step 5: Run `claude plugin test .`, `scripts/validate.sh` and `bun scripts/check-animations.ts`.** Expected: 0 fail, "No type errors.", "0 failed".
- [ ] **Step 6: Commit.** `git commit -am "A bigger, darker hourglass"`

### Task 7: release 0.29.1

**Files:**
- Modify: `.claude-plugin/plugin.json` (`version`), `hooks/news.ts` (`VERSION` and the what's-new line), `CHANGELOG.md` (new section on top), `README.md` (only where it says where the hourglass or fire come from, if it does)

- [ ] **Step 1: Bump** both versions to `0.29.1`.
- [ ] **Step 2: Write the CHANGELOG section** in the voice of 0.28.1's, one bullet per user-visible change: the hourglass no longer disappears after a reading without limits; the fire lasts the hour on a subscription that shows itself late and lights where the sea is counted locally; the sea, hourglass and cost also take what each measurement carries; a bigger hourglass; `/crab debug` and `/crab what` say why there is no hourglass.
- [ ] **Step 3: Run all three checks.** `claude plugin test .`, `scripts/validate.sh`, `bun scripts/check-animations.ts`. Expected: 0 fail, "No type errors.", "0 failed".
- [ ] **Step 4: Commit and push.** `git commit -am "Signals from every source: hourglass kept, fire on time, a bigger hourglass (0.29.1)"`, then `git push -u origin <branch>`.
- [ ] **Step 5: Owner's step, a gate, before the branch is merged.** The owner installs the branch the way they install their own builds, runs three turns on the desktop app and in VS Code, and pastes `/crab debug` from each. Done means: on both, "going by" names a source, "limits known from" is not `none` on a subscription, and the owner sees sea, fire and hourglass. If not, the pasted outputs go into `hooks/fixtures/` and a new test in `hooks/signals.test.tsx` reproduces what they show before anything else changes.
