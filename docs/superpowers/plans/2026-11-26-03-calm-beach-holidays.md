# Calm Beach and Holidays (0.30.0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A beach where no decoration ever stands on a signal, at most 3 to 5 pieces of decoration show by the strip's width, one unlocked item is on show at a time, and one holiday object with a matching costume appears only in its period.

**Architecture:** Two new pure modules. `hooks/holidays.ts` answers "which holiday is it here, today" from the date, the time zone and the user's setting. `hooks/decor.ts` answers "which pieces of decoration does this strip draw" from the width, the shoreline, the layout, the unlock on show and the holiday, by rank, cap and keep-clear zones. The planner (`hooks/life.ts`), the picture (`hooks/scene.ts`) and the terminal (`hooks/terminal.ts`) all ask `decor.ts`, so they never disagree. One geometry test checks every drawn piece against every zone.

**Tech Stack:** TypeScript, the Claude Code plugin engine (`claude-code`, `claude-code/testing`), no dependencies. Tests: `claude plugin test .`. Types: `scripts/validate.sh`. Animations: `bun scripts/check-animations.ts`.

**Spec:** `docs/superpowers/specs/2026-11-26-reliable-signals-calm-beach-design.md`, Part C. In code the word is `holiday`, because `season` already means spring to winter (`hooks/sky.ts:9`). Do Plans 01 and 02 first: Plan 01 changes the hourglass's size, which the home zone here must hold.

## Global Constraints

- No package.json, no new dependencies. Nothing new is sent anywhere: the time zone is read on the machine, as `hooks/weather.ts:102` does.
- `hooks/news.ts` `VERSION` equals `.claude-plugin/plugin.json` `version`: both become `0.30.0` in Task 9 and nowhere earlier.
- Nothing a user earned is removed: shells, tiers and what each tier is on that install (`layoutOf`) stay as stored.
- A picture is at most 131,072 characters. The budgets of Plan 02 (`hooks/budget.test.tsx`) hold.
- A holiday object is at most 12 px wide and 14 px tall. Out of its period it is not drawn.
- Cap: under 500 px 2 pieces, 500 to 899 px 3, 900 px and wider 5. Rank: holiday, unlock, pebble, seaweed, pool, props. A strip's pieces are the first few by rank among those that exist today and stand clear of the fixed zones (home, campfire, sign, tide mark) and of every higher-ranked piece. The shoreline's zone then only takes away, and nothing takes the place of a piece it took.
- Today's gates stay: unlocked items and costume props only on strips of 500 px and wider (`ROOMY`).
- Keep-clear zones, at every width from 200 to 1600 px: home (left edge to `TRACK_MIN`), campfire (its 11 px plus 3 px each side, 14 px high), sign (post plus 2 px each side; under the plank at most 8 px high), shoreline (12 px either side; floating things excepted), tide mark (12 px either side).
- A piece that would enter a zone or overlap a higher-ranked piece is not drawn in that picture. It is never moved.
- Region by time zone. US: `America/New_York`, `America/Detroit`, `America/Chicago`, `America/Menominee`, `America/Denver`, `America/Boise`, `America/Phoenix`, `America/Los_Angeles`, `America/Anchorage`, `America/Juneau`, `America/Sitka`, `America/Metlakatla`, `America/Yakutat`, `America/Nome`, `America/Adak`, `Pacific/Honolulu`, and any zone starting `America/Indiana/`, `America/Kentucky/` or `America/North_Dakota/`. DACH: `Europe/Berlin`, `Europe/Busingen`, `Europe/Vienna`, `Europe/Zurich`.
- Sky effects for a holiday: New Year's fireworks 22:00 to 02:00 only. Halloween's bats and its second pumpkin go.
- A costume the user picked always wins over a holiday's.
- Every task ends with `claude plugin test .` at 0 fail and `scripts/validate.sh` printing "No type errors." Tasks that draw end with `bun scripts/check-animations.ts` printing "0 failed".
- Commit messages follow the repo's: one plain sentence, no prefix.

## Review Focus

1. A session open across midnight into or out of a holiday: the object and costume change with the next segment, without a restart. Test in Task 2.
2. A machine with no usable time zone, or one outside both lists: only the "everyone" holidays, no error. Test in Task 1.
3. A user whose pick for `/crab show` is a tier they have not earned, or a stored value that is no tier: the highest earned tier shows. Test in Task 5.
4. A full tide (shoreline at 43% of the width) on a 500 px strip: no piece left half in the water, and the crab never plans a walk to a landmark that is not drawn. Test in Task 6.
5. 29 February, and Easter in the years of its extremes (22 March 2285, 25 April 2038): the calendar holds. Test in Task 1.

---

### Task 1: `hooks/holidays.ts`, the calendar

**Files:**
- Create: `hooks/holidays.ts`, `hooks/holidays.test.tsx`

**Interfaces:**
- Produces:

```ts
export type Holiday = 'newyear' | 'valentine' | 'karneval' | 'easter' | 'july4' | 'oktoberfest' | 'halloween' | 'thanksgiving' | 'nikolaus' | 'christmas' | null
export type HolidayMode = 'auto' | 'us' | 'de' | 'all' | 'off'
export const HOLIDAY_MODES: readonly HolidayMode[]
/** Easter Sunday of that year, local midnight (Gregorian computus). */
export const easterOf = (year: number): Date
export const regionOf = (zone: string | undefined): 'us' | 'de' | null
/** The holiday on that local date. Where two meet, the one with the shorter period. */
export const holidayAt = (d: Date, mode: HolidayMode, zone?: string): Holiday
/** Its costume on that date, or null: on the days named below for halloween and christmas, else through the whole period. */
export const holidayCostume = (h: Holiday, d: Date): Costume | null
export const HOLIDAY_NAME: Record<NonNullable<Holiday>, string>   // 'New Year', "Valentine's Day", 'Karneval', 'Easter', 'the 4th of July', 'Oktoberfest', 'Halloween', 'Thanksgiving', 'Nikolaus', 'Christmas'
export const modeOf = (stored: unknown): HolidayMode               // anything else: 'auto'
```

  Periods (local dates, inclusive) and who sees them, from the spec: newyear 31 Dec and 1 Jan, all; valentine 14 Feb, all; karneval Easter minus 52 to minus 47 days, de; easter Easter minus 2 to plus 1, all; july4 4 Jul, us; oktoberfest 20 Sep to 5 Oct, all; halloween 25 to 31 Oct, all; thanksgiving the fourth Thursday of November to the Sunday after, us; nikolaus 6 Dec, de; christmas 1 to 26 Dec, all. Costumes: newyear `partyhat`, valentine `cupid`, karneval `jester`, easter `bunny`, july4 `unclesam`, oktoberfest `oktoberfest` (whole period, as today), halloween `ghost` on 31 Oct only, thanksgiving `pilgrim`, nikolaus `santa`, christmas `santa` on 24 to 26 Dec only. Mode `us` or `de` forces that region, `all` shows both, `off` returns null, `auto` uses `regionOf(zone)`.

- [ ] **Step 1: Write the failing tests** in `hooks/holidays.test.tsx`:

```ts
const on = (y: number, m: number, d: number, mode: HolidayMode = 'auto', zone = 'Europe/Berlin') => holidayAt(new Date(y, m - 1, d, 12), mode, zone)
test('Easter by the computus', () => {
  for (const [y, m, d] of [[2025, 4, 20], [2026, 4, 5], [2027, 3, 28], [2038, 4, 25], [2285, 3, 22]]) expect([easterOf(y).getMonth() + 1, easterOf(y).getDate()]).toEqual([m, d])
})
test('each holiday on its days and not the day before or after', () => {
  expect([on(2026, 12, 30), on(2026, 12, 31), on(2027, 1, 1), on(2027, 1, 2)]).toEqual([null, 'newyear', 'newyear', null])
  expect([on(2027, 2, 13), on(2027, 2, 14), on(2027, 2, 15)]).toEqual([null, 'valentine', null])
  expect([on(2027, 2, 3), on(2027, 2, 4), on(2027, 2, 9), on(2027, 2, 10)]).toEqual([null, 'karneval', 'karneval', null])
  expect([on(2027, 3, 25), on(2027, 3, 26), on(2027, 3, 29), on(2027, 3, 30)]).toEqual([null, 'easter', 'easter', null])
  expect([on(2026, 9, 19), on(2026, 9, 20), on(2026, 10, 5), on(2026, 10, 6)]).toEqual([null, 'oktoberfest', 'oktoberfest', null])
  expect([on(2026, 10, 24), on(2026, 10, 25), on(2026, 10, 31), on(2026, 11, 1)]).toEqual([null, 'halloween', 'halloween', null])
  expect([on(2026, 11, 30), on(2026, 12, 1), on(2026, 12, 26), on(2026, 12, 27)]).toEqual([null, 'christmas', 'christmas', null])
})
test('US and German holidays go by the time zone, and the setting overrides it', () => {
  const us = 'America/Chicago'
  expect([on(2026, 11, 25, 'auto', us), on(2026, 11, 26, 'auto', us), on(2026, 11, 29, 'auto', us), on(2026, 11, 30, 'auto', us)]).toEqual([null, 'thanksgiving', 'thanksgiving', null])
  expect(on(2027, 11, 25, 'auto', us)).toBe('thanksgiving')
  expect(on(2026, 11, 26)).toBe(null)
  expect(on(2026, 7, 4, 'auto', us)).toBe('july4')
  expect(on(2026, 7, 4)).toBe(null)
  expect(on(2026, 12, 6)).toBe('nikolaus')
  expect(on(2026, 12, 6, 'auto', us)).toBe('christmas')
  expect(on(2026, 7, 4, 'us')).toBe('july4')
  expect(on(2026, 12, 6, 'all', us)).toBe('nikolaus')
  expect(on(2026, 12, 24, 'off')).toBe(null)
  for (const zone of [undefined, '', 'UTC', 'Asia/Tokyo', 'America/Toronto']) expect([holidayAt(new Date(2026, 6, 4, 12), 'auto', zone), holidayAt(new Date(2026, 11, 24, 12), 'auto', zone)]).toEqual([null, 'christmas'])
  expect([regionOf('America/Indiana/Knox'), regionOf('Pacific/Honolulu'), regionOf('Europe/Vienna'), regionOf('Pacific/Auckland')]).toEqual(['us', 'us', 'de', null])
})
test('where two meet, the shorter one has the day', () => {
  expect(on(2021, 2, 14)).toBe('valentine')   // inside Karneval 11 to 16 Feb 2021
  expect(on(2021, 2, 15)).toBe('karneval')
})
test('a costume through a short holiday, and on the named days of a long one', () => {
  const c = (y: number, m: number, d: number, zone = 'Europe/Berlin') => { const day = new Date(y, m - 1, d, 12); return holidayCostume(holidayAt(day, 'auto', zone), day) }
  expect([c(2026, 12, 1), c(2026, 12, 23), c(2026, 12, 24), c(2026, 12, 26)]).toEqual([null, null, 'santa', 'santa'])
  expect([c(2026, 10, 25), c(2026, 10, 31)]).toEqual([null, 'ghost'])
  expect([c(2026, 9, 25), c(2027, 3, 27), c(2026, 12, 6), c(2026, 11, 27, 'America/Denver'), c(2027, 2, 14), c(2027, 2, 8), c(2026, 7, 4, 'America/Denver'), c(2026, 12, 31)])
    .toEqual(['oktoberfest', 'bunny', 'santa', 'pilgrim', 'cupid', 'jester', 'unclesam', 'partyhat'])
  expect(c(2028, 2, 29)).toBe(null)
})
test('a stored mode is one of the five, or auto', () => {
  expect(['us', 'de', 'all', 'off', 'auto', 'fr', 7, null].map(modeOf)).toEqual(['us', 'de', 'all', 'off', 'auto', 'auto', 'auto', 'auto'])
})
```

- [ ] **Step 2: Run `claude plugin test .`** Expected: `hooks/holidays.test.tsx` fails, module not found. The costume names are not in `Costume` yet: add the six names to `types/index.d.ts:2-4` in this task so the file type-checks. Task 3 gives them their drawings.
- [ ] **Step 3: Implement `hooks/holidays.ts`.** All date work in local calendar days (`new Date(y, m, d)`), never in milliseconds across a DST change.
- [ ] **Step 4: Run `claude plugin test .` and `scripts/validate.sh`.** Expected: `hooks/holidays.test.tsx` passes. `scripts/validate.sh` reports type errors for the `Record<Costume, ...>` tables (`hooks/sprites.ts:18,103`, `hooks/gadgets.ts:33`, `hooks/life.ts:194`, `hooks/lines.ts:112`) missing six keys: do Task 3 before committing either.

### Task 2: the beach asks the calendar

**Files:**
- Modify: `hooks/sky.ts:8-25,55` (drop `Holiday` and `holiday()`, `skyFor` takes the holiday), `hooks/register.tsx:25,325-338,980` (`costumeAt`, `wornAt`, `themeAt`, the greeting), `:1596` (`view`), the `/crab` command switch (`holidays`, near `case 'pulse'`), `hooks/state.ts` (`KEY.holidays: 'holidayMode'`), `hooks/lines.ts:112-138`, `hooks/scene.ts:192-197` (bats go)
- Test: `hooks/crab.test.tsx:313-351,1606-1672` (the holiday tests there move to the new names), `hooks/e2e.test.tsx`

**Interfaces:**
- Consumes: everything Task 1 produces.
- Produces:
  - `hooks/sky.ts`: `export type Sky = { season: Season; holiday: Holiday; moon: number; weather: Weather; isWindy: boolean }` with `Holiday` imported from `./holidays`; `skyFor(ms: number, weather?: Weather, isWindy?: boolean, holiday: Holiday = null): Sky`.
  - `hooks/register.tsx`: `let holidayMode: HolidayMode = 'auto'` (loaded with the other choices in `loadChoices`), `const holidayNow = (now: number): Holiday => holidayAt(new Date(now), holidayMode, zoneHere())`, where `zoneHere()` is the reader `hooks/weather.ts:102` already has, exported. `costumeAt(now)` returns `holidayCostume(holidayNow(now), new Date(now)) ?? costumeOfDay(...)`.
  - `/crab holidays [auto|us|de|all|off]`: sets and stores the mode, starts a new segment, and answers in one sentence naming the mode and today's holiday if any. With no word it only answers.

- [ ] **Step 1: Write the failing tests.** Move the assertions of `hooks/crab.test.tsx:313-351` and `:1636-1672` to `holidayAt`/`skyFor(ms, 'clear', false, holiday)`. Add:

```ts
test('no bats on Halloween, fireworks on New Year\'s Eve', () => {
  expect(skySvg(new Date(2026, 9, 31, 21))).not.toMatch(/class="bat"/)
  expect(skySvg(new Date(2026, 11, 31, 23, 50))).toMatch(/class="fw"/)
})
test('a session open across midnight takes the holiday up with its next segment', async ($, on) => {
  // clock at 30 Nov 2026 23:59, zone Europe/Berlin: alt text has no holiday; advance 2 min and submit a prompt: /crab what names Christmas
})
test('/crab holidays off takes the object and the costume away at once, and on brings them back', async ($, on) => {
  // 24 Dec 2026: costume santa; /crab holidays off: the day's costume; /crab holidays auto: santa. The store holds the mode.
})
test('a costume you picked stays on through a holiday', ...)   // 24 Dec, /crab pirate: pirate
```

  The fake engine sets the zone the way `hooks/weather.test.tsx` does for its time zone tests.
- [ ] **Step 2: Run `claude plugin test .`** Expected: the new tests fail.
- [ ] **Step 3: Implement** as the Interfaces block says. `themeName` and `themeLine` (`hooks/lines.ts:133-138`) take the `Holiday` and use `HOLIDAY_NAME`: `"<name>"` when the holiday's costume is worn, `"<name>, <costume> day"` otherwise. Add a `THEME_LINES`-style greeting per holiday, at most 34 characters each (the limit `hooks/crab.test.tsx:1648` checks).
- [ ] **Step 4: Run `claude plugin test .`.** Expected: 0 fail. `scripts/validate.sh` still waits for Task 3.

### Task 3: six holiday costumes

**Files:**
- Modify: `hooks/sprites.ts:15,18-36,103` (`SPECIAL_COSTUMES`, `ACCENT`, `DRAW`), `hooks/gadgets.ts:33` (`SPECS`), `hooks/life.ts:194-207` (`RIDES`), `hooks/lines.ts:50-65,112-130` (ride lines, `THEME_LINES`), `scripts/check-animations.ts` (one scenario per new costume, as the existing costumes have)
- Test: `hooks/crab.test.tsx` (beside "on Halloween it wears a ghost sheet", `:1606`)

**Interfaces:**
- Consumes: the six names added to `Costume` in Task 1.
- Produces: `DRAW.partyhat`, `.cupid`, `.jester`, `.bunny`, `.unclesam`, `.pilgrim`: each `crabBody(f, eyes)` plus one `stamp` over it, in the manner of `santa` (`hooks/sprites.ts:151-155`), the eyes left uncovered. Each new costume's `SPECS`, `RIDES` and ride-line entries are the `plain` costume's own objects (`SPECS.bunny = SPECS.plain` and so on): holiday costumes ride the plain crab's gadget. All six join `SPECIAL_COSTUMES`, so `/crab bunny` picks one, as `/crab santa` does.

- [ ] **Step 1: Write the failing test:**

```ts
test('each holiday costume draws its own hat over the crab, and rides the plain crab\'s gadget', () => {
  const plain = crab('plain', 'idle', {})
  for (const c of ['partyhat', 'cupid', 'jester', 'bunny', 'unclesam', 'pilgrim'] as const) {
    const drawn = crab(c, 'idle', {})
    expect(drawn.length).toBeGreaterThan(plain.length)
    expect(drawn).toContain(ACCENT_OF[c])
    expect(RIDES[c]).toBe(RIDES.plain)
    expect(isCostume(c)).toBe(true)
  }
})
```

  `ACCENT_OF` is `ACCENT`, exported for the test.
- [ ] **Step 2: Run `claude plugin test .`** Expected: fails.
- [ ] **Step 3: Implement.** Accents: partyhat `#E8577A`, cupid `#E8577A`, jester `#7F77DD`, bunny `#F4F3EE`, unclesam `#378ADD`, pilgrim `#3A3936`.
- [ ] **Step 4: Look at them.** Render each costume in poses `idle`, `walk` and `nap` at 4 times its size with Playwright (`deviceScaleFactor: 2`) and read the picture: the hat must sit on the shell, not float or cover the eyes. Do not commit the script or the pictures.
- [ ] **Step 5: Run `claude plugin test .`, `scripts/validate.sh`, `bun scripts/check-animations.ts`.** Expected: 0 fail, "No type errors.", "0 failed".
- [ ] **Step 6: Commit Tasks 1 to 3 together.** `git add -A hooks types scripts && git commit -m "A calendar of holidays by time zone, and a costume for each"`

### Task 4: `hooks/decor.ts`, what a strip draws

**Files:**
- Create: `hooks/decor.ts`, `hooks/decor.test.tsx`
- Modify: `hooks/life.ts:57-60` (`shownTier` beside `hasDecor`)

**Interfaces:**
- Consumes: `DECOR`, `ROOMY`, `hasDecor`, `Layout`, `spots`, `TRACK_MIN`, `MARK_SHORE`, `NO_CONTEXT_SHORE` from `hooks/life.ts`; `Holiday` from `hooks/holidays.ts`.
- Produces:

```ts
// hooks/life.ts
export type Tier = keyof typeof DECOR
/** The tier on show: the pick if earned, else the highest earned; null on a strip under ROOMY or with none earned. */
export const shownTier = (shells: number, width: number, pick?: unknown): Tier | null

// hooks/decor.ts
export type Piece = 'holiday' | 'unlock' | 'pebble' | 'seaweed' | 'pool' | 'props'
export const RANK: readonly Piece[]                    // in the order above
export const capOf = (width: number): 2 | 3 | 5
export const FIRE_W = 11                                // moved here from hooks/scene.ts:487, re-exported there
export const HOLIDAY_W = 12
export type Span = { x0: number; x1: number; h: number; floats?: boolean }   // px; h: height above the ground
export type Zone = { name: 'home' | 'fire' | 'sign' | 'shore' | 'mark'; x0: number; x1: number; under: number }   // under: a piece no taller may stay
export const SIGN_AT = 0.38                             // the planted sign's post, as hooks/scene.ts:867 places it
export const zonesOf = (width: number, shore: number): Zone[]
/** The holiday object's left edge, or null where this strip has no room for it. */
export const holidayX = (width: number): number | null
/** The campfire's left edge: moved here from hooks/scene.ts:495, clear of the holiday spot. */
export const fireX = (width: number): number
export type DecorInput = { width: number; shore: number; own: Layout; tier: Tier | null; holiday: Holiday; costume: Costume }
/** Where each piece would stand, before any rule: null when there is none (no holiday today, no tier, a costume with no props). */
export const spanOf = (piece: Piece, i: DecorInput): Span | null
/** The pieces this strip draws, in rank order: the first `capOf(width)` by rank that exist and clear the fixed zones and each higher piece, less those the shore zone reaches. */
export const piecesOf = (i: DecorInput): ReadonlySet<Piece>
```

  `zonesOf` returns all five zones whether or not a fire burns or a sign stands: the ground is theirs. The `shore` zone is `Math.round(width * shore) ± 12`; a `Span` with `floats` ignores it. The `sign` zone has `under: 8`, the others `under: 0`.

- [ ] **Step 1: Write the failing tests** in `hooks/decor.test.tsx`:

```ts
const base = (over: Partial<DecorInput> = {}): DecorInput => ({ width: 725, shore: NO_CONTEXT_SHORE, own: layoutOf(), tier: null, holiday: null, costume: 'plain', ...over })
test('the cap by width', () => { expect([200, 499, 500, 899, 900, 1600].map(capOf)).toEqual([2, 2, 3, 3, 5, 5]) })
test('by rank, up to the cap', () => {
  expect([...piecesOf(base())]).toEqual(['pebble', 'seaweed', 'pool'])
  expect([...piecesOf(base({ tier: 'palm' }))]).toEqual(['unlock', 'pebble', 'seaweed'])
  expect([...piecesOf(base({ tier: 'palm', holiday: 'christmas' }))]).toEqual(['holiday', 'unlock', 'pebble'])
  expect([...piecesOf(base({ width: 1100, tier: 'palm', holiday: 'christmas', costume: 'pirate' }))]).toEqual(['holiday', 'unlock', 'pebble', 'seaweed', 'pool'])
  expect([...piecesOf(base({ width: 1100, costume: 'pirate' }))].slice(0, 3)).toEqual(['pebble', 'seaweed', 'pool'])
  expect(piecesOf(base({ width: 420, tier: 'palm', holiday: 'easter' })).size).toBeLessThanOrEqual(2)
})
test('a piece the sea has reached is not drawn, and the next in rank does not take its place over the cap', () => {
  const full = piecesOf(base({ shore: 0.43 }))
  for (const p of ['pebble', 'seaweed', 'pool'] as const) expect(full.has(p)).toBe(false)
  expect([...piecesOf(base({ width: 1100, shore: 0.6, tier: 'palm', holiday: 'christmas', costume: 'pirate' }))]).toEqual(['holiday', 'unlock', 'pebble'])   // five ranked before the props: the tide took two of them, and the props still do not move up
})
test('no piece in a zone, none over a higher-ranked one, at any width, tide, layout, tier, holiday or costume', () => {
  for (const width of [200, 300, 420, 500, 725, 900, 1200, 1600]) for (const shore of [0.92, 0.8, 0.685, 0.55, 0.43]) for (const n of LAYOUTS)
    for (const tier of [null, 'palm', 'chair', 'house', 'boat'] as const) for (const holiday of [null, 'christmas', 'thanksgiving', 'oktoberfest'] as const) for (const costume of ['plain', 'pirate', 'dj'] as const) {
      const i = { width, shore, own: layoutOf(n, 0), tier, holiday, costume }
      const drawn = [...piecesOf(i)].map(p => [p, spanOf(p, i)!] as const)
      for (const [, s] of drawn) for (const z of zonesOf(width, shore)) expect(s.x1 <= z.x0 || s.x0 >= z.x1 || s.h <= z.under || (z.name === 'shore' && !!s.floats)).toBe(true)
      for (const [a, sa] of drawn) for (const [b, sb] of drawn) if (RANK.indexOf(a) < RANK.indexOf(b)) expect(sa.x1 <= sb.x0 || sa.x0 >= sb.x1).toBe(true)
    }
})
test('the holiday spot and the campfire never touch, and both are right of the home zone', () => {
  for (let width = 200; width <= 1600; width += 25) {
    const h = holidayX(width), f = fireX(width)
    expect(f).toBeGreaterThanOrEqual(TRACK_MIN)
    if (h !== null) { expect(h).toBeGreaterThanOrEqual(TRACK_MIN); expect(h + HOLIDAY_W + 3 <= f || h >= f + FIRE_W + 3).toBe(true) }
  }
})
test('the tier on show', () => {
  expect([shownTier(4, 725), shownTier(5, 725), shownTier(45, 725), shownTier(45, 725, 'palm'), shownTier(12, 725, 'boat'), shownTier(45, 725, 'nonsense'), shownTier(45, 420)])
    .toEqual([null, 'palm', 'boat', 'palm', 'chair', 'boat', null])
})
```

  `LAYOUTS` is 30 of the numbers `hooks/crab.test.tsx:589` makes.
- [ ] **Step 2: Run `claude plugin test .`** Expected: `hooks/decor.test.tsx` fails, module not found.
- [ ] **Step 3: Implement.** Each piece's `Span` comes from one table of extents in `hooks/decor.ts` (the width and height of each tier's item for that layout, of the seaweed, the pool, the pebble, and of each costume's props), anchored on `spots(width, shore, own)`. Take the extents from the drawings as they are (`hooks/scene.ts:284-415`). Task 6 checks the table against the drawings. On a roomy strip `holidayX` is `Math.round(width * 0.12)` and `fireX` starts at least `HOLIDAY_W + 3` right of it; on a narrow one the holiday object stands between the campfire's zone and the sandcastle when 12 px are free there, else `holidayX` is null.
- [ ] **Step 4: Run `claude plugin test .` and `scripts/validate.sh`.** Expected: 0 fail, "No type errors."
- [ ] **Step 5: Commit.** `git add hooks/decor.ts hooks/decor.test.tsx hooks/life.ts && git commit -m "What a strip draws: by rank, up to a cap, clear of the signals"`

### Task 5: one unlocked item on show, and `/crab show`

**Files:**
- Modify: `types/index.d.ts:93-125` (`Segment`), `hooks/state.ts` (`KEY.show: 'decorShown'`), `hooks/register.tsx` (where a segment is built, `startSegment` near `:644`; `loadChoices`; the command switch; the help text `:462-480`; `debugText`), `hooks/life.ts:266,400` (the planner)
- Test: `hooks/e2e.test.tsx`, `hooks/crab.test.tsx`

**Interfaces:**
- Consumes: `shownTier`, `Tier` from Task 4.
- Produces: `Segment.show?: Tier` (the tier on show when the segment began) and `Segment.holiday?: NonNullable<Holiday>`; `/crab show [palm|chair|house|boat|latest]`. With no word: `"On show: <item>. Earned: <items>. /crab show <tier> picks another."`, or `"Nothing to show yet: the first comes at 5 shells."`. A tier not earned: `"Not yet: the <tier> comes at <n> shells (you have <m>)."`. The planner uses `seg.show === 'chair'` wherever it reads `hasDecor('chair', ...)` today.

- [ ] **Step 1: Write the failing tests:**

```ts
test('with everything earned the beach shows the boat alone, and /crab show palm shows the palm alone', async ($, on) => {
  // store: 45 shells. band source: boat art present, no house, no palm, no chair. /crab show palm: palm art present, no boat. The store holds 'palm'.
})
test('/crab show for a tier not earned says when it comes and changes nothing', ...)   // 12 shells, /crab show boat
test('/crab show latest goes back to the highest tier', ...)
test('the crab sunbathes only with the chair on show', () => {
  // planOf over 200 seeds with seg.show 'boat', shells 45, day: no beat with act 'sunbathe'; with seg.show 'chair': at least one
})
test('a stored pick that is no tier is ignored', ...)   // store 'decorShown': 'castle' → the boat shows
```

  Tell the items apart in the source by the colours and rows the existing test `hooks/crab.test.tsx:789-810` slices by.
- [ ] **Step 2: Run `claude plugin test .`** Expected: the new tests fail.
- [ ] **Step 3: Implement.** Scene and terminal are not changed here: they still draw every earned tier until Task 6. Only the segment, the command and the planner change.
- [ ] **Step 4: Run `claude plugin test .` and `scripts/validate.sh`.** Expected: the planner and command tests pass, the first test (what the band draws) still fails: it passes with Task 6. Do not commit yet.

### Task 6: the picture and the terminal draw what `decor.ts` says

**Files:**
- Modify: `hooks/scene.ts:201-212` (`holidayDecor` becomes `holidaySvg`), `:430-441` (`unlocked`), `:486-502` (`FIRE_W`, `fireX` now from `hooks/decor.ts`), `:561-573` (`habitat`), `hooks/terminal.ts:27-33` (`fireColumn`), `:300-340`, `hooks/life.ts:145-177` (`spots`, `stops`: a landmark not in `piecesOf` is undefined)
- Test: `hooks/crab.test.tsx:789-810` (rewritten), `hooks/decor.test.tsx`

**Interfaces:**
- Consumes: `piecesOf`, `spanOf`, `holidayX`, `fireX`, `zonesOf`, `DecorInput` from Task 4; `Segment.show`, `Segment.holiday` from Task 5.
- Produces: `export const holidaySvg = (h: NonNullable<Holiday>, x: number, tod: TimeOfDay): string` in `hooks/scene.ts`, in this task drawing the three objects that exist (`halloween`: one pumpkin, lit in the evening and at night; `christmas`: the tree; `oktoberfest`: stein and pretzel cut from today's table at `hooks/scene.ts:338-345`) and an empty string for the rest. `habitat` and `unlocked` draw a piece only when `piecesOf` has it.

- [ ] **Step 1: Write the failing tests.** Replace `hooks/crab.test.tsx:789-810` with:

```ts
test('what is drawn is what decor.ts says, where it says', () => {
  for (const n of LAYOUTS.slice(0, 30)) for (const width of [300, 500, 725, 1200, 1600]) for (const shore of [0.92, 0.685, 0.43])
    for (const tier of [null, 'palm', 'chair', 'house', 'boat'] as const) for (const holiday of [null, 'halloween', 'christmas', 'oktoberfest'] as const) {
      const i = { width, shore, own: layoutOf(n, 0), tier, holiday, costume: 'plain' as const }
      const want = piecesOf(i)
      for (const piece of ['holiday', 'unlock', 'seaweed', 'pool', 'pebble'] as const) {
        const [left, right] = reach(pieceSvg(piece, i))          // '' when not drawn
        if (!want.has(piece)) { expect(pieceSvg(piece, i)).toBe(''); continue }
        const s = spanOf(piece, i)!
        expect(left).toBeGreaterThanOrEqual(s.x0); expect(right).toBeLessThanOrEqual(s.x1)
      }
    }
})
test('the campfire and the hourglass are never under anything', () => {
  // for the same grid with beach { fire: 'blaze', usage: 0.6, planted: 'cache cools in 1 min' }:
  // every rect of every decoration piece lies outside the fire's and the hourglass's own rects
})
test('the crab never walks to a landmark that is not drawn', () => {
  // planOf over 100 seeds at 500 px, shore 0.43, shells 45: no beat with act 'kick', 'sunbathe' or a fish jump from the pool
})
```

  `pieceSvg(piece, i)` is exported from `hooks/scene.ts` for the test: the one function `habitat` calls per piece. `reach` is `hooks/crab.test.tsx:745`.
- [ ] **Step 2: Run `claude plugin test .`** Expected: the three fail, with Task 5's band test.
- [ ] **Step 3: Implement.** Where an extent in `hooks/decor.ts` disagrees with a drawing, fix the table, not the drawing. `hooks/terminal.ts` asks `piecesOf` for the same input scaled to its columns and draws the holiday's cells at `holidayX`: orange for the pumpkin, the tree's four cells as today, amber for the stein.
- [ ] **Step 4: Look at it.** Render 300, 500, 725 and 1200 px, each at shore 0.92, 0.685 and 0.43, with 45 shells, fire, hourglass and a planted sign, on 20 Nov and on 24 Dec, with Playwright at `deviceScaleFactor: 2`, and read the pictures: nothing touches the fire, the hourglass or the sign, and no strip looks empty. Do not commit the script or the pictures.
- [ ] **Step 5: Run `claude plugin test .`, `scripts/validate.sh`, `bun scripts/check-animations.ts`.** Expected: 0 fail, "No type errors.", "0 failed". The budgets of `hooks/budget.test.tsx` hold.
- [ ] **Step 6: Commit Tasks 5 and 6 together.** `git add -A hooks types && git commit -m "One unlocked item on show, a cap by width, and nothing on the signals"`

### Task 7: the seven new holiday objects

**Files:**
- Modify: `hooks/scene.ts` (`holidaySvg`), `hooks/terminal.ts` (the holiday's cells), `scripts/check-animations.ts` (one scenario per holiday)
- Test: `hooks/decor.test.tsx`, `hooks/crab.test.tsx`

**Interfaces:**
- Consumes: `holidaySvg`, `holidayX`, `HOLIDAY_W` from Tasks 4 and 6.
- Produces: `holidaySvg` drawing all ten. New: `newyear` a rocket in the sand, `valentine` a heart drawn in the sand, `karneval` a Krapfen with streamers, `easter` a nest of three painted eggs, `july4` a small flag on a stick, `thanksgiving` a turkey, `nikolaus` a boot with a candy cane.

- [ ] **Step 1: Write the failing test:**

```ts
test('every holiday has an object that fits its spot, in the picture and in the terminal', () => {
  for (const h of ['newyear', 'valentine', 'karneval', 'easter', 'july4', 'oktoberfest', 'halloween', 'thanksgiving', 'nikolaus', 'christmas'] as const) {
    const svg = holidaySvg(h, 100, 'day')
    const [left, right] = reach(svg)
    expect(svg).not.toBe('')
    expect(left).toBeGreaterThanOrEqual(100); expect(right).toBeLessThanOrEqual(100 + HOLIDAY_W)
    expect(Math.min(...[...svg.matchAll(/ y="(-?[\d.]+)"/g)].map(m => Number(m[1])))).toBeGreaterThanOrEqual(GROUND - 14)
    expect(cellsWith(h)).not.toEqual(cellsWith(null))            // the terminal strip differs from a day with no holiday
  }
})
```

  `cellsWith(h)` decodes a `beachCells` frame at 82 by 4 with `decodeCells` (`hooks/terminal.ts`), as `hooks/tide.test.tsx` does.
- [ ] **Step 2: Run `claude plugin test .`** Expected: fails at `newyear`.
- [ ] **Step 3: Implement.** Pixel rows through `pixels()` (`hooks/scene.ts:88`), as the tree is drawn. No new CSS class unless it animates; reuse `tw` for a twinkle.
- [ ] **Step 4: Look at them.** Render all ten at 725 px, day and night, with Playwright at `deviceScaleFactor: 2`, and read the picture: each must be recognisable at the strip's real size. Redraw what is not. Do not commit the script or the pictures.
- [ ] **Step 5: Run `claude plugin test .`, `scripts/validate.sh`, `bun scripts/check-animations.ts`.** Expected: 0 fail, "No type errors.", "0 failed".
- [ ] **Step 6: Commit.** `git commit -am "An object for every holiday"`

### Task 8: the words

**Files:**
- Modify: `hooks/legend.ts` (`Seen` gains `holiday: string | null` and `shown: string | null`), `hooks/register.tsx` (`/crab what` at `:1765`, `/crab help` at `:462-480`, the unknown-word line at `:2049`), `README.md` (a section "The beach" replacing what it says about unlocks, and "Holidays"), `docs/tester-note.md` if it lists what is on the beach
- Test: `hooks/crab.test.tsx:3704-3712` (the `/crab what` test), `hooks/e2e.test.tsx:1067` (help)

**Interfaces:**
- Produces: in `/crab what`, the lines `The <object>: it is <holiday name> (<first day> to <last day>). /crab holidays off hides it.` and `On show from your shells: the <item>. /crab show picks another.` Each only when that thing is drawn.

- [ ] **Step 1: Write the failing tests:** the two lines above on 24 Dec with 45 shells; neither on 20 Nov with 0 shells; `/crab help` contains `holidays` and `show`.
- [ ] **Step 2: Run `claude plugin test .`** Expected: fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `claude plugin test .` and `scripts/validate.sh`.** Expected: 0 fail, "No type errors."
- [ ] **Step 5: Commit.** `git commit -am "/crab what, help and the README know the holidays and the item on show"`

### Task 9: release 0.30.0

**Files:**
- Modify: `.claude-plugin/plugin.json` (`version`, and `description` if it lists what the beach holds), `hooks/news.ts`, `CHANGELOG.md`, `docs/screenshot.png` and `docs/demo.gif` (made again with `bun scripts/make-demo.ts`, since the beach looks different)

- [ ] **Step 1: Bump** both versions to `0.30.0`.
- [ ] **Step 2: Write the CHANGELOG section,** for users, in three groups as 0.29.0 has them: "A calmer beach" (nothing stands on the fire, the hourglass or a sign any more; fewer things at once, by the strip's width; one unlocked item on show, `/crab show` picks; nothing you earned is gone), "Holidays" (the list with dates; US and German ones by your time zone, sending nothing; `/crab holidays`), "Gone" (Halloween's bats and second pumpkin).
- [ ] **Step 3: Run all three checks.** Expected: 0 fail, "No type errors.", "0 failed".
- [ ] **Step 4: Commit and push.** `git commit -am "A calm beach, one item on show, and a holiday calendar (0.30.0)"`, then `git push -u origin <branch>`.
- [ ] **Step 5: Owner's step.** The owner looks at the beach on the desktop app and in VS Code at their usual widths, and runs `/crab holidays all` and `/crab what`. Done means: the fire, hourglass and sea are the first things the eye finds.
