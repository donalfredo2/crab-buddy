import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import type { On } from 'claude-code'

import type { Segment } from '../types'
import { activityStarts, hasDecor, plan, planOf, shoreFrac, spots, whereAt, xOf } from './life'

import { line, themeLine, themeName } from './lines'
import { care, cooldownLeft, freshNeeds, petMood, rest, tick } from './pet'
import { cleanName, costumeAt, dayKey, isClosedByYou, nextCastle, nextShells, reactionTo, stripWidth, tankSize, terminalColumns, terminalTankRows, themeAt } from './register'
import { sceneSvg, timeOfDay } from './scene'
import { holiday, moonLit, moonPhase, season, skyFor, weatherOf } from './sky'
import { COSTUMES, costumeOfDay } from './sprites'
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
  for (const c of [...COSTUMES, 'ghost', 'santa'] as const) expect(themeLine(c, null).length).toBeLessThanOrEqual(34)
  for (const c of COSTUMES) expect(themeLine(c, 'newyear').length).toBeLessThanOrEqual(34)
})

test('the desktop strip fills the row beside its three buttons, and makes room for Snooze', async ($, on) => {
  expect(stripWidth(100, false)).toBe(725)
  expect(stripWidth(100, true)).toBe(675)
  expect(stripWidth(0, false)).toBe(725)
  expect(stripWidth(20, false)).toBe(200)
  expect(stripWidth(400, false)).toBe(1600)
  mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  await start($)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: { ...BAND.props, bodyColumns: 120 } })
  expect((await ui.find({ type: 'Svg' }))?.props.width).toBe(885)
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
  const night = sceneSvg({ ...base, width: 176, height: 141, now: T0, seg, timeOfDay: 'night', sky: skyFor(T0) })
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
