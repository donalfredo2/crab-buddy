import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import type { On } from 'claude-code'

import type { Segment } from '../types'
import { RIDES, activityStarts, hasDecor, plan, planOf, rideFits, shoreFrac, spots, trackSpan, whereAt, xOf } from './life'

import { line, themeLine, themeName } from './lines'
import { care, cooldownLeft, freshNeeds, petMood, rest, tick } from './pet'
import { KING_SHELLS, cleanName, costumeAt, dayKey, isClosedByYou, nextCastle, nextShells, reactionTo, stripWidth, tankSize, terminalColumns, terminalTankRows, themeAt, wornAt } from './register'
import { sceneSvg, timeOfDay } from './scene'
import { holiday, moonLit, moonPhase, season, skyFor, weatherOf } from './sky'
import { COSTUMES, SPECIAL_COSTUMES, costumeOfDay } from './sprites'
import { beachCells, beachPixels, cellText, decodeCells } from './terminal'

const DAY = 86_400_000
const MIN = 60_000
// Local times, so day and night do not depend on where the tests run.
const at = (hour: number, minute = 0) => new Date(2026, 9, 29, hour, minute).getTime()
const T0 = at(12)
const BAND = {
  plugin: 'crab-buddy',
  component: 'AbovePrompt',
  requestId: 'above-prompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const
const SURFACES = ['terminal', 'desktop', 'vscode', 'mobile'] as const
const RUN = { origin: { kind: 'user' }, presentation: { isFullscreen: false, columns: 100 } } as never

const TURN = { answer: 'hi', durationMs: 1000, isAborted: false, turnId: 't1' } as const

// Stands for the engine beneath the plugin, recording toasts and sounds.
// A blit is denied unless a test says a terminal beach stays mounted, as after an unmount.
function engine(on: On, ctx: { percent: number | null; isPlaced?: boolean; isBlitOk?: boolean } = { percent: null }) {
  const isPlaced = ctx.isPlaced ?? true
  const toasts: string[] = []
  const sounds: unknown[] = []
  const panes: string[] = []
  const blits: { requestId: string; cells: string }[] = []
  on('command.register', () => ({ value: { command: 'crab' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('command.run', () => ({ text: '' }))
  on('prompt.submit', (_, e) => ({ text: e.text }) as never)
  on('session.usage', () => ({ value: { startedAt: T0, context: { window: 1_000_000, percent: ctx.percent ?? undefined }, rateLimits: [] } }) as never)
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('audio.play', (_, e) => {
    sounds.push(e)
    return { value: undefined }
  })
  on('ui.blit', (_, e) => {
    blits.push(e as { requestId: string; cells: string })
    return { value: ctx.isBlitOk ? {} : { deny: 'not mounted' } } as never
  })
  on('ui.panes', () => ({ value: panes.map(id => ({ id, title: id, isShown: isPlaced, isFocused: false, isPlaced })) }) as never)
  on('ui.open', (_, e) => {
    if (!panes.includes((e as { id: string }).id)) panes.push((e as { id: string }).id)
    return { value: isPlaced ? { isPlaced } : { isPlaced, reason: 'no surface places panes' } } as never
  })
  on('ui.close', (_, e) => {
    const i = panes.indexOf((e as { id: string }).id)
    if (i >= 0) panes.splice(i, 1)
    return { value: undefined } as never
  })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  return { toasts, sounds, panes, blits }
}

type Tester = Parameters<TestBody>[0]

const start = ($: Tester) => $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
const crab = ($: Tester, args: string) => $.command.run({ command: 'crab', args, ...(RUN as object) } as never)

async function band($: Tester, isWorking = false): Promise<{ alt: string; source: string }> {
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: { ...BAND.props, isWorking } })
  const svg = await ui.find({ type: 'Svg' })
  await ui.unmount()
  return { alt: String(svg?.props.alt ?? ''), source: String(svg?.props.source ?? '') }
}
const alt = async ($: Tester, isWorking = false) => (await band($, isWorking)).alt

// --- pure parts

test('the costume holds for a day and changes the next', () => {
  const noon = T0
  expect(costumeOfDay(noon, 0)).toBe(costumeOfDay(noon + DAY / 4, 0))
  expect(costumeOfDay(noon, 0)).not.toBe(costumeOfDay(noon + DAY, 0))
  const week = new Set(Array.from({ length: COSTUMES.length }, (_, i) => costumeOfDay(noon + i * DAY, 0)))
  expect(week.size).toBe(COSTUMES.length)
})

test('shell commands map to reactions', () => {
  expect(reactionTo('git add . && git commit -m "x"', false)).toBe('party')
  expect(reactionTo('git -C ~/dev/x commit -m y', true)).toBe(null)
  expect(reactionTo('git -c user.name=a -c user.email=b commit -q -m "x"', false)).toBe('party')
  expect(reactionTo('git --no-pager -C repo commit --amend', false)).toBe('party')
  expect(reactionTo('git log --grep commit', false)).toBe(null)
  expect(reactionTo('"/Applications/x/claude" plugin test ~/dev/crab-buddy', false)).toBe('cool')
  expect(reactionTo('npm test', true)).toBe('nervous')
  expect(reactionTo('pnpm run test -- --watch=false', false)).toBe('cool')
  expect(reactionTo('pytest -q', true)).toBe('nervous')
  expect(reactionTo('npm run build', false)).toBe('cool')
  expect(reactionTo('npm run build', true)).toBe(null)
  expect(reactionTo('ls -la', false)).toBe(null)
})

test('needs fade while open, never below 10, and a gap is not counted', () => {
  const n = freshNeeds(T0)
  const hourLater = Array.from({ length: 12 }, (_, i) => i + 1).reduce((m, i) => tick(m, T0 + i * 5 * MIN, { isWorking: false, isLate: false }), n)
  expect(Math.round(hourLater.food)).toBe(75)
  expect(Math.round(hourLater.energy)).toBe(90)
  // A weekend away counts as five minutes at most.
  const weekend = tick(n, T0 + 2 * DAY, { isWorking: false, isLate: false })
  expect(weekend.food).toBeGreaterThan(79)
  const starved = tick({ ...n, food: 10.2, fun: 10.1 }, T0 + 5 * MIN, { isWorking: false, isLate: false })
  expect(starved.food).toBe(10)
  expect(starved.fun).toBe(10)
})

test('working drains energy, twice as fast late; breaks and nights refill it', () => {
  const n = freshNeeds(T0)
  expect(Math.round(tick(n, T0 + 3 * MIN, { isWorking: true, isLate: false }).energy)).toBe(89)
  expect(Math.round(tick(n, T0 + 3 * MIN, { isWorking: true, isLate: true }).energy)).toBe(88)
  expect(rest({ ...n, energy: 30 }, 16 * MIN).energy).toBe(70)
  expect(rest({ ...n, energy: 30 }, 7 * 60 * MIN).energy).toBe(100)
  expect(rest({ ...n, energy: 30 }, 5 * MIN).energy).toBe(30)
})

test('care actions help and cool down', () => {
  const n = { ...freshNeeds(T0), food: 40, fun: 40 }
  const fed = care(n, 'feed', T0)
  expect(fed?.food).toBe(55)
  expect(fed && care(fed, 'feed', T0 + MIN)).toBe(null)
  expect(fed && cooldownLeft(fed, 'feed', T0 + MIN)).toBe(4 * MIN)
  const played = care(n, 'play', T0)
  expect(played?.fun).toBe(55)
  expect(played?.energy).toBe(85)
  expect(care(n, 'pet', T0)?.fun).toBe(45)
  expect(petMood({ ...n, food: 20 })).toBe('grumpy')
  expect(petMood(n)).toBe('ok')
  expect(petMood(freshNeeds(T0))).toBe('happy')
})

test('day, evening and night switch at 06, 09, 18 and 22', () => {
  expect(timeOfDay(5)).toBe('night')
  expect(timeOfDay(6)).toBe('morning')
  expect(timeOfDay(9)).toBe('day')
  expect(timeOfDay(17)).toBe('day')
  expect(timeOfDay(18)).toBe('evening')
  expect(timeOfDay(21)).toBe('evening')
  expect(timeOfDay(22)).toBe('night')
})

test('names are cleaned, lines filled in', () => {
  expect(cleanName('  Pinchy\u0007 the Great Crab of Lisbon ')).toBe('Pinchy the Great')
  expect(line('named', 0, { name: 'Pinchy' })).toBe('Pinchy! I like it')
  expect(line('long', 1, { name: 'x', time: '3m 2s' })).toMatch(/big one|3m 2s|done/)
})

const seg = (over: Partial<Segment> = {}): Segment => ({
  id: 1, seed: 42, startAt: T0, startP: 0.5, startFace: 1, mode: 'idle', width: 800, castle: 0, shells: 0,
  food: 80, fun: 60, energy: 80, timeOfDay: 'day', ...over,
})
const SEEDS = Array.from({ length: 60 }, (_, i) => i * 7919 + 13)
const count = (over: Partial<Segment>, act: string) =>
  SEEDS.reduce((n, seed) => n + activityStarts(plan(seg({ ...over, seed }))).filter(s => s.act === act).length, 0)

test('a segment plays the same plan every time, and never jumps', () => {
  expect(JSON.stringify(plan(seg()))).toBe(JSON.stringify(plan(seg())))
  expect(JSON.stringify(plan(seg()))).not.toBe(JSON.stringify(plan(seg({ seed: 43 }))))
  for (const seed of SEEDS) {
    const pl = plan(seg({ seed, startP: (seed % 100) / 100 }))
    expect(pl.beats[0]?.p0).toBe((seed % 100) / 100)
    pl.beats.forEach((b, i) => {
      const prev = pl.beats[i - 1]
      if (prev) {
        expect(b.t0).toBe(prev.t1)
        expect(b.p0).toBe(prev.p1)
      }
      expect(b.p1).toBeGreaterThanOrEqual(0)
      expect(b.p1).toBeLessThanOrEqual(1)
    })
    // The next segment starts where this one left it; mid-way too.
    const mid = whereAt(pl, pl.duration / 2)
    const next = plan(seg({ seed: seed + 1, startP: mid.p, startFace: mid.face }))
    expect(next.beats[0]?.p0).toBe(mid.p)
  }
})

test('calm pace: something new every 20 to 40 seconds, busier while Claude works, and lots of walking', () => {
  const gaps = (mode: Segment['mode']) => SEEDS.flatMap(seed => {
    const starts = activityStarts(plan(seg({ seed, mode })))
    return starts.slice(1).map((s, i) => s.t - (starts[i]?.t ?? 0))
  })
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
  const idle = mean(gaps('idle')) / 1000
  const work = mean(gaps('work')) / 1000
  expect(idle).toBeGreaterThan(20)
  expect(idle).toBeLessThan(45)
  expect(work).toBeLessThan(idle)
  const walked = SEEDS.reduce((n, seed) => n + plan(seg({ seed })).beats.filter(b => b.p0 !== b.p1).reduce((m, b) => m + b.t1 - b.t0, 0), 0)
  const total = SEEDS.reduce((n, seed) => n + plan(seg({ seed })).duration, 0)
  expect(walked / total).toBeGreaterThan(0.3)
  // Never the old sprint: idle walking stays a stroll.
  for (const b of plan(seg()).beats.filter(b => b.pose === 'wander')) {
    expect((Math.abs(b.p1 - b.p0) * (800 - 58)) / ((b.t1 - b.t0) / 1000)).toBeLessThan(33)
  }
})

test('its needs and the clock steer what it does', () => {
  expect(count({ food: 20 }, 'dig')).toBeGreaterThan(count({ food: 90 }, 'dig'))
  expect(count({ fun: 90 }, 'dance')).toBeGreaterThan(count({ fun: 50 }, 'dance'))
  expect(count({ fun: 20 }, 'kick')).toBeGreaterThan(count({ fun: 70 }, 'kick'))
  expect(count({ timeOfDay: 'night' }, 'sunbathe') + count({ timeOfDay: 'night' }, 'butterfly')).toBe(0)
  expect(count({ castle: 5 }, 'build')).toBe(0)
  const asleep = plan(seg({ mode: 'sleep', timeOfDay: 'night' }))
  expect(asleep.endP).toBe(0)
  expect(asleep.beats[asleep.beats.length - 1]?.pose).toBe('nap')
  const held = plan(seg({ hold: { pose: 'party', ms: 2600 } }))
  expect(held.beats[0]).toMatchObject({ pose: 'party', p0: 0.5, p1: 0.5, t1: 2600 })
})

test('castle stages and shells count once per segment; the tide clears the castle overnight', () => {
  const day = dayKey(T0)
  const one = nextCastle(undefined, day, 'a')
  expect(one?.stage).toBe(1)
  expect(nextCastle(one, day, 'a')).toBe(null)
  expect(nextCastle(one, day, 'b')?.stage).toBe(2)
  expect(nextCastle({ day, stage: 5, last: 'x' }, day, 'y')?.stage).toBe(5)
  expect(nextCastle({ day, stage: 4, last: 'x' }, dayKey(T0 + DAY), 'y')?.stage).toBe(1)
  const sh = nextShells(undefined, 'a')
  expect(sh?.count).toBe(1)
  expect(nextShells(sh, 'a')).toBe(null)
  expect(nextShells(sh, 'b')?.count).toBe(2)
})

test('the scene plays the plan across the strip, small enough, with day and night', () => {
  const base = { width: 600, costume: 'plain', look: {}, timeOfDay: 'day', bubble: null, now: T0 + 30_000, prop: null, sky: skyFor(T0), hour: 12, work: [] } as const
  const s = sceneSvg({ ...base, seg: seg({ width: 600 }) })
  expect(s).toMatch(/@keyframes mv\{/)
  expect(s).toMatch(/animation-delay:-30\.00s/)
  expect(s).not.toMatch(/<rect[^>]*fill="(#fff|white)"[^>]*width="600"/)
  const night = sceneSvg({ ...base, timeOfDay: 'night', seg: seg({ width: 600, mode: 'sleep', startP: 0, timeOfDay: 'night' }), now: T0 + 60_000 })
  expect(night).toMatch(/mask="url\(#moon\)"/)
  expect(night).toMatch(/class="z"/)
  expect(sceneSvg({ ...base, bubble: 'nom nom', seg: seg() })).toMatch(/nom nom/)
  for (const seed of SEEDS.slice(0, 20)) {
    const big = sceneSvg({ ...base, width: 1600, seg: seg({ seed, width: 1600, castle: 3, shells: 30 }), prop: 'hammer' })
    expect(big.length).toBeLessThan(120_000)
  }
  expect(sceneSvg({ ...base, seg: seg(), prop: 'hammer' })).toMatch(/class="pr-swing"/)
  expect(planOf(seg())).toBe(planOf(seg()))
})

test('seasons, holidays and the moon come from the date', () => {
  expect(season(new Date(2026, 9, 29))).toBe('autumn')
  expect(season(new Date(2026, 0, 10))).toBe('winter')
  expect(season(new Date(2026, 6, 1))).toBe('summer')
  expect(holiday(new Date(2026, 9, 31))).toBe('halloween')
  expect(holiday(new Date(2026, 9, 30))).toBe(null)
  expect(holiday(new Date(2026, 11, 25))).toBe('christmas')
  expect(holiday(new Date(2027, 0, 1))).toBe('newyear')
  // Known moons: full on 01-01-2026 (about 10:03 UTC), new on 17-02-2026 (about 12:01 UTC).
  expect(moonLit(moonPhase(Date.UTC(2026, 0, 3, 10)))).toBeGreaterThan(0.95)
  expect(moonLit(moonPhase(Date.UTC(2026, 1, 17, 12)))).toBeLessThan(0.05)
  expect(weatherOf(0)).toBe('clear')
  expect(weatherOf(3)).toBe('cloudy')
  expect(weatherOf(45)).toBe('fog')
  expect(weatherOf(63)).toBe('rain')
  expect(weatherOf(81)).toBe('rain')
  expect(weatherOf(73)).toBe('snow')
  expect(weatherOf(95)).toBe('storm')
})

test('the sky draws weather, seasons and holidays, staying small', () => {
  const base = { width: 900, costume: 'plain', look: {}, bubble: null, now: T0 + 30_000, prop: null, work: [] } as const
  const s = (sky: ReturnType<typeof skyFor>, timeOfDay: 'day' | 'evening' | 'night', hour: number) =>
    sceneSvg({ ...base, timeOfDay, hour, sky, seg: seg({ width: 900, timeOfDay }) })
  const rain = s({ ...skyFor(T0), weather: 'rain', isWindy: true }, 'day', 12)
  expect(rain).toMatch(/class="rain"/)
  expect(rain).toMatch(/class="umb"/)
  expect(rain).toMatch(/class="windy"/)
  expect(s({ ...skyFor(T0), weather: 'snow' }, 'day', 12)).toMatch(/class="flake"/)
  expect(s(skyFor(T0), 'day', 12)).toMatch(/class="leaf"/)
  expect(s(skyFor(T0), 'evening', 19)).toMatch(/fill="#F28C3A"/)
  const night = s(skyFor(at(23)), 'night', 23)
  expect(night).toMatch(/class="ff"/)
  expect(night).toMatch(/class="shoot"/)
  const halloween = s(skyFor(new Date(2026, 9, 31, 21).getTime()), 'evening', 21)
  expect(halloween).toMatch(/class="bat"/)
  expect(halloween).toMatch(/#E8822B/)
  const newYear = s(skyFor(new Date(2026, 11, 31, 23, 50).getTime()), 'night', 23.8)
  expect(newYear).toMatch(/class="fw"/)
  expect(s({ ...skyFor(T0), weather: 'storm', isWindy: true }, 'night', 23).length).toBeLessThan(150_000)
})

test('the sea creeps up the beach as the context fills, and the crab stays on the sand', () => {
  expect(Math.abs(shoreFrac(null, 0) - 0.92)).toBeLessThan(0.03)
  expect(Math.abs(shoreFrac(85, 0) - 0.45)).toBeLessThan(0.03)
  expect(shoreFrac(100, 0)).toBe(shoreFrac(85, 0))
  expect(shoreFrac(50, 0)).toBeLessThan(shoreFrac(10, 0))
  for (const seed of SEEDS) {
    const shore = 0.5
    const pl = plan(seg({ seed, shore, startP: 0.95 }))
    const sea = spots(800, shore).sea
    // It starts in the water once, then walks out and never goes back in.
    for (const b of pl.beats.slice(1)) expect(xOf(b.p1, 800) + 26).toBeLessThan(sea)
    expect(activityStarts(pl).some(a => a.act === 'sway')).toBe(false)
  }
  const s = sceneSvg({ width: 800, costume: 'plain', look: {}, timeOfDay: 'day', bubble: null, now: T0, prop: null, sky: skyFor(T0), hour: 12, work: ['hammer', 'scroll'], seg: seg({ shore: 0.5 }) })
  expect(s).toMatch(/class="sea"/)
  expect(s).not.toMatch(/class="pool"/)
  expect(s).toMatch(/fill="#B07A45"/)
})

test('big moments get a set piece across the strip', () => {
  const draw = (pose: 'party' | 'nervous' | 'wave' | 'cheer') =>
    sceneSvg({ width: 800, costume: 'plain', look: {}, timeOfDay: 'day', bubble: null, now: T0 + 500, prop: null, sky: skyFor(T0), hour: 12, work: [], seg: seg({ hold: { pose, ms: 2600 } }) })
  expect(plan(seg({ hold: { pose: 'party', ms: 2600 } })).marks.some(m => m.kind === 'fireworks')).toBe(true)
  expect(draw('party')).toMatch(/class="fw"/)
  expect(draw('nervous')).toMatch(/class="scloud"/)
  expect(draw('wave')).toMatch(/>done!</)
  const calm = draw('cheer')
  expect(calm).not.toMatch(/class="fw"|class="scloud"|>done!</)
})

test('shells unlock decor, each costume has its beach, and a friend visits', () => {
  expect(hasDecor('palm', 4, 900)).toBe(false)
  expect(hasDecor('palm', 5, 900)).toBe(true)
  expect(hasDecor('lighthouse', 25, 400)).toBe(false)
  const draw = (o: { costume?: 'pirate' | 'astronaut' | 'plain'; shells?: number; width?: number; timeOfDay?: 'day' | 'night'; first?: 'friend' }) =>
    sceneSvg({ width: o.width ?? 900, costume: o.costume ?? 'plain', look: {}, timeOfDay: o.timeOfDay ?? 'day', bubble: null, now: T0 + 1000, prop: null, sky: skyFor(T0), hour: 12, work: [],
      seg: seg({ width: o.width ?? 900, shells: o.shells ?? 0, timeOfDay: o.timeOfDay ?? 'day', ...(o.first ? { first: o.first } : {}) }) })
  const rich = draw({ shells: 25, timeOfDay: 'night' })
  expect(rich).toMatch(/#3E9E5A/)
  expect(rich).toMatch(/#D8433B/)
  expect(rich).toMatch(/class="beam"/)
  expect(draw({ shells: 25, width: 400 })).not.toMatch(/#3E9E5A|class="beam"/)
  expect(draw({ costume: 'pirate' })).toMatch(/#E6E2D6/)
  expect(draw({ costume: 'astronaut' })).toMatch(/class="crater"/)
  expect(draw({ costume: 'plain' })).not.toMatch(/class="crater"|#E6E2D6/)
  const visit = plan(seg({ first: 'friend' })).marks.find(m => m.kind === 'friend')
  expect(visit?.meet).toBeGreaterThan(visit?.t0 ?? 0)
  expect(draw({ first: 'friend' })).toMatch(/#5B8FD9/)
})

const ALL = [...COSTUMES, ...SPECIAL_COSTUMES]
const rideScene = (over: Partial<Segment>, extra: Partial<Parameters<typeof sceneSvg>[0]> = {}) => {
  const s = seg({ width: 900, first: 'ride', ...over })
  const first = plan(s).beats.find(b => b.pose === 'ride')
  return sceneSvg({ width: s.width, costume: s.ride ?? 'plain', look: {}, timeOfDay: s.timeOfDay, bubble: null, now: T0 + (first?.t0 ?? 0) + 500, prop: null, sky: skyFor(T0), hour: 12, work: [], seg: s, ...extra })
}

test('every costume rides its gadget, and the plan never jumps', () => {
  for (const ride of ALL) {
    expect(RIDES[ride]).toBeDefined()
    for (const seed of SEEDS.slice(0, 15)) {
      const s = seg({ seed, ride, width: 900, first: 'ride' })
      expect(JSON.stringify(plan(s))).toBe(JSON.stringify(plan(s)))
      const pl = plan(s)
      expect(pl.beats.some(b => b.pose === 'ride' && b.act === 'ride')).toBe(true)
      // Every beat picks up where the last one left off, on the sand and in the air.
      pl.beats.reduce((a, b) => {
        expect(Math.abs(a.p1 - b.p0)).toBeLessThan(1e-9)
        return b
      })
      const flying = pl.beats.filter(b => b.y0 !== undefined)
      for (const [i, b] of flying.entries()) {
        const next = flying[i + 1]
        if (next && next.t0 === b.t1) expect(next.y0).toBe(b.y1)
      }
      // It comes down and gets out before anything else happens.
      const end = pl.beats.findLastIndex(b => b.pose === 'ride')
      expect(pl.beats[end]?.y1 ?? 0).toBeLessThanOrEqual(0)
      expect(pl.beats[end + 1]?.pose).not.toBe('ride')
      expect(pl.marks.filter(m => m.kind === 'poof').length).toBeGreaterThan(0)
    }
  }
})

test('everything that walks does so in whole pixels, so a sprite keeps its shape', () => {
  for (const over of [{ ride: 'racer', first: 'ride' }, { ride: 'wizard', first: 'ride' }, { first: 'friend' }, { first: 'neighbour' }, { seed: 5 }] as Partial<Segment>[]) {
    const s = rideScene(over)
    const moving = [...s.matchAll(/translate[XY]\((-?[\d.]+)px\)/g)].map(m => m[1] ?? '')
    expect(moving.length).toBeGreaterThan(0)
    for (const v of moving) expect(v).toMatch(/^-?\d+$/)
    expect(s).toMatch(/\.mv\{animation:mv [\d.]+s linear/)
    expect(s).toMatch(/@keyframes mv\{.*animation-timing-function:steps\(\d+\)/)
  }
  // A step for each pixel crossed, so a fast car and a slow crab both land on every one.
  const pl = plan(seg({ width: 900, ride: 'racer', first: 'ride' }))
  const b = pl.beats.find(k => k.pose === 'ride' && k.p0 !== k.p1)
  const px = Math.abs(Math.round(xOf(b?.p1 ?? 0, 900)) - Math.round(xOf(b?.p0 ?? 0, 900)))
  expect(rideScene({ ride: 'racer' })).toMatch(new RegExp(`steps\\(${px}\\)`))
})

test('the gadgets draw small enough on every costume, in the day and at night', () => {
  for (const ride of ALL) {
    for (const timeOfDay of ['day', 'night'] as const) {
      const s = rideScene({ ride, timeOfDay, width: 1600, seed: 99, castle: 3, shells: 30 }, { prop: 'hammer', work: ['hammer'] })
      expect(s).toMatch(/class="mood ride"/)
      expect(s.length).toBeLessThan(120_000)
    }
  }
})

test('only the car has headlights, only after dark, and tools go away for the ride', () => {
  expect(rideScene({ ride: 'racer', timeOfDay: 'night' })).toMatch(/#FFF3B0" opacity="\.3"/)
  expect(rideScene({ ride: 'racer', timeOfDay: 'evening' })).toMatch(/#FFF3B0" opacity="\.3"/)
  expect(rideScene({ ride: 'racer' })).not.toMatch(/#FFF3B0" opacity="\.3"/)
  expect(rideScene({ ride: 'viking', timeOfDay: 'night' })).not.toMatch(/#FFF3B0" opacity="\.3"/)
  expect(rideScene({ ride: 'racer' }, { prop: 'hammer' })).toMatch(/@keyframes nr\{/)
  expect(rideScene({ ride: 'racer' }, { prop: 'hammer' })).toMatch(/class="nr" opacity="0"/)
  expect(rideScene({ ride: 'wizard' })).toMatch(/@keyframes ly\{/)
  expect(rideScene({ ride: 'racer' })).not.toMatch(/@keyframes ly\{/)
})

test('a ride cut short ends in a puff of dust, from where it was', () => {
  const pl = plan(seg({ seed: 3, ride: 'racer', width: 900, poof: true, startP: 0.4 }))
  const puff = pl.marks[0]
  expect(puff?.kind).toBe('poof')
  expect(puff?.t0).toBe(0)
  expect(Math.abs((puff?.p0 ?? 0) - 0.4)).toBeLessThan(1e-9)
  const mid = plan(seg({ seed: 3, ride: 'wizard', width: 900, first: 'ride' }))
  const flying = mid.beats.find(b => (b.y0 ?? 0) > 0 && b.y0 === b.y1)
  expect(whereAt(mid, ((flying?.t0 ?? 0) + (flying?.t1 ?? 0)) / 2).lift).toBe(11)
  expect(whereAt(mid, ((flying?.t0 ?? 0) + (flying?.t1 ?? 0)) / 2).pose).toBe('ride')
})

test('rides need room: a track, and water for the sub', () => {
  expect(trackSpan(220)).toBeLessThan(200)
  expect(rideFits(seg({ ride: 'racer', width: 220 }))).toBe(false)
  expect(rideFits(seg({ ride: 'racer', width: 900 }))).toBe(true)
  expect(rideFits(seg({ width: 900 }))).toBe(false)
  expect(rideFits(seg({ ride: 'dj', width: 220 }))).toBe(true)
  expect(rideFits(seg({ ride: 'astronaut', width: 220 }))).toBe(true)
  expect(rideFits(seg({ ride: 'diver', width: 300, shore: 0.94 }))).toBe(false)
  expect(rideFits(seg({ ride: 'diver', width: 900, shore: 0.92 }))).toBe(true)
  // Asked for where it can't: it looks around instead of driving through the wall.
  const stuck = plan(seg({ ride: 'racer', width: 220, first: 'ride' }))
  expect(stuck.beats.some(b => b.pose === 'ride')).toBe(false)
  expect(count({ width: 220, ride: 'racer' }, 'ride')).toBe(0)
  expect(count({ width: 900 }, 'ride')).toBe(0)
})

test('the sub goes in past the shore and comes back out; everything else stays on the beach', () => {
  const sea = spots(900, 0.8).sea
  const sub = plan(seg({ ride: 'diver', width: 900, shore: 0.8, first: 'ride' }))
  const under = sub.beats.filter(b => b.pose === 'ride')
  expect(Math.min(...under.map(b => xOf(b.p1, 900)))).toBeGreaterThan(sea)
  const i = sub.beats.findLastIndex(b => b.pose === 'ride')
  expect(xOf(sub.beats.at(-1)?.p1 ?? 1, 900) + 26).toBeLessThan(sea)
  expect(sub.beats[i + 2]?.p1).toBeLessThan(sub.beats[i]?.p1 ?? 0)
  for (const ride of ['racer', 'wizard', 'surfer'] as const) {
    for (const seed of SEEDS.slice(0, 10)) {
      const pl = plan(seg({ seed, ride, width: 900, shore: 0.8, first: 'ride', startP: 0.3 }))
      for (const b of pl.beats) expect(xOf(b.p1, 900) + 26).toBeLessThan(sea)
    }
  }
})

test('a ride comes along now and then, idle or working', () => {
  const rate = (mode: Segment['mode'], ride: Segment['ride'] = 'racer') => {
    const seeds = Array.from({ length: 900 }, (_, i) => i * 7919 + 13)
    let rides = 0
    let ms = 0
    for (const seed of seeds) {
      const pl = plan(seg({ seed, mode, ride, width: 900, shore: 0.8 }))
      rides += activityStarts(pl).filter(s => s.act === 'ride').length
      ms += pl.duration
    }
    return ms / rides / MIN
  }
  const idle = rate('idle')
  const work = rate('work')
  expect(idle).toBeGreaterThan(8)
  expect(idle).toBeLessThan(15)
  expect(work).toBeGreaterThan(5)
  expect(work).toBeLessThan(9)
  // The ones that start at the water come just as often, however far it has to walk.
  for (const ride of ['diver', 'surfer'] as const) {
    expect(rate('idle', ride)).toBeLessThan(15)
    expect(rate('work', ride)).toBeLessThan(10)
  }
})

test('every gadget has lines of its own, and no brand gets near them', () => {
  for (const ride of ALL) expect(line(`ride-${ride}`, 0, { name: 'x' })).not.toBe('')
  const words = ALL.flatMap(ride => [0, 1, 2].map(i => line(`ride-${ride}`, i, { name: 'x' }))).join(' ')
  expect(words).not.toMatch(/porsche|911|ferrari|lamborghini/i)
})

test('the terminal shows the gadget, and a rocket leaves the top', () => {
  const base = { columns: 80, rows: 3, timeOfDay: 'day', sky: skyFor(T0), bubble: null } as const
  const at = (ride: Segment['ride'], k: number) => {
    const s = seg({ ride, width: 900, first: 'ride' })
    const pl = plan(s)
    const beats = pl.beats.filter(b => b.pose === 'ride')
    const t = (beats[0]?.t0 ?? 0) + ((beats.at(-1)?.t1 ?? 0) - (beats[0]?.t0 ?? 0)) * k
    return beachPixels({ ...base, seg: s, costume: ride ?? 'plain', now: T0 + t }).px
  }
  const has = (px: number[], c: number) => px.includes(c)
  expect(has(at('racer', 0.5), 0x1d9e75)).toBe(true)
  expect(has(at('viking', 0.5), 0x8a5a2b)).toBe(true)
  expect(has(at('diver', 0.5), 0xf5c542)).toBe(true)
  // Up off the top: the rocket's white is gone from the raster.
  expect(has(at('astronaut', 0.05), 0xf4f3ee)).toBe(true)
  expect(has(at('astronaut', 0.55), 0xf4f3ee)).toBe(false)
})

// --- the mod in the engine

test('the crab naps, works, cheers, wanders, then naps again', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  await start($)

  expect(await alt($)).toMatch(/napping/)
  expect(await alt($, true)).toMatch(/working/)

  await $.turn.complete({ ...TURN, reason: 'answer' })
  expect(await alt($)).toMatch(/cheering/)

  await clock.advance(3000)
  expect(await alt($)).toMatch(/wandering/)

  await clock.advance(11 * MIN)
  expect(await alt($)).toMatch(/napping/)

  await $.turn.complete({ ...TURN, reason: 'error', isAborted: true })
  expect(await alt($)).toMatch(/dazed/)
})

test('at night it sleeps in a nightcap under the moon', async ($, on) => {
  mock.clock(on, { now: at(23, 30) })
  mock.store(on)
  engine(on)
  await start($)
  await $.turn.complete({ ...TURN, reason: 'answer' })
  const { source } = await band($)
  expect(await alt($)).toMatch(/cheering|napping/)
  expect(source).toMatch(/url\(#moon\)/)
})

test('a long task waves, toasts and chirps; a short one does not', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  const { toasts, sounds } = engine(on)
  await start($)

  await $.turn.complete({ ...TURN, reason: 'answer', durationMs: 30_000 })
  expect(toasts).toEqual([])
  expect(sounds.length).toBe(0)

  await $.turn.complete({ ...TURN, reason: 'answer', durationMs: 125_000 })
  expect(await alt($)).toMatch(/waving/)
  expect(toasts).toEqual(['Done after 2m 5s.'])
  expect(sounds.length).toBe(1)
  expect(JSON.stringify(sounds[0])).toMatch(/chirp\.wav/)
})

test('/crab sound off keeps the long-task toast but drops the chirp', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  const { toasts, sounds } = engine(on)
  await start($)
  await crab($, 'sound off')
  await $.turn.complete({ ...TURN, reason: 'answer', durationMs: 300_000 })
  expect(toasts).toEqual(['Done after 5m 0s.'])
  expect(sounds.length).toBe(0)
})

test('a subagent finishing does not make it cheer or wave', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  const { toasts } = engine(on)
  await start($)
  await $.turn.complete({ ...TURN, reason: 'answer', durationMs: 500_000, agentId: 'worker-1' })
  expect(await alt($)).toMatch(/napping/)
  expect(toasts).toEqual([])
})

test('the crab tires as context fills, and warns once near the top', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  const ctx = { percent: 20 as number | null }
  const { toasts } = engine(on, ctx)
  await start($)
  expect(await alt($)).not.toMatch(/tired|sweaty/)

  ctx.percent = 60
  await $.turn.complete({ ...TURN, reason: 'answer' })
  expect(await alt($)).toMatch(/tired/)

  ctx.percent = 90
  await $.turn.complete({ ...TURN, reason: 'answer' })
  expect(await alt($)).toMatch(/sweaty/)
  await $.turn.complete({ ...TURN, reason: 'answer' })
  expect(toasts.filter(t => /Context is/.test(t))).toEqual(['Context is 90% full. A fresh session soon would help.'])
})

test('the care buttons feed, play and pet on every surface, with cooldowns', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  await start($)
  const food = async () => Number(/food (\d+)/.exec(JSON.stringify(await crab($, 'stats')))?.[1])
  const before = await food()

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...BAND, surface })
    await ui.press({ key: 'crab-feed' })
    await ui.unmount()
    await clock.advance(6 * MIN)
  }
  expect(before).toBe(80)
  expect(await food()).toBe(100)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'crab-feed' })
  await ui.unmount()
  expect(await alt($)).toMatch(/eating/)
  expect(JSON.stringify(await crab($, 'feed'))).toMatch(/Still full/)
  expect((await band($)).source).toMatch(/still full!|maybe later|no room left/)

  await crab($, 'pet')
  expect(await alt($)).toMatch(/happy to be petted/)
  await clock.advance(4000)
  await crab($, 'play')
  expect(await alt($)).toMatch(/playing/)
})

test('it can be named, and unprompted bubbles are rate limited', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  on('tool.call', () => ({ result: { stdout: 'ok', stderr: '', interrupted: false }, isError: false }) as never)
  await start($)

  await crab($, 'name Pinchy')
  expect(await alt($)).toMatch(/^Pinchy the crab/)
  expect((await band($)).source).toMatch(/Pinchy! I like it|call me Pinchy/)
  await clock.advance(5000)

  await $.tool.call({ tool: 'Bash', command: 'git commit -m a' } as never)
  expect((await band($, true)).source).toMatch(/shipped it|commit!|history books|nice commit/)
  await clock.advance(5000)
  await $.tool.call({ tool: 'Bash', command: 'git commit -m b' } as never)
  expect((await band($, true)).source).not.toMatch(/class="bubble"/)

  await crab($, 'bubbles off')
  await crab($, 'pet')
  expect((await band($)).source).not.toMatch(/class="bubble"/)
})

test('no info or home buttons; /crab stats still reports the session', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on, { percent: 37 })
  on('tool.call', () => ({ result: { stdout: '', stderr: '', interrupted: false }, isError: false }) as never)
  await start($)
  await $.tool.call({ tool: 'Read', file_path: '/x' } as never)
  await $.turn.complete({ ...TURN, reason: 'answer' })
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ key: 'crab-info' })).toBeUndefined()
    expect(await ui.find({ key: 'crab-home' })).toBeUndefined()
    expect(await ui.find({ key: 'crab-feed' })).toBeDefined()
    await ui.unmount()
  }
  expect(JSON.stringify(await crab($, 'stats'))).toMatch(/1 turns · 1 tool calls · context 37% · food \d+/)
  expect(JSON.stringify(await crab($, 'home'))).toMatch(/Unknown option/)
})

test('commits party, failing tests make it nervous, and the result passes through', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  on('tool.call', (_, e) => {
    const command = String((e as { command?: unknown }).command)
    const isError = /npm test/.test(command)
    return { result: { stdout: isError ? '1 failing' : 'ok', stderr: '', interrupted: false }, isError } as never
  })
  await start($)

  const commit = await $.tool.call({ tool: 'Bash', command: 'git commit -m "wip"' } as never)
  expect(JSON.stringify(commit)).toMatch(/"ok"/)
  expect(await alt($, true)).toMatch(/partying/)
  expect((await band($, true)).source).toMatch(/class="fw"/)

  const tests = await $.tool.call({ tool: 'Bash', command: 'npm test' } as never)
  expect(JSON.stringify(tests)).toMatch(/1 failing/)
  expect(await alt($, true)).toMatch(/nervous/)
})

test('after 90 minutes of work it stretches once, snoozes, and resets after a pause', async ($, on) => {
  const clock = mock.clock(on, { now: at(9) })
  mock.store(on)
  const { toasts } = engine(on)
  await start($)

  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.advance(89 * MIN)
  expect(toasts.filter(t => /Stretch/.test(t))).toEqual([])
  await clock.advance(2 * MIN)
  expect(toasts.filter(t => /Stretch/.test(t))).toEqual(['1h 30m in. Stretch break? (/crab snooze for 30 min)'])
  expect(await alt($, true)).toMatch(/stretching/)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'crab-snooze' })
  await ui.unmount()
  expect(await alt($, true)).toMatch(/working/)
  await clock.advance(31 * MIN)
  expect(await alt($, true)).toMatch(/stretching/)
  expect(toasts.filter(t => /Stretch/.test(t)).length).toBe(2)

  await $.turn.complete({ ...TURN, reason: 'answer' })
  await clock.advance(16 * MIN)
  expect(await alt($)).toMatch(/napping/)
})

test('/crab breaks off silences the reminder', async ($, on) => {
  const clock = mock.clock(on, { now: at(9) })
  mock.store(on)
  const { toasts } = engine(on)
  await start($)
  await crab($, 'breaks off')
  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.advance(120 * MIN)
  expect(toasts.filter(t => /Stretch/.test(t))).toEqual([])
  expect(await alt($, true)).toMatch(/working/)
})

test('/crab ride sends it off now, with the gadget of what it wears, and a message cuts it short with a puff', async ($, on) => {
  const clock = mock.clock(on, { now: at(9) })
  mock.store(on)
  engine(on)
  await start($)
  expect(JSON.stringify(await crab($, 'ride'))).toMatch(/asleep/)

  await $.turn.start({ text: 'go', turnId: 't1' })
  expect(JSON.stringify(await crab($, 'racer'))).toMatch(/racer/)
  expect(JSON.stringify(await crab($, 'ride'))).toMatch(/off on its gadget/)
  await clock.advance(500)
  const riding = await band($, true)
  expect(riding.source).toMatch(/class="mood ride"/)
  expect(riding.source).toMatch(/class="c-racer run"/)

  // Picking another costume starts over with that costume's gadget, from where it stood.
  await clock.advance(3000)
  await crab($, 'wizard')
  await crab($, 'ride')
  await clock.advance(500)
  expect((await band($, true)).source).toMatch(/class="c-wizard run"/)
  expect((await band($, true)).source).toMatch(/@keyframes ly\{/)

  // A new turn mid-flight: no gadget left hanging, a puff where it was.
  await clock.advance(3000)
  await $.turn.complete({ answer: 'hi', durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answer' })
  await $.turn.start({ text: 'again', turnId: 't2' })
  const after = (await band($, true)).source
  expect(after).toMatch(/fill="#E8E5DD"/)
})

test('a redraw that changes nothing visible keeps the same image, for a while', async ($, on) => {
  const clock = mock.clock(on, { now: at(9) })
  mock.store(on)
  engine(on)
  on('tool.call', () => ({ result: { stdout: '', stderr: '', interrupted: false }, isError: false }) as never)
  await start($)
  await $.turn.start({ text: 'go', turnId: 't1' })
  const first = (await band($, true)).source

  // Time passing and counters ticking: not worth a new image.
  await clock.advance(5000)
  expect((await band($, true)).source).toBe(first)
  await $.tool.call({ tool: 'Read', file_path: '/x', agentId: 'helper' } as never)
  expect((await band($, true)).source).toBe(first)

  // Something you can see: a new one. Claude's own tool puts a block on the work pile.
  await $.tool.call({ tool: 'Read', file_path: '/x' } as never)
  const piled = (await band($, true)).source
  expect(piled).not.toBe(first)
  await crab($, 'pet')
  const petted = (await band($, true)).source
  expect(petted).not.toBe(piled)

  // And it never outstays its welcome: the image's clock would fall behind a fresh draw.
  await clock.advance(21_000)
  expect((await band($, true)).source).not.toBe(petted)
})

test('/crab off hides it on every surface, /crab on brings it back', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  await crab($, 'off')
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Svg' })).toBeUndefined()
    expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
    await ui.unmount()
  }
  await crab($, 'on')
  expect(await alt($)).toMatch(/napping/)
})

test('/crab chef picks the chef, drawn as one plain image', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  const out = await crab($, 'chef')
  expect(JSON.stringify(out)).toMatch(/chef/)
  expect(await alt($)).toMatch(/chef/)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const svgs = await ui.findAll({ type: 'Svg' })
  expect(svgs.length).toBe(1)
  expect(svgs[0]?.props.isInteractive).toBeUndefined()
  await ui.unmount()
})

test('it steps aside while a savvy-progress bar is up', async ($, on) => {
  mock.clock(on, { now: T0 })
  engine(on)
  on('state.get', { plugin: 'savvy-progress', key: 'flow' }, () => ({
    value: { value: { title: 'build', isFinished: false }, version: 1 },
  }))
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  await ui.unmount()
})

test('it mirrors the tool Claude uses, without flickering', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  on('tool.call', () => ({ result: { stdout: '', stderr: '', interrupted: false }, isError: false }) as never)
  await start($)
  await $.turn.start({ text: 'go', turnId: 't1' })
  await $.tool.call({ tool: 'Read', file_path: '/x' } as never)
  expect((await band($, true)).source).toMatch(/class="pr-read"/)
  await clock.advance(1000)
  await $.tool.call({ tool: 'Edit', file_path: '/x', old_string: 'a', new_string: 'b' } as never)
  expect((await band($, true)).source).toMatch(/class="pr-read"/)
  await clock.advance(5000)
  await $.tool.call({ tool: 'Edit', file_path: '/x', old_string: 'a', new_string: 'b' } as never)
  expect((await band($, true)).source).toMatch(/class="pr-swing"/)
  await clock.advance(4000)
  expect((await band($, true)).source).not.toMatch(/class="pr-(swing|read)"/)
})

test('it notices when you send a message', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  await start($)
  await $.prompt.submit({ text: 'hello crab' } as never)
  await $.turn.start({ text: 'hello crab', turnId: 't1' })
  // The "!" is up, and still up after Claude starts working.
  expect((await band($, true)).source).toMatch(/opacity="1"><g fill="#E8577A"><rect x="12" y="-9"/)
  await clock.advance(2000)
  expect((await band($, true)).source).not.toMatch(/opacity="1"><g fill="#E8577A"><rect x="12" y="-9"/)
})

test('with a place set it shows the real weather, fetched at most hourly, and survives going offline', { options: { weatherPlace: 'Lisbon' } }, async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  const urls: string[] = []
  let isOnline = true
  on('http.fetch', (_, e) => {
    const url = (e as { url: string }).url
    urls.push(url)
    if (!isOnline) throw new Error('offline')
    const text = /geocoding/.test(url)
      ? JSON.stringify({ results: [{ latitude: 48.37, longitude: 10.9 }] })
      : JSON.stringify({ current: { weather_code: 63, wind_speed_10m: 40 } })
    return { value: { status: 200, ok: true, headers: {}, text } } as never
  })
  await start($)
  await clock.advance(MIN)
  expect(urls.filter(u => /geocoding/.test(u))).toEqual(['https://geocoding-api.open-meteo.com/v1/search?count=1&name=Lisbon'])
  expect(urls.filter(u => /forecast/.test(u)).length).toBe(1)
  const src = (await band($)).source
  expect(src).toMatch(/class="rain"/)
  expect(src).toMatch(/class="windy"/)
  await clock.advance(30 * MIN)
  expect(urls.filter(u => /forecast/.test(u)).length).toBe(1)
  isOnline = false
  await clock.advance(40 * MIN)
  expect((await band($)).source).toMatch(/class="rain"/)
})

test('without a place nothing is fetched', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  const urls: string[] = []
  on('http.fetch', (_, e) => {
    urls.push((e as { url: string }).url)
    return { value: { status: 200, ok: true, headers: {}, text: '{}' } } as never
  })
  await start($)
  await clock.advance(70 * MIN)
  expect(urls).toEqual([])
  expect((await band($)).source).not.toMatch(/class="rain"/)
})

test('on Halloween it wears a ghost sheet', async ($, on) => {
  mock.clock(on, { now: new Date(2026, 9, 31, 12).getTime() })
  mock.store(on)
  engine(on)
  await start($)
  expect(await alt($)).toMatch(/ghost/)
})

test('each tool call adds a block to the work pile, which it tidies away after the turn', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  on('tool.call', () => ({ result: { stdout: '', stderr: '', interrupted: false }, isError: false }) as never)
  await start($)
  await $.turn.start({ text: 'go', turnId: 't1' })
  for (const tool of ['Read', 'Edit', 'Bash']) await $.tool.call({ tool, file_path: '/x', command: 'ls' } as never)
  const during = (await band($, true)).source
  expect(during).toMatch(/fill="#E9D6A6"/)
  expect(during).toMatch(/fill="#B07A45"/)
  await $.turn.complete({ ...TURN, reason: 'answer' })
  expect((await band($)).source).toMatch(/class="wpile"/)
  await clock.advance(90_000)
  expect((await band($)).source).not.toMatch(/fill="#B07A45"/)
})

// --- today's theme and the strip's width

const HALLOWEEN = new Date(2026, 9, 31, 12).getTime()
const dayCostume = (ms: number) => costumeOfDay(ms, new Date(ms).getTimezoneOffset())

test("today's theme is the costume's day, or a holiday's", () => {
  expect(themeAt(T0)).toBe(`${dayCostume(T0)} day`)
  expect(costumeAt(HALLOWEEN)).toBe('ghost')
  expect(themeAt(HALLOWEEN)).toBe('Halloween')
  expect(costumeAt(new Date(2026, 11, 25, 12).getTime())).toBe('santa')
  expect(themeAt(new Date(2026, 11, 25, 12).getTime())).toBe('Christmas')
  expect(themeAt(new Date(2027, 0, 1, 12).getTime())).toMatch(/^New Year, [a-z]+ day$/)
  expect(themeName('pirate', null)).toBe('pirate day')
  expect(themeLine('pirate', null)).toBe("ahoy, it's pirate day!")
  expect(themeLine('chef', 'newyear')).toBe('happy New Year! chef day')
  // Each greeting fits a bubble whole.
  for (const c of [...COSTUMES, ...SPECIAL_COSTUMES]) expect(themeLine(c, null).length).toBeLessThanOrEqual(34)
  for (const c of COSTUMES) expect(themeLine(c, 'newyear').length).toBeLessThanOrEqual(34)
})

test('a pick beats a holiday, a holiday beats the rain, the rain beats the rotation', () => {
  const day = dayCostume(T0)
  expect(wornAt(T0)).toBe(day)
  expect(wornAt(T0, 'cloudy')).toBe(day)
  expect(wornAt(T0, 'rain')).toBe('raincoat')
  expect(wornAt(T0, 'storm')).toBe('raincoat')
  const halloween = new Date(2026, 9, 31, 12).getTime()
  expect(wornAt(halloween, 'rain')).toBe('ghost')
  const wiesn = new Date(2026, 8, 25, 12).getTime()
  expect(wornAt(wiesn, 'storm')).toBe('oktoberfest')
  // New Year has no costume of its own, so the raincoat still goes on.
  expect(wornAt(new Date(2026, 11, 31, 12).getTime(), 'rain')).toBe('raincoat')
})

test('Oktoberfest runs from 20-09 to 05-10', () => {
  const on = (m: number, d: number) => holiday(new Date(2026, m, d, 12))
  expect(on(8, 19)).toBe(null)
  expect(on(8, 20)).toBe('oktoberfest')
  expect(on(9, 5)).toBe('oktoberfest')
  expect(on(9, 6)).toBe(null)
  expect(costumeAt(new Date(2026, 9, 1, 12).getTime())).toBe('oktoberfest')
  expect(themeAt(new Date(2026, 9, 1, 12).getTime())).toBe('Oktoberfest')
})

test('rain over the real weather puts the raincoat on', { options: { weatherPlace: 'Lisbon' } }, async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  on('http.fetch', (_, e) => {
    const text = /geocoding/.test((e as { url: string }).url)
      ? JSON.stringify({ results: [{ latitude: 48.37, longitude: 10.9 }] })
      : JSON.stringify({ current: { weather_code: 63, wind_speed_10m: 4 } })
    return { value: { status: 200, ok: true, headers: {}, text } } as never
  })
  await start($)
  expect(await alt($)).toMatch(/raincoat/)
  await crab($, 'chef')
  expect(await alt($)).toMatch(/chef/)
})

test('every costume draws on every surface, with its beach, inside the size limit', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on, { shells: { count: KING_SHELLS, last: 'x' } })
  engine(on)
  await start($)
  const sky = skyFor(T0)
  for (const costume of [...COSTUMES, ...SPECIAL_COSTUMES]) {
    await crab($, costume)
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...BAND, surface })
      if (surface !== 'terminal') expect(String((await ui.find({ type: 'Svg' }))?.props.alt)).toMatch(new RegExp(costume))
      await ui.unmount()
    }
    const big = sceneSvg({ width: 1600, costume, look: {}, timeOfDay: 'day', bubble: null, now: T0 + 1000, prop: null, sky, hour: 12, work: [], seg: { id: 1, seed: 42, startAt: T0, startP: 0.5, startFace: 1, mode: 'idle', width: 1600, castle: 5, shells: 30, food: 60, fun: 60, energy: 60, timeOfDay: 'day' } })
    expect(big.length).toBeLessThan(131072)
  }
})

test('the rotation and special costumes each have a beach or a reason not to', () => {
  const beach = (costume: (typeof COSTUMES)[number] | (typeof SPECIAL_COSTUMES)[number], width = 900) => {
    const scene = sceneSvg({ width, costume, look: {}, timeOfDay: 'day', bubble: null, now: T0 + 1000, prop: null, sky: skyFor(T0), hour: 12, work: [], seg: { id: 1, seed: 42, startAt: T0, startP: 0.5, startFace: 1, mode: 'idle', width, castle: 0, shells: 0, food: 60, fun: 60, energy: 60, timeOfDay: 'day' } })
    return scene.length
  }
  for (const c of ['surfer', 'diver', 'viking', 'wizard', 'dj', 'oktoberfest'] as const) expect(beach(c)).toBeGreaterThan(beach('plain'))
  // A narrow strip has no room for a costume's beach.
  expect(beach('viking', 400) - beach('plain', 400)).toBeLessThan(beach('viking') - beach('plain'))
})

test('the crown takes 50 shells', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on, { shells: { count: KING_SHELLS - 1, last: 'x' } })
  engine(on)
  await start($)
  expect(KING_SHELLS).toBe(50)
  expect(JSON.stringify(await crab($, 'king'))).toMatch(/takes 50 shells\. .* has 49/)
  expect(await alt($)).not.toMatch(/king/)
})

test('with 50 shells the crown is yours', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on, { shells: { count: KING_SHELLS, last: 'x' } })
  engine(on)
  await start($)
  expect(JSON.stringify(await crab($, 'king'))).toMatch(/now the king/)
  expect(await alt($)).toMatch(/king/)
})

test('no costume shares a name with a /crab word', () => {
  const words = ['feed', 'play', 'pet', 'name', 'stats', 'theme', 'size', 'tank', 'strip', 'snooze', 'breaks', 'sound', 'bubbles', 'off', 'on', 'today']
  for (const c of [...COSTUMES, ...SPECIAL_COSTUMES]) expect(words.includes(c)).toBe(false)
})

test('the strip is drawn for the room beside its three buttons, and makes room for Snooze', () => {
  expect(stripWidth(100, false)).toBe(725)
  expect(stripWidth(100, true)).toBe(675)
  expect(stripWidth(0, false)).toBe(725)
  expect(stripWidth(20, false)).toBe(200)
  expect(stripWidth(400, false)).toBe(1600)
  // VS Code's columns are wider and its buttons larger: 49 columns is a 662 px band.
  expect(stripWidth(49, false, 'vscode')).toBe(542)
  expect(stripWidth(49, true, 'vscode')).toBe(472)
  expect(stripWidth(49, false, 'desktop')).toBe(317)
})

test('on the image surfaces the strip takes the whole row left of its buttons', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  await start($)
  for (const [surface, width] of [['desktop', 885], ['vscode', 1500]] as const) {
    const ui = await $.ui.mount({ ...BAND, surface, props: { ...BAND.props, bodyColumns: 120 } })
    const svg = await ui.find({ type: 'Svg' })
    // No width: the surface sizes the image, and the wide markup stretches to fit.
    expect(svg?.props.width).toBeUndefined()
    expect(svg?.props.height).toBe(40)
    expect(String(svg?.props.source)).toMatch(new RegExp(`<svg [^>]*width="4096" height="40" viewBox="0 0 ${width} 40" preserveAspectRatio="none"`))
    const boxes = (await ui.findAll({ type: 'Box' })).map(b => b.props)
    expect(boxes.some(b => b.flexWrap === 'nowrap')).toBe(true)
    expect(boxes.some(b => b.flexGrow === 1 && b.flexShrink === 1 && b.minWidth === 0)).toBe(true)
    expect(boxes.some(b => b.flexShrink === 0)).toBe(true)
    await ui.unmount()
  }
})

test('a resize redraws the same plan: the crab stays at its place along the beach', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  await start($)
  const placeAt = async (bodyColumns: number) => {
    const ui = await $.ui.mount({ ...BAND, surface: 'vscode', props: { ...BAND.props, bodyColumns } })
    const source = String((await ui.find({ type: 'Svg' }))?.props.source)
    await ui.unmount()
    const width = Number(/viewBox="0 0 (\d+) 40"/.exec(source)?.[1])
    const x = Number(/<g class="mv" transform="translate\(([\d.]+),0\)"/.exec(source)?.[1])
    return { width, p: (x - 26) / (width - 58) }
  }
  const narrow = await placeAt(49)
  const wide = await placeAt(100)
  expect(wide.width).toBeGreaterThan(narrow.width)
  expect(Math.abs(wide.p - narrow.p)).toBeLessThan(0.01)
})

test('/crab size reports what the surface says', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  await start($)
  const ui = await $.ui.mount({ ...BAND, surface: 'vscode', viewport: { columns: 49, rows: 40 }, props: { ...BAND.props, bodyColumns: 49 } })
  expect(JSON.stringify(await crab($, 'size'))).toMatch(/Strip on vscode: 49 columns \(viewport 49\), beach drawn 542 px wide/)
  await ui.unmount()
})

test("your first message of the day gets today's theme, once", async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  await start($)
  await $.prompt.submit({ text: 'hello crab' } as never)
  expect((await band($)).source.includes(themeLine(dayCostume(T0), null))).toBe(true)
  // It stays up a little longer than a normal line, then goes.
  await clock.advance(6000)
  expect((await band($)).source).toMatch(/class="bubble"/)
  await clock.advance(3000)
  expect((await band($)).source).not.toMatch(/class="bubble"/)
  // A second message, or a new session the same day, gets no second greeting.
  await $.prompt.submit({ text: 'again' } as never)
  expect((await band($)).source).not.toMatch(/class="bubble"/)
  await start($)
  await $.prompt.submit({ text: 'new session' } as never)
  expect((await band($)).source.includes(themeLine(dayCostume(T0), null))).toBe(false)
})

test('a slash command is not a greeting, and bubbles off keeps it quiet', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  await start($)
  await $.prompt.submit({ text: '/crab stats', command: 'crab' } as never)
  expect((await band($)).source.includes(themeLine(dayCostume(T0), null))).toBe(false)
  await crab($, 'bubbles off')
  await $.prompt.submit({ text: 'hello' } as never)
  expect((await band($)).source).not.toMatch(/class="bubble"/)
})

test('on Halloween the greeting says boo, and /crab theme and /crab stats name the day', async ($, on) => {
  mock.clock(on, { now: HALLOWEEN })
  mock.store(on)
  engine(on)
  await start($)
  await $.prompt.submit({ text: 'hi' } as never)
  expect((await band($)).source).toMatch(/boo! happy Halloween/)
  expect(JSON.stringify(await crab($, 'theme'))).toMatch(/Today is Halloween\./)
  expect(JSON.stringify(await crab($, 'stats'))).toMatch(/ · Halloween/)
  await crab($, 'chef')
  expect(JSON.stringify(await crab($, 'theme'))).toMatch(/Today is Halloween; this session wears the chef you picked/)
  expect(JSON.stringify(await crab($, 'today'))).toMatch(/costume: ghost/)
})

// --- the tank

const tank = ($: Tester, surface: (typeof SURFACES)[number] = 'desktop', placement: 'dock' | 'inline' = 'dock') =>
  $.ui.mount({
    plugin: 'crab-buddy', component: 'Pane', requestId: 'crab-tank', surface,
    props: { title: "Crabby's beach", isFocused: false, bodyColumns: 45, placement, scroll: { offset: 0, bodyRows: 30 }, view: {} },
  } as never)

test('the tank is the same beach, bigger, with more sky above; the strip is unchanged', () => {
  expect(tankSize(45, 'dock')).toEqual({ width: 352, height: 282, sceneWidth: 176, sceneHeight: 141 })
  expect(tankSize(100, 'inline')).toEqual({ width: 792, height: 160, sceneWidth: 317, sceneHeight: 64 })
  expect(tankSize(10, 'dock').width).toBe(200)
  const base = { costume: 'pirate', look: { tiredness: 'fresh', isGrumpy: false, isHungry: false, hasNightcap: false }, bubble: null, prop: null, work: [], hour: 23 } as const
  const seg = { id: 1, seed: 7, startAt: T0, startP: 0.4, startFace: 1, mode: 'sleep', width: 176, castle: 2, shells: 3, food: 60, fun: 60, energy: 60, timeOfDay: 'night' } as const
  const strip = sceneSvg({ ...base, width: 700, now: T0, seg: { ...seg, width: 700 }, timeOfDay: 'night', sky: skyFor(T0) })
  expect(strip).toMatch(/viewBox="0 0 700 40"/)
  expect(strip).not.toMatch(/preserveAspectRatio/)
  const night =sceneSvg({ ...base, width: 176, height: 141, now: T0, seg, timeOfDay: 'night', sky: skyFor(T0) })
  expect(night).toMatch(/height="141" viewBox="0 -101 176 141"/)
  // The moon and stars rise into the extra sky; the sand stays at the bottom.
  const moonY = Number(/<circle cx="160" cy="(-?[\d.]+)"/.exec(night)?.[1])
  expect(moonY).toBeLessThan(-50)
  expect((night.match(/fill="#F3E7B5"/g) ?? []).length).toBeGreaterThan((strip.match(/fill="#F3E7B5"/g) ?? []).length)
  expect(night).toMatch(/class="sand" x="0" y="35"/)
  const rain = sceneSvg({ ...base, width: 176, height: 141, now: T0, seg, timeOfDay: 'day', hour: 12, sky: skyFor(T0, 'rain') })
  expect(rain).toMatch(/class="rain" x="\d+" y="-101"/)
  expect(night.length).toBeLessThan(131_072)
})

test('/crab tank moves the crab into its pane, buttons and all; /crab strip brings it back', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  const { panes } = engine(on)
  await start($)
  expect(JSON.stringify(await crab($, 'tank'))).toMatch(/in its tank/)
  expect(panes).toEqual(['crab-tank'])
  // Nothing is left above the prompt.
  const above = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await above.find({ type: 'Svg' })).toBeUndefined()
  expect(await above.find({ key: 'crab-feed' })).toBeUndefined()
  await above.unmount()
  for (const surface of SURFACES) {
    const ui = await tank($, surface)
    expect(await ui.find({ key: 'crab-feed' })).toBeDefined()
    if (surface !== 'terminal') {
      const svg = await ui.find({ type: 'Svg' })
      expect(svg?.props.width).toBe(352)
      expect(svg?.props.height).toBe(282)
      expect(String(svg?.props.source)).toMatch(/viewBox="0 -101 176 141"/)
      expect(svg?.props.isInteractive).toBeUndefined()
    }
    await ui.unmount()
  }
  // Asked again, it says where the surface seated it.
  expect(JSON.stringify(await crab($, 'tank'))).toMatch(/docked beside the chat, 45 columns wide/)
  expect(JSON.stringify(await crab($, 'strip'))).toMatch(/back above the prompt/)
  expect(panes).toEqual([])
  expect((await band($)).source).toMatch(/viewBox="0 0 /)
})

test('tank mode is remembered across sessions; only your own close of the tank ends it', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  const { panes } = engine(on)
  await start($)
  await crab($, 'tank')
  panes.length = 0
  await start($)
  expect(panes).toEqual(['crab-tank'])
  expect((await band($)).source).toBe('')
  await crab($, 'strip')
  await start($)
  expect(panes).toEqual([])
  expect(isClosedByYou({ id: 'crab-tank', origin: { kind: 'person' } })).toBe(true)
  expect(isClosedByYou({ id: 'crab-tank', origin: { kind: 'unload' } })).toBe(false)
  expect(isClosedByYou({ id: 'crab-tank', origin: { kind: 'plugin' } })).toBe(false)
  expect(isClosedByYou({ id: 'other', origin: { kind: 'person' } })).toBe(false)
})

test('a tank the surface cannot show leaves the crab above the prompt', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on, { percent: null, isPlaced: false })
  await start($)
  expect(JSON.stringify(await crab($, 'tank'))).toMatch(/isn't showing it \(no surface places panes\)/)
  expect((await band($)).source).toMatch(/viewBox="0 0 /)
})

// --- the terminal's beach

const NONE = 0x01000000
const cellsOf = (cells: string) => {
  const words = decodeCells(cells)
  return Array.from({ length: words.length / 3 }, (_, i) => ({ ch: words[i * 3] ?? 0, fg: words[i * 3 + 1] ?? 0, bg: words[i * 3 + 2] ?? 0 }))
}
const TSEG = { id: 1, seed: 11, startAt: T0, startP: 0.45, startFace: 1, mode: 'idle', width: 725, castle: 3, shells: 4, food: 60, fun: 60, energy: 60, timeOfDay: 'day', shore: 0.7 } as const
const TBASE = { columns: 82, rows: 3, now: T0 + 1000, seg: TSEG, costume: 'pirate', timeOfDay: 'day', sky: skyFor(T0), bubble: null } as const

test('the terminal beach is half blocks of colour, see-through where empty', () => {
  const cells = cellsOf(beachCells(TBASE))
  expect(cells.length).toBe(82 * 3)
  // Only spaces and half blocks; empty cells keep the terminal's own colours.
  for (const c of cells) expect([0x20, 0x2580, 0x2584]).toContain(c.ch)
  expect(cells.some(c => c.ch === 0x20 && c.fg === NONE && c.bg === NONE)).toBe(true)
  const bottom = cells.slice(2 * 82)
  expect(bottom.some(c => c.bg === 0xD9C08A)).toBe(true)
  // The sea starts where the context put the shore, give or take the tide.
  expect(bottom.slice(60).every(c => c.bg === 0x4FA3CC || c.bg === 0xFFFFFF || c.fg === 0x8FCFE6)).toBe(true)
  expect(cells.some(c => c.fg === 0xD97757 || c.bg === 0xD97757)).toBe(true)
  // The pirate wears its hat.
  expect(cells.some(c => c.fg === 0x2B2A28 || c.bg === 0x2B2A28)).toBe(true)
})

test('the terminal crab walks where the plan says, and talks beside its head in narrow characters', () => {
  const xs = new Set(Array.from({ length: 30 }, (_, i) => beachPixels({ ...TBASE, now: T0 + i * 3000 }).crabX))
  expect(xs.size).toBeGreaterThan(3)
  expect(cellText('commit! 🎉')).toBe('commit!')
  expect(cellText('♥ ♥')).toBe('<3 <3')
  const words = cellsOf(beachCells({ ...TBASE, bubble: "ahoy, it's pirate day!" }))
  const text = words.filter(c => c.ch !== 0x20 && c.ch < 0x2000).map(c => String.fromCharCode(c.ch)).join('')
  expect(text).toBe("ahoy,it'spirateday!")
  const tall = cellsOf(beachCells({ ...TBASE, rows: 14, timeOfDay: 'night', sky: skyFor(at(23)) }))
  expect(tall.length).toBe(82 * 14)
  expect(tall.slice(0, 82 * 8).filter(c => c.fg === 0xF3E7B5 || c.bg === 0xF3E7B5).length).toBeGreaterThan(5)
})

test('in the terminal the strip is a Raster beside the buttons, and the tank a taller one', async ($, on) => {
  expect(terminalColumns(100, false)).toBe(82)
  expect(terminalColumns(100, true)).toBe(70)
  expect(terminalTankRows(30, 'dock')).toBe(14)
  expect(terminalTankRows(8, 'dock')).toBe(6)
  expect(terminalTankRows(30, 'inline')).toBe(4)
  mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  await start($)
  const strip = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const raster = await strip.find({ type: 'Raster' })
  expect(raster?.props.columns).toBe(82)
  expect(raster?.props.rows).toBe(3)
  expect(await strip.find({ key: 'crab-feed' })).toBeDefined()
  await strip.unmount()
  await crab($, 'tank')
  const pane = await tank($, 'terminal')
  expect((await pane.find({ type: 'Raster' }))?.props.rows).toBe(14)
  await pane.unmount()
})

test('the terminal beach repaints four times a second while awake, once while it naps, and stops when gone', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  const { blits } = engine(on, { percent: null, isBlitOk: true })
  await start($)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await clock.advance(2000)
  const napping = blits.length
  expect(napping).toBeGreaterThanOrEqual(1)
  expect(napping).toBeLessThanOrEqual(3)
  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.advance(2000)
  expect(blits.length - napping).toBeGreaterThanOrEqual(6)
  expect(blits.every(b => b.requestId === 'above-prompt')).toBe(true)
  await ui.unmount()
})

test('a denied repaint stops the timer until the beach is drawn again', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  const { blits } = engine(on)
  await start($)
  await $.turn.start({ text: 'go', turnId: 't1' })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.unmount()
  await clock.advance(5000)
  expect(blits.length).toBe(1)
})
