# A Lighter Crab (0.29.2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut the work the crab does where nobody sees it: VS Code picture traffic to a quarter, no work behind a collapsed band or a resting terminal, lighter pictures, fewer engine calls at a turn's end.

**Architecture:** A budget test file measures bytes and engine calls through the real `register()` in the test harness and holds each figure under a ceiling. Each task first lowers one ceiling (the failing test), then makes it pass. The VS Code heartbeat gains a `smart` mode: a fresh picture per beat only while something moves across the beach, the kept picture nudged otherwise. Pictures carry only the CSS their elements use.

**Tech Stack:** TypeScript, the Claude Code plugin engine (`claude-code`, `claude-code/testing`), no dependencies. Tests: `claude plugin test .`. Types: `scripts/validate.sh`. Animations: `bun scripts/check-animations.ts` (needs Playwright and Chromium, about 3 min).

**Spec:** `docs/superpowers/specs/2026-11-26-reliable-signals-calm-beach-design.md`, Part B. Do Plan 01 first: both edit `refreshContext` and the `session.measure` handler.

## Global Constraints

- No package.json, no new dependencies.
- `hooks/news.ts` `VERSION` equals `.claude-plugin/plugin.json` `version`: both become `0.29.2` in Task 9 and nowhere earlier.
- A picture is at most 131,072 characters (`SVG_MAX`, `hooks/scene.ts:770`).
- No stop motion back in VS Code: while the crab walks or rides, a mark crosses, or the weather falls or blows (rain, storm, snow, wind), VS Code gets a fresh picture every beat, as today. Drifting clouds, stars and the lapping sea do not count as movement.
- Where a budget and a smooth walk conflict, the walk wins: the ceiling is set 3% above what was measured, and the commit message says so.
- `/crab pulse redraw` and `/crab pulse nudge` behave exactly as in 0.29.0 for anyone who set them.
- Reduce Motion behaviour is unchanged (`@media (prefers-reduced-motion: reduce)` stays in every picture).
- Budgets, from the spec: VS Code working 150 kB/s, VS Code awake and still 30 kB/s, terminal at rest 2 engine calls/s, `turn.complete` (main) 60 awaited engine calls, collapsed `AbovePrompt` render 4 engine calls, typical 725 px picture 42 kB. kB is 1,000 characters.
- Every task ends with `claude plugin test .` at 0 fail and `scripts/validate.sh` printing "No type errors." Tasks that touch `hooks/scene.ts`, `hooks/sprites.ts` or `hooks/css.ts` also end with `bun scripts/check-animations.ts` printing "0 failed".
- Commit messages follow the repo's: one plain sentence, no prefix.

## Review Focus

1. A VS Code window that was in the background (image clock slowed) while the crab stands still, then the crab starts to walk: fresh pictures must start with the walk's first beat, not a beat late. Test in Task 2.
2. A rule pruned from the CSS that an element gains only mid-animation (a class toggled by a keyframe, a `:not()` selector, the `windy` parent class): the animation check must still pass and the pruner must keep rules it cannot decide. Test in Task 6.
3. A terminal at rest when a turn starts: the painter wakes on the first event of the turn, not after the next render. Test in Task 3.
4. A band that is collapsed and then opened: the first open render draws the whole beach at once. Test in Task 4.
5. A hungry or sleepy crab at a nap: the need crossing its threshold still changes the picture, though the minute tick no longer writes every time. Test in Task 5.

---

### Task 1: the budget test, at today's ceilings

**Files:**
- Create: `hooks/budget.test.tsx`

**Interfaces:**
- Produces, inside `hooks/budget.test.tsx`: `counting(on: On): On` (wraps `on` so every engine hook registered through it is counted by event name), `calls(): number` (awaited engine calls since `reset()`), `pictures: string[]` (every `Svg` source handed to a surface, collected in the fake `ui.render` by walking the returned tree for `type: 'Svg'`), `blits: string[]`, `run(seconds: number, step?: (t: number) => Promise<void>): Promise<void>` (advances the mocked clock 100 ms at a time), and `const BUDGET` holding every ceiling. Later tasks only change numbers in `BUDGET` and add tests.

- [ ] **Step 1: Write the file.** The engine fake is the one in `hooks/tide.test.tsx:23-64` with `mock.clock(on, { now: T0 })`, `mock.store(on, { 'crab-buddy:shells': { count: 60, last: '' } })`, pass-through hooks for `state.get`, `state.set` and `ui.invalidate` (`(_, e, next) => next(e)`), and every hook registered through `counting`. Ceilings start just above what was measured on 2026-11-25:

```ts
const BUDGET = {
  turnCompleteCalls: 100,        // measured 96 to 99
  collapsedRenderCalls: 34,      // measured 32 to 33
  vscodeWorkingKbPerS: 760,      // measured 587 to 748
  vscodeStillKbPerS: 570,        // measured 555
  terminalRestCallsPerS: 115,    // measured 111
  picture725Kb: 58,              // measured 54 to 57
}
test('a main turn\'s end stays within its engine calls', ...)          // $.turn.complete(TURN) in a fresh session
test('a collapsed band stays within its engine calls', ...)            // one $.ui.mount with props.isCollapsed: true
test('VS Code while a turn runs stays within its bytes', ...)          // surface 'vscode', clear weather, turn started, 30 s, a tool call every 3 s
test('VS Code awake and still stays within its bytes', ...)            // surface 'vscode', clear weather, no turn, crab held in place (seg.hold via /crab pet), 30 s
test('a terminal at rest stays within its engine calls', ...)          // surface 'terminal', 16 min after the last turn, then 30 s
test('a typical 725 px picture stays within its size', ...)            // sceneSvg, mean over seeds 1 to 30, day, idle, 8 shells
```

- [ ] **Step 2: Run `claude plugin test .`** Expected: 0 fail. If a test fails, the ceiling is wrong, not the code: print the measured value, set the ceiling 3% above it, and note the figure in the commit message.
- [ ] **Step 3: Commit.** `git add hooks/budget.test.tsx && git commit -m "A budget test holds bytes and engine calls where they are today"`

### Task 2: VS Code sends fresh pictures only while something moves

**Files:**
- Modify: `hooks/life.ts` (new function, after `whereAt` at `:705`), `hooks/pulse.ts:14-22,35-62`, `hooks/register.tsx:1550-1568` (`pulsed`, `heartbeat`), `:462-480` (help text for `/crab pulse`)
- Test: `hooks/budget.test.tsx`, `hooks/crab.test.tsx` (beside the heartbeat tests, search "the heartbeat rests")

**Interfaces:**
- Produces:
  - `export const movesAt = (pl: Plan, t: number): boolean` in `hooks/life.ts`: true when the beat at `t` has `p0 !== p1` or a `y0`/`y1` that is not 0, or when a mark with `p0 !== p1` has `t0 <= t < t1`. `t` is ms since the segment started.
  - `export const skyMoves = (sky: Sky): boolean` in `hooks/sky.ts`: true for weather `rain`, `storm` or `snow`, or `isWindy`.
  - `hooks/pulse.ts`: `export type PulseMode = 'smart' | 'nudge' | 'redraw' | 'off'`, `DEFAULT_PULSE = { mode: 'smart', fps: MAX_FPS }`, `MODES` including `'smart'`, `pulseFrom('on', cur)` giving `smart`.
  - `hooks/register.tsx`: module variable `let lastMood: Mood = 'nap'`, set at the end of `view()`; Task 3 reads it.

- [ ] **Step 1: Lower the ceilings and write the failing tests.** In `BUDGET`: `vscodeWorkingKbPerS: 150`, `vscodeStillKbPerS: 30`. In `hooks/crab.test.tsx`:

```ts
test('movesAt: a walk, a ride off the ground and a crossing mark move, a pose held in place does not', () => {
  const pl = planOf({ ...SEG, hold: { pose: 'look', ms: 4000 } })
  expect(movesAt(pl, 1000)).toBe(false)
  const walk = pl.beats.find(b => b.p0 !== b.p1)!
  expect(movesAt(pl, (walk.t0 + walk.t1) / 2)).toBe(true)
  expect(movesAt({ ...pl, beats: [{ ...pl.beats[0]!, p1: pl.beats[0]!.p0, y0: 0, y1: 6 }], marks: [] }, 100)).toBe(true)
  expect(movesAt({ ...pl, beats: [{ ...pl.beats[0]!, p1: pl.beats[0]!.p0 }], marks: [{ kind: 'seagull', t0: 0, t1: 5000, p0: 0, p1: 1, dir: 1 }] }, 100)).toBe(true)
})
test('smart: in VS Code a still crab keeps its picture, and the walk\'s first beat sends a fresh one', async ($, on) => {
  // surface 'vscode'; /crab pet holds it in place; collect Svg sources per 100 ms beat
  // while held: at most 1 distinct source per 20 s (SCENE_KEEP_MS), heights alternate by 0.01 (the nudge)
  // from the first beat where movesAt is true: a distinct source on every beat
})
test('smart: rain keeps the fresh pictures coming while the crab stands', ...)   // weather 'rain': a distinct source on every beat
test('/crab pulse: redraw and nudge are still taken, on means smart, and the words name it', ...)
```

  `SEG` is the segment literal the file's other plan tests use.
- [ ] **Step 2: Run `claude plugin test .`** Expected: the two byte budgets and the new tests fail (the rain test passes already under `redraw` and guards the change).
- [ ] **Step 3: Implement.** `pulsed()` gains the mode `smart`: `{ height, keepMs: 0 }` when `movesAt(planOf(seg), now - seg.startAt)` for the segment in the `life` atom or `skyMoves` of the sky the last view had, else `{ height: nudged(height, beat), keepMs: undefined }`. `heartbeat()` replaces `(await view($, isTurnRunning)).mood === 'nap'` with `lastMood === 'nap'`. `pulseText` and the help line describe `smart` in one sentence each: "a fresh picture each beat while the crab is on the move, a nudge while it stands".
- [ ] **Step 4: Run `claude plugin test .` and `scripts/validate.sh`.** Expected: 0 fail, "No type errors."
- [ ] **Step 5: Commit.** `git commit -am "VS Code: fresh pictures only while the crab is on the move"`
- [ ] **Step 6: Owner's step, a gate.** The owner opens VS Code, puts the window in the background for a minute, brings it back and watches the crab walk. It must walk smoothly, as in 0.28.0. If it moves in jumps, `smart` is not enough on a slowed clock: set `DEFAULT_PULSE.mode` back to `'redraw'`, keep `smart` as an option, raise the two byte ceilings back, and tell the owner.

### Task 3: the terminal painter rests

**Files:**
- Modify: `hooks/register.tsx:1503-1527` (`startPainting`, `repaint`), and wherever `stirredAt` is set (search `stirredAt =`), to wake the painter
- Test: `hooks/budget.test.tsx`, `hooks/crab.test.tsx` (model: "the heartbeat rests once the session has been quiet a good while, and beats again when it stirs")

**Interfaces:**
- Consumes: `lastMood` from Task 2; `isAtRest(now)` (`hooks/register.tsx:1543`).
- Produces: `function wakePainter($: EngineInterface): void`, called where `stirredAt` is set and at `turn.start`.

- [ ] **Step 1: Lower the ceiling and write the failing test.** `terminalRestCallsPerS: 2`. In `hooks/crab.test.tsx`:

```ts
test('the terminal painter rests after a quarter of an hour of quiet, and paints again at once when a turn starts', async ($, on) => {
  // surface 'terminal'; after a turn, advance 16 min; count ui.blit over the next 30 s: 0
  // $.turn.start(...): at least one blit within 300 ms
})
```

- [ ] **Step 2: Run `claude plugin test .`** Expected: both fail.
- [ ] **Step 3: Implement.** `repaint` cancels the painter when `isAtRest(now)` (reading the clock, not the view), and skips three frames of four by `lastMood === 'nap'` before building a view. `wakePainter` starts it again when any raster is mounted.
- [ ] **Step 4: Run `claude plugin test .` and `scripts/validate.sh`.** Expected: 0 fail, "No type errors."
- [ ] **Step 5: Commit.** `git commit -am "The terminal beach rests when the session does"`

### Task 4: a collapsed band builds nothing

**Files:**
- Modify: `hooks/register.tsx:2264-2345` (the `AbovePrompt` render)
- Test: `hooks/budget.test.tsx`, `hooks/e2e.test.tsx` (search `isCollapsed`)

**Interfaces:**
- Produces: nothing new. When `e.props.isCollapsed === true` the handler returns `<Box flexDirection="column">{above}</Box>` after its three early checks and `next(e)`, before `view()`. It still deletes the request's raster (`rasters.delete(e.requestId)`) and does not start the pulse.

- [ ] **Step 1: Lower the ceiling and write the failing test.** `collapsedRenderCalls: 4`. In `hooks/e2e.test.tsx`:

```ts
test('a collapsed band draws no beach, and opening it draws the whole beach at once', async ($, on) => {
  // mount with isCollapsed: true: no Svg and no Raster in the tree
  // mount again with isCollapsed: false: an Svg whose source contains 'class="sea"'
})
```

- [ ] **Step 2: Run `claude plugin test .`** Expected: both fail. Existing tests that mount a collapsed band and look for an `Svg` are updated here to expect none.
- [ ] **Step 3: Implement** as the Interfaces block says.
- [ ] **Step 4: Run `claude plugin test .` and `scripts/validate.sh`.** Expected: 0 fail, "No type errors."
- [ ] **Step 5: Commit.** `git commit -am "A collapsed band builds no picture"`

### Task 5: a napping desktop keeps its picture

**Files:**
- Modify: `hooks/register.tsx:984-987` (`saveNeeds`)
- Test: `hooks/crab.test.tsx`

**Interfaces:**
- Produces: `saveNeeds($, n)` still writes the store every time. It updates the `needs` atom only when `Math.floor` of `food`, `fun` or `energy` differs from the atom's, or `isHungry`/`isSleepy` (the functions `view()` uses for the look) changed.

- [ ] **Step 1: Write the failing tests** in `hooks/crab.test.tsx`:

```ts
test('a napping crab on the desktop keeps one picture for five minutes', async ($, on) => {
  // desktop, night, no turn; collect Svg sources over 5 min of mocked clock in 1 s steps: 1 distinct source
})
test('a need crossing its line still changes the picture', async ($, on) => {
  // food just above the hungry line in the store; advance until tick takes it below; the alt text gains 'hungry'
})
```

- [ ] **Step 2: Run `claude plugin test .`** Expected: the first fails (about 7 distinct sources), the second passes already and guards the change.
- [ ] **Step 3: Implement** as the Interfaces block says.
- [ ] **Step 4: Run `claude plugin test .` and `scripts/validate.sh`.** Expected: 0 fail, "No type errors."
- [ ] **Step 5: Commit.** `git commit -am "A napping crab is not redrawn every minute"`

### Task 6: a picture carries only the CSS it uses

**Files:**
- Create: `hooks/css.ts`, `hooks/css.test.tsx`
- Modify: `hooks/scene.ts:864-866` (where `<style>` is assembled)
- Test: `hooks/css.test.tsx`, `hooks/budget.test.tsx`

**Interfaces:**
- Produces: `export const pruneCss = (css: string, body: string): string` in `hooks/css.ts`. It keeps a rule when it cannot decide (a selector with no class, or with `:not(`), when any class in its selector occurs in a `class="..."` attribute of `body`, or when the selector's first class is a parent class (`windy`) that occurs. It keeps an `@keyframes` block only when a kept rule or an inline `style` in `body` names it. It keeps an `@media` block with its kept rules, and drops it when none is kept. Parsed rules are cached per `css` string.

- [ ] **Step 1: Lower the ceiling and write the failing tests.** `picture725Kb: 42`. In `hooks/css.test.tsx`:

```ts
const CSS = `.a{fill:red;animation:spin 1s}.b{fill:blue;animation:hop 1s}@keyframes spin{to{transform:rotate(1turn)}}@keyframes hop{to{transform:none}}
@media (prefers-color-scheme: dark){.a{fill:#fff}.b{fill:#000}}*{box-sizing:border-box}.windy .c{animation:lean 2s}@keyframes lean{to{transform:skewX(4deg)}}.d:not(.e){opacity:.5}@keyframes late{to{opacity:0}}`
test('rules, keyframes and media blocks go when nothing in the picture uses them', () => {
  const out = pruneCss(CSS, '<g class="x a"/><rect style="animation:late 1s"/>')
  expect(out).toContain('.a{fill:red;animation:spin 1s}')
  expect(out).toContain('@keyframes spin')
  expect(out).toContain('@media (prefers-color-scheme: dark){.a{fill:#fff}}')
  expect(out).toContain('*{box-sizing:border-box}')
  expect(out).toContain('.d:not(.e){opacity:.5}')
  expect(out).toContain('@keyframes late')
  for (const gone of ['.b{', '@keyframes hop', '.windy .c', '@keyframes lean']) expect(out).not.toContain(gone)
})
test('a parent class in the picture keeps its descendants\' rules', () => {
  expect(pruneCss(CSS, '<g class="windy"><g class="c"/></g>')).toContain('@keyframes lean')
})
test('a class name that is only part of another is not a use', () => {
  expect(pruneCss('.sw{a:b}', '<g class="sw2"/>')).toBe('')
})
```

- [ ] **Step 2: Run `claude plugin test .`** Expected: `hooks/css.test.tsx` fails (module not found), the picture budget fails.
- [ ] **Step 3: Implement `hooks/css.ts`,** then in `draw` (`hooks/scene.ts`) build the body first and wrap the static blocks and the per-picture CSS in `pruneCss(css, body)`. The `@media (prefers-reduced-motion: reduce)` line is appended after pruning, always.
- [ ] **Step 4: Run `claude plugin test .`, `scripts/validate.sh` and `bun scripts/check-animations.ts`.** Expected: 0 fail, "No type errors.", "0 failed". If the 42 kB budget is missed with the animation check green, set the ceiling to what was reached plus 3%, and say so in the commit message: the budget is a target.
- [ ] **Step 5: Commit.** `git add hooks/css.ts hooks/css.test.tsx hooks/scene.ts hooks/budget.test.tsx && git commit -m "A picture carries only the CSS it uses"`

### Task 7: the last fallback is checked

**Files:**
- Modify: `hooks/scene.ts:779-785` (`sceneSvg`), `:786` (`draw` gains a third parameter)
- Test: `hooks/crab.test.tsx` (beside the test that mentions `SVG_MAX`)

**Interfaces:**
- Produces: `draw(s: SceneInput, prints: number, isBare = false)`: with `isBare` the picture has no `skyFront` layer (rain, snow, leaves, fireflies) and no footprints. `sceneSvg` returns `draw(s, 0, true)` when `draw(s, 0)` is still longer than `SVG_MAX`.

- [ ] **Step 1: Write the failing test:**

```ts
test('no picture is ever longer than the engine draws', () => {
  // 600 states: widths 300 to 1600, storm on New Year's Eve and on Halloween, 60 shells, every costume, a 34-character bubble, fire, hourglass, sign, 3 rods
  // and one forced case: a bubble of 34 'W' and work: 400 entries
  for (const s of states) expect(sceneSvg(s).length).toBeLessThanOrEqual(SVG_MAX)
})
```

- [ ] **Step 2: Run `claude plugin test .`** Expected: the forced case fails. If it does not fail, grow `work` until `draw(s, 0)` exceeds `SVG_MAX`, so the test proves the fallback.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `claude plugin test .`, `scripts/validate.sh`, `bun scripts/check-animations.ts`.** Expected: 0 fail, "No type errors.", "0 failed".
- [ ] **Step 5: Commit.** `git commit -am "The barest picture is checked for length too"`

### Task 8: fewer engine calls at a turn's end

**Files:**
- Modify: `hooks/register.tsx`: `:1122-1132` (`cacheTtl`), `:625` (`traces`), `:990` (`currentNeeds`), `:2094-2135` (`turn.complete`), `session.start` (`:1794` onward)
- Test: `hooks/budget.test.tsx`

**Interfaces:**
- Produces:
  - `let ttlInputs: { force5m: unknown; env: unknown; setting: unknown; enable1h: unknown } | null = null`, read once by `cacheTtl` and set to null at `session.start`.
  - `async function once<T>(memo: Map<unknown, unknown>, key: unknown, load: () => Promise<T>): Promise<T>`, and an optional `memo` parameter on `traces` and `currentNeeds`. The `turn.complete` handler makes one `Map` and passes it down, so each store key is read once in that handler. A write through `saveNeeds` or the traces' setters replaces the memo's entry.

- [ ] **Step 1: Lower the ceiling.** `turnCompleteCalls: 60`. Add one guard test:

```ts
test('a setting changed between sessions is read again at the next start', async ($, on) => {
  // promptCacheTtl '5m' at first start, '1h' after session.end and a second session.start: /crab cache names the hour
})
```

- [ ] **Step 2: Run `claude plugin test .`** Expected: the turn budget fails (96 to 99), the guard passes or fails depending on today's behaviour: note which.
- [ ] **Step 3: Implement** as the Interfaces block says. Count again after each change with the budget test's printed figure. If 60 is not reached with reads of state that must stay fresh (anything read after an `await next(e)` or after an update in the same handler), stop at what is safe, set the ceiling 3% above it and say so in the commit message.
- [ ] **Step 4: Run `claude plugin test .` and `scripts/validate.sh`.** Expected: 0 fail, "No type errors."
- [ ] **Step 5: Commit.** `git commit -am "A turn's end reads each thing once"`

### Task 9: release 0.29.2

**Files:**
- Modify: `.claude-plugin/plugin.json`, `hooks/news.ts`, `CHANGELOG.md`, `README.md` (the `/crab pulse` paragraph), `.github/workflows/test.yml` (nothing to add: `claude plugin test .` already runs `hooks/budget.test.tsx`; confirm in the run's log)

- [ ] **Step 1: Bump** both versions to `0.29.2`.
- [ ] **Step 2: Write the CHANGELOG section,** for users: VS Code sends a fresh picture only while the crab is on the move (with the before and after figures the budget test printed, named as measured in tests), `/crab pulse redraw` brings the old way back; the terminal beach rests after a quarter of an hour; a collapsed band costs nothing; lighter pictures; nothing new to learn.
- [ ] **Step 3: Run all three checks.** Expected: 0 fail, "No type errors.", "0 failed".
- [ ] **Step 4: Commit and push.** `git commit -am "A lighter crab: VS Code, the terminal at rest, a collapsed band (0.29.2)"`, then `git push -u origin <branch>`.
