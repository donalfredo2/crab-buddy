// Plays the crab's beach in a real browser and checks that what moves on screen is what
// its life plan says: where it stands, which way it faces, which pose shows and how high
// it is, beat by beat, for every costume, every gadget and the big moments. It also checks
// that the image moves at all, that a redraw picks up where the last one was, that Reduce
// Motion stills everything, and that the terminal beach walks the same plan.
//
//   bun scripts/check-animations.ts            (Chromium comes from playwright)
//   CRAB_SHOTS=/tmp/crab bun scripts/check-animations.ts   (also saves a PNG per scenario)
//
// Not part of the plugin's own test run: `claude plugin test` has no browser.

import { chromium } from 'playwright'
import type { Page } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'

import type { Beach, Segment, Weather } from '../types'
import { planOf, rideFits, whereAt, xOf } from '../hooks/life'
import { sceneSvg } from '../hooks/scene'
import type { SceneInput } from '../hooks/scene'
import { skyFor } from '../hooks/sky'
import { COSTUMES, SPECIAL_COSTUMES } from '../hooks/sprites'
import type { Costume } from '../hooks/sprites'
import { beachPixels } from '../hooks/terminal'

const T0 = new Date(2026, 9, 29, 12).getTime()
const SHOTS = process.env.CRAB_SHOTS
const ONLY = process.env.CRAB_ONLY

const seg = (over: Partial<Segment> = {}): Segment => ({
  id: 1, seed: 7, startAt: T0, startP: 0.3, startFace: 1, mode: 'idle', width: 600, castle: 1, shells: 4,
  food: 80, fun: 60, energy: 80, timeOfDay: 'day', ...over,
})

type Scenario = { name: string; input: SceneInput; still?: boolean }
const base = (s: Segment, over: Partial<SceneInput> = {}): SceneInput => ({
  width: s.width, costume: 'plain', look: {}, timeOfDay: 'day', bubble: null, now: s.startAt + 1500, seg: s,
  prop: null, sky: skyFor(s.startAt), hour: 12, work: [], ...over,
})

const ALL: Costume[] = [...COSTUMES, ...SPECIAL_COSTUMES]
const scenarios: Scenario[] = []
// Every costume living an ordinary day, idle and working.
for (const [i, costume] of ALL.entries()) {
  const s = seg({ seed: 101 + i * 37, mode: i % 2 ? 'work' : 'idle' })
  scenarios.push({ name: `life:${costume}`, input: base(s, { costume, prop: i % 2 ? 'hammer' : null }) })
}
// Every gadget it rides, with room to ride it.
for (const ride of ALL) {
  const s = seg({ seed: 11, ride, first: 'ride', width: 900, shore: 0.7 })
  if (!rideFits(s)) throw new Error(`no room to ride ${ride} on a 900 strip`)
  scenarios.push({ name: `ride:${ride}`, input: base(s, { costume: ride, timeOfDay: ride === 'racer' ? 'evening' : 'day', hour: ride === 'racer' ? 20 : 12 }) })
}
// Big moments, a nap under the moon, the friend, the tank, roaming, fishing and signs.
for (const pose of ['party', 'nervous', 'wave', 'cheer'] as const) {
  scenarios.push({ name: `moment:${pose}`, input: base(seg({ hold: { pose, ms: 2600 }, width: 800 })) })
}
const night = new Date(2026, 9, 29, 23).getTime()
scenarios.push({ name: 'nap:night', input: base(seg({ mode: 'sleep', startAt: night, timeOfDay: 'night', startP: 0.05 }), { timeOfDay: 'night', hour: 23, sky: skyFor(night) }) })
scenarios.push({ name: 'tank', input: base(seg({ seed: 99 }), { height: 120 }) })
scenarios.push({ name: 'roam:leaving', input: base(seg({ mode: 'away', isLeaving: true, startP: 0.3, shore: 0.8 })) })
scenarios.push({ name: 'roam:arriving', input: base(seg({ first: 'arrive', startP: 0, shore: 0.8 })) })
scenarios.push({ name: 'roam:empty', input: base(seg({ mode: 'away', startP: 0.3 })) })
const beach: Beach = { rods: 2, sign: 'pushed!', planted: 'good moment', hasBottle: true, hasMark: true }
scenarios.push({ name: 'fishing+signs', input: base(seg({ first: 'cast', shore: 0.6 }), { beach }) })
// The helper: the red flag held while Claude waits, and the hourglass on the home shell.
scenarios.push({ name: 'assist:flag', input: base(seg({ hold: { pose: 'look', ms: 600_000 } }), { beach: { sign: 'needs you: Bash', isFlag: true } }) })
scenarios.push({ name: 'assist:hourglass', input: base(seg({ seed: 21 }), { beach: { usage: 0.5 } }) })
scenarios.push({ name: 'reel:boot', input: base(seg({ first: 'reel', haul: 'boot', shore: 0.6 }), { beach: { rods: 1 } }) })
for (const [k, seed] of [1, 2, 3, 5, 8, 13, 21, 34].entries()) {
  // Seeds that cover the antics: digging, the butterfly, the gull, the friend and more.
  scenarios.push({ name: `antics:${k}`, input: base(seg({ seed: seed * 7919, width: 700, shells: 8, castle: 2, layout: seed, earned: 0 }), { work: k % 2 ? ['hammer', 'scroll', 'other'] : [] }) })
}
for (const weather of ['rain', 'snow', 'storm', 'fog', 'cloudy'] as Weather[]) {
  scenarios.push({ name: `weather:${weather}`, input: base(seg({ weather }), { sky: skyFor(T0, weather, weather === 'storm') }) })
}

type Fail = { name: string; why: string }
const fails: Fail[] = []
let checks = 0
const ok = (cond: boolean, name: string, why: string): void => {
  checks++
  if (!cond) fails.push({ name, why })
}

const inline = (svg: string) => `<!doctype html><html><body style="margin:0;background:#9fd3f0">${svg}</body></html>`
const asImage = (svg: string, w: number, h: number) =>
  `<!doctype html><html><body style="margin:0;background:#9fd3f0"><img width="${w}" height="${h}" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}"></body></html>`

/** Pauses every animation and sets them all to `ms` after the drawing was made. */
const seek = (page: Page, ms: number) =>
  page.evaluate(t => {
    for (const a of document.getAnimations()) {
      a.pause()
      a.currentTime = t
    }
  }, ms)

/** Where the crab is drawn: its x, whether it faces left, which pose layer shows and its lift. */
const crabNow = (page: Page) =>
  page.evaluate(() => {
    const m = (el: Element | null) => new DOMMatrixReadOnly(el ? getComputedStyle(el).transform === 'none' ? undefined : getComputedStyle(el).transform : undefined)
    const mv = document.querySelector('.mv')
    const fc = document.querySelector('.fc')
    const ly = document.querySelector('.ly')
    const layers = [...document.querySelectorAll('.fc > g[class^="l"]')].map(el => ({ cls: el.getAttribute('class') ?? '', op: Number(getComputedStyle(el).opacity) }))
    const lyAttr = ly?.getAttribute('transform') ?? ''
    return {
      x: m(mv).e,
      isLeft: m(fc).a < 0,
      shown: layers.filter(l => l.op > 0.5).map(l => l.cls),
      lift: ly && getComputedStyle(ly).transform !== 'none' ? -m(ly).f : -Number(/translate\(0,(-?[\d.]+)\)/.exec(lyAttr)?.[1] ?? 0),
      running: document.getAnimations().length,
    }
  })

async function checkPlan(page: Page, sc: Scenario): Promise<void> {
  const { input } = sc
  const pl = planOf(input.seg)
  const elapsed = input.now - input.seg.startAt
  const width = Math.max(120, Math.round(input.width))
  const poses = [...new Set(pl.beats.map(b => b.pose))]
  await page.setContent(inline(sceneSvg(input)))
  const total = (await page.evaluate(() => document.getAnimations().length))
  ok(total > 0, sc.name, 'no animations running')
  // Sample the middle of every beat ahead, and the whole plan at even steps.
  const times = new Set<number>()
  for (const b of pl.beats) if (b.t1 > elapsed && b.t1 - b.t0 > 60) times.add(Math.max(elapsed, (b.t0 + b.t1) / 2))
  for (let t = elapsed; t < pl.duration; t += pl.duration / 25) times.add(t)
  // And after the plan has run out, waiting for a late redraw: it must hold the last beat.
  times.add(pl.duration + 3000)
  for (const t of [...times].sort((a, b) => a - b)) {
    await seek(page, t - elapsed)
    const got = await crabNow(page)
    const want = whereAt(pl, Math.min(t, pl.duration - 1))
    const beat = pl.beats.find(b => t < b.t1)
    const at = `t=${(t / 1000).toFixed(2)}s ${beat?.act}/${want.pose}`
    // Steps land on whole pixels a step at a time, so allow a pixel and a half.
    ok(Math.abs(got.x - xOf(want.p, width)) <= 1.5, sc.name, `${at}: x ${got.x.toFixed(1)} but the plan says ${xOf(want.p, width).toFixed(1)}`)
    ok(got.x >= -2 && got.x <= width, sc.name, `${at}: crab drawn off the strip at x ${got.x}`)
    ok(got.isLeft === (want.face === -1), sc.name, `${at}: faces ${got.isLeft ? 'left' : 'right'}, plan says ${want.face === 1 ? 'right' : 'left'}`)
    ok(got.shown.length === 1, sc.name, `${at}: ${got.shown.length} pose layers showing (${got.shown.join(',')})`)
    ok(got.shown[0] === `l${poses.indexOf(want.pose)}`, sc.name, `${at}: layer ${got.shown[0]} shows, the plan's pose ${want.pose} is l${poses.indexOf(want.pose)}`)
    if (want.pose !== 'gone') ok(Math.abs(got.lift - Math.round(want.lift)) <= 1.5, sc.name, `${at}: lift ${got.lift} but the plan says ${want.lift.toFixed(1)}`)
  }
}

/** A redraw later in the same segment lands the crab where the first drawing had got to. */
async function checkRedraw(page: Page, sc: Scenario): Promise<void> {
  const later = 4000
  await page.setContent(inline(sceneSvg(sc.input)))
  await seek(page, later)
  const a = await crabNow(page)
  await page.setContent(inline(sceneSvg({ ...sc.input, now: sc.input.now + later })))
  await seek(page, 0)
  const b = await crabNow(page)
  ok(Math.abs(a.x - b.x) <= 1.5 && a.isLeft === b.isLeft && a.shown.join() === b.shown.join(), sc.name, `redraw jumps: ${JSON.stringify(a)} then ${JSON.stringify(b)}`)
}

/** As the surfaces draw it, an image: it must change on screen over time, and stand still under Reduce Motion. */
async function checkMotion(page: Page, still: Page, sc: Scenario): Promise<void> {
  const svg = sceneSvg(sc.input)
  const w = Math.max(120, Math.round(sc.input.width))
  const h = sc.input.height ?? 40
  await page.setContent(asImage(svg, w, h))
  await page.waitForTimeout(150)
  const shot1 = await page.screenshot({ clip: { x: 0, y: 0, width: w, height: h } })
  await page.waitForTimeout(900)
  const shot2 = await page.screenshot({ clip: { x: 0, y: 0, width: w, height: h } })
  if (SHOTS) writeFileSync(`${SHOTS}/${sc.name.replace(/[^a-z0-9+-]+/gi, '_')}.png`, shot2)
  if (!sc.still) ok(!shot1.equals(shot2), sc.name, 'nothing on screen moved in 0.9s')

  // Reduce Motion as the system sets it: emulation in the page does not reach an image's own document.
  await still.setContent(inline(svg))
  const left = await still.evaluate(() => document.getAnimations().length)
  ok(left === 0, sc.name, `${left} animations still run under Reduce Motion`)
  await still.setContent(asImage(svg, w, h))
  await still.waitForTimeout(150)
  const r1 = await still.screenshot({ clip: { x: 0, y: 0, width: w, height: h } })
  await still.waitForTimeout(700)
  const r2 = await still.screenshot({ clip: { x: 0, y: 0, width: w, height: h } })
  ok(r1.equals(r2), sc.name, 'the image still moves under Reduce Motion')
}

/** The terminal has no CSS: each repaint must put the crab where the plan says, in whole cells. */
function checkTerminal(sc: Scenario): void {
  const columns = 100
  const pl = planOf({ ...sc.input.seg, width: columns })
  for (let t = 0; t < pl.duration; t += 250) {
    const want = whereAt(pl, t)
    const got = beachPixels({ columns, rows: 3, now: sc.input.seg.startAt + t, seg: { ...sc.input.seg, width: columns }, costume: sc.input.costume, timeOfDay: sc.input.timeOfDay, sky: sc.input.sky, bubble: null, beach: sc.input.beach })
    if (want.pose === 'gone') continue
    ok(Number.isFinite(got.crabX) && got.crabX >= 0 && got.crabX < columns, `terminal:${sc.name}`, `t=${t}: crab at column ${got.crabX}`)
  }
}

const main = async (): Promise<void> => {
  if (SHOTS) mkdirSync(SHOTS, { recursive: true })
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1000, height: 200 } })
  const calm = await chromium.launch({ args: ['--force-prefers-reduced-motion'] })
  const still = await calm.newPage({ viewport: { width: 1000, height: 200 } })
  await still.emulateMedia({ reducedMotion: 'reduce' })
  const list = scenarios.filter(s => !ONLY || s.name.includes(ONLY))
  for (const sc of list) {
    const before = fails.length
    try {
      await checkPlan(page, sc)
      await checkRedraw(page, sc)
      await checkMotion(page, still, sc)
      checkTerminal(sc)
    } catch (err) {
      fails.push({ name: sc.name, why: `threw: ${(err as Error).stack ?? err}` })
    }
    console.log(`${fails.length === before ? 'pass' : 'FAIL'} ${sc.name}`)
  }
  await browser.close()
  await calm.close()
  console.log(`\n${list.length} scenarios, ${checks} checks, ${fails.length} failed`)
  const seen = new Map<string, number>()
  for (const f of fails) {
    const n = (seen.get(f.name) ?? 0) + 1
    seen.set(f.name, n)
    if (n <= 5) console.log(`  ${f.name}: ${f.why}`)
  }
  process.exit(fails.length ? 1 : 0)
}

void main()
