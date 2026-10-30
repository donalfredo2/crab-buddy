// The crab's own life: a seeded plan of beats for one segment (walk here, dig,
// look at you, yawn...). Pure and deterministic, so every redraw of the strip
// draws the same plan and the CSS picks up where the crab is.

import type { Activity, Pose, Segment } from '../types'
import type { Costume } from './sprites'

export const CRAB_W = 26
/** Where the crab's track starts: right of its home shell and the shell pile. */
export const TRACK_MIN = 26
export const MAX_CASTLE = 5

const S = 1000
const clamp01 = (n: number): number => Math.max(0, Math.min(1, n))

export const trackSpan = (width: number): number => Math.max(1, width - CRAB_W - 6 - TRACK_MIN)
export const xOf = (p: number, width: number): number => TRACK_MIN + clamp01(p) * trackSpan(width)
const pOf = (x: number, width: number): number => clamp01((x - TRACK_MIN) / trackSpan(width))

export const NO_CONTEXT_SHORE = 0.92

/**
 * Where the sea starts, as a fraction of the width: far out with a fresh context,
 * creeping up the beach to just past the castle at 85%, with a small tide on top.
 */
export const shoreFrac = (percent: number | null, hour: number): number => {
  const fill = Math.max(0, Math.min(85, percent ?? 0)) / 85
  const tide = 0.02 * Math.sin((2 * Math.PI * hour) / 12.42)
  return Math.max(0.43, Math.min(0.94, NO_CONTEXT_SHORE - fill * 0.47 + tide))
}

/** Decor unlocked by the shell collection; narrow strips skip it. */
export const DECOR = { palm: 5, chair: 10, lighthouse: 20 } as const
export const ROOMY = 500
export const hasDecor = (what: keyof typeof DECOR, shells: number, width: number): boolean => width >= ROOMY && shells >= DECOR[what]

/** The habitat's landmarks in px; the scene draws them, the plan walks to them. */
export const spots = (width: number, shore = NO_CONTEXT_SHORE) => {
  const castle = Math.round(width * 0.3)
  const sea = Math.round(width * shore)
  const pool = Math.round(width * 0.83)
  const seaweed = Math.round(width * 0.62)
  const pebble = Math.round(width * 0.44)
  return {
    castle, pebble, seaweed, pool, sea,
    pile: castle + 14,
    palm: Math.round(width * 0.22),
    chair: Math.round(width * 0.52),
    lighthouse: Math.max(40, Math.round(width * 0.07)),
    hasChair: Math.round(width * 0.52) + 12 < sea,
    hasPool: pool + 18 < sea,
    hasSeaweed: seaweed + 10 < sea,
    hasPebble: pebble + 10 < sea,
  }
}

// Where the crab stands to use a landmark: just left of it, facing it. Undefined
// where the landmark is under the sea.
const stops = (width: number, shore = NO_CONTEXT_SHORE) => {
  const at = spots(width, shore)
  const before = (x: number) => pOf(x - CRAB_W - 1, width)
  const limit = Math.min(1, pOf(at.sea - 4 - CRAB_W, width))
  return {
    home: 0, limit, castle: before(at.castle - 6), pile: before(at.pile - 1), buttons: limit,
    pebble: at.hasPebble ? before(at.pebble - 1) : undefined,
    seaweed: at.hasSeaweed ? before(at.seaweed - 1) : undefined,
    // The fish jumps from the tide pool, or from the sea once the pool is under it.
    fish: at.hasPool ? before(at.pool - 14) : limit,
    chair: at.hasChair ? Math.min(limit, pOf(at.chair - CRAB_W / 2, width)) : undefined,
  }
}

/** `y0` and `y1`: px above its usual height, for a gadget that leaves the ground. */
export type Beat = { t0: number; t1: number; p0: number; p1: number; face: 1 | -1; pose: Pose; act: Activity; y0?: number; y1?: number }

export type MarkKind = 'butterfly' | 'seagull' | 'fish' | 'neighbour' | 'pebble' | 'hole' | 'castle' | 'shell' | 'pile' | 'fireworks' | 'storm' | 'plane' | 'friend' | 'poof' | 'disco' | 'cannon'
/** Something in the habitat that moves or appears at a moment of the plan. */
export type Mark = {
  kind: MarkKind; t0: number; t1: number; p0: number; p1: number; dir: 1 | -1
  /** The friend's visit: when it arrives and when it leaves, and what they do together. */
  meet?: number; part?: number; variant?: 'dance' | 'sky' | 'chase' | 'gold' | 'muzzle'
}

export type LifeMoment = 'muse' | 'aware' | 'butterfly' | 'neighbour' | 'hic' | 'sky' | 'found' | 'built' | 'peek' | 'friend' | 'golden' | 'ride'

/** How each costume's gadget moves. `lift` is how high it flies, px; `pxs` its speed. */
export type Ride = { kind: 'drive' | 'fly' | 'surf' | 'sub' | 'stage'; pxs: number; lift?: number }
export const RIDES: Record<Costume, Ride> = {
  racer: { kind: 'drive', pxs: 95 },
  viking: { kind: 'drive', pxs: 30 },
  engineer: { kind: 'drive', pxs: 26 },
  chef: { kind: 'drive', pxs: 22 },
  plain: { kind: 'drive', pxs: 55 },
  detective: { kind: 'drive', pxs: 16 },
  oktoberfest: { kind: 'drive', pxs: 18 },
  raincoat: { kind: 'drive', pxs: 26 },
  king: { kind: 'drive', pxs: 20 },
  wizard: { kind: 'fly', pxs: 70, lift: 11 },
  santa: { kind: 'fly', pxs: 85, lift: 12 },
  ghost: { kind: 'fly', pxs: 28, lift: 7 },
  astronaut: { kind: 'fly', pxs: 0, lift: 170 },
  surfer: { kind: 'surf', pxs: 60 },
  diver: { kind: 'sub', pxs: 12 },
  dj: { kind: 'stage', pxs: 0 },
  pirate: { kind: 'stage', pxs: 0 },
}
const MIN_TRACK = 200
const SUB_W = 30
/** Where a sub rides: a little under the surface. */
const SUB_Y = -3

/** Whether its gadget has room: a track to move on, and water for the sub. */
export const rideFits = (seg: Segment): boolean => {
  if (!seg.ride) return false
  const { kind, pxs } = RIDES[seg.ride]
  if (kind === 'sub') return seg.width - spots(seg.width, seg.shore).sea >= SUB_W
  return pxs === 0 || trackSpan(seg.width) >= MIN_TRACK
}
export type LifeEvent = { t: number; kind: 'build' | 'shell' | 'tidy' | 'say'; moment?: LifeMoment; isGolden?: boolean }

export type Plan = { beats: Beat[]; marks: Mark[]; events: LifeEvent[]; duration: number; endP: number; endFace: 1 | -1 }

// mulberry32: small, fast, and the same everywhere.
export const random = (seed: number): (() => number) => {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const WALKING: ReadonlySet<Pose> = new Set(['wander', 'work', 'chase', 'carry'])
export const isWalking = (pose: Pose): boolean => WALKING.has(pose)

/** Roughly how long each activity takes once it is there, ms. */
const LENGTH: Partial<Record<Activity, number>> = {
  lookAround: 4.5 * S, gaze: 3.5 * S, peek: 4 * S, muse: 5 * S, dig: 4 * S, forage: 3.5 * S, kick: 3 * S,
  inspect: 3.5 * S, hide: 5 * S, sway: 5 * S, sunbathe: 8 * S, butterfly: 7 * S, seagull: 4 * S, fish: 5 * S,
  neighbour: 8 * S, tidy: 4 * S, friend: 12 * S, ride: 16 * S, yawn: 2.5 * S, sneeze: 2 * S, hiccup: 3 * S, skywatch: 7 * S, dance: 4.5 * S, build: 6 * S,
}

const VISITORS: ReadonlySet<Activity> = new Set(['butterfly', 'seagull', 'fish', 'neighbour'])
const ONCE: ReadonlySet<Activity> = new Set(['build', 'kick', 'neighbour', 'friend', 'ride'])

/** How likely each activity is, from its needs, the time of day and whether Claude works. */
export const weights = (seg: Segment): Partial<Record<Activity, number>> => {
  const hungry = seg.food < 30
  const bored = seg.fun < 40
  const sleepy = seg.energy < 40
  const happy = seg.fun >= 75
  const night = seg.timeOfDay === 'night'
  const isWork = seg.mode === 'work'
  const w: Partial<Record<Activity, number>> = {
    lookAround: 3, gaze: 2, peek: 0.8, muse: isWork ? 0.5 : 1,
    dig: 1.5 + (hungry ? 4 : 0), forage: 1.2 + (hungry ? 1 : 0), kick: 1 + (bored ? 3 : 0),
    inspect: 0.8, hide: 0.5 + (bored ? 0.5 : 0), sway: 1,
    sunbathe: night ? 0 : (seg.timeOfDay === 'day' ? 1 : 0.4) * (isWork ? 0.3 : 1) * (hasDecor('chair', seg.shells, seg.width) ? 2 : 1),
    friend: isWork ? 0.25 : 0.5,
    butterfly: night ? 0 : 1, seagull: night ? 0 : 0.7, fish: 0.7, neighbour: 0.5,
    yawn: 0.6 + (sleepy ? 3 : 0) + (night ? 1 : 0), sneeze: 0.35, hiccup: 0.35,
    skywatch: 0.8 + (night ? 1.5 : 0), dance: 0.7 + (happy ? 2.5 : 0), build: seg.castle < MAX_CASTLE ? 1.3 : 0,
    ride: rideFits(seg) ? (isWork ? 0.8 : 1) : 0,
  }
  if (isWork) for (const v of VISITORS) w[v] = (w[v] ?? 0) * 0.5
  if (seg.timeOfDay === 'evening') w.butterfly = (w.butterfly ?? 0) * 0.5
  const wet = seg.weather === 'rain' || seg.weather === 'storm' || seg.weather === 'snow'
  if (wet) {
    w.sunbathe = 0
    w.butterfly = 0
    w.seagull = (w.seagull ?? 0) * 0.3
    w.skywatch = (w.skywatch ?? 0) * 0.5
    w.hide = (w.hide ?? 0) + 1
  }
  return w
}

const pick = (rnd: () => number, w: Partial<Record<Activity, number>>): Activity => {
  const entries = Object.entries(w).filter(([, v]) => (v ?? 0) > 0) as [Activity, number][]
  const total = entries.reduce((s, [, v]) => s + v, 0)
  let r = rnd() * total
  for (const [k, v] of entries) {
    r -= v
    if (r <= 0) return k
  }
  return entries[entries.length - 1]?.[0] ?? 'lookAround'
}

const cache = new Map<string, Plan>()

/** The plan for a segment, worked out once per segment. */
export const planOf = (seg: Segment): Plan => {
  const key = JSON.stringify(seg)
  const hit = cache.get(key)
  if (hit) return hit
  const made = plan(seg)
  if (cache.size > 6) cache.delete(cache.keys().next().value ?? '')
  cache.set(key, made)
  return made
}

export const plan = (seg: Segment): Plan => {
  const rnd = random(seg.seed)
  const span = trackSpan(seg.width)
  const at = stops(seg.width, seg.shore)
  const inside = (x: number) => Math.min(at.limit, clamp01(x))
  const isWork = seg.mode === 'work'
  const speed = isWork ? 22 : 15
  const beats: Beat[] = []
  const marks: Mark[] = []
  const events: LifeEvent[] = []
  let t = 0
  let p = clamp01(seg.startP)
  let face: 1 | -1 = seg.startFace

  const push = (ms: number, pose: Pose, act: Activity, p1 = p, f = face, y0 = 0, y1 = y0) => {
    if (ms <= 0) return
    beats.push({ t0: t, t1: t + ms, p0: p, p1, face: f, pose, act, ...(y0 || y1 ? { y0, y1 } : {}) })
    t += ms
    p = p1
    face = f
  }
  const walkMs = (target: number, pxs = speed) => (Math.abs(target - p) * span * S) / pxs
  const walkTo = (target: number, act: Activity = 'stroll', pose: Pose = isWork ? 'work' : 'wander', pxs = speed) => {
    const to = inside(target)
    if (Math.abs(to - p) * span < 1) return
    push(walkMs(to, pxs), pose, act, to, to > p ? 1 : -1)
  }
  const stand = (ms: number, pose: Pose = 'stand', act: Activity = 'stroll', f: 1 | -1 = face) => push(ms, pose, act, p, f)
  const say = (moment: LifeMoment, dt = 300) => events.push({ t: t + dt, kind: 'say', moment })
  // A gadget beat: `to` along the strip in `ms`, from `y0` above the sand to `y1`.
  const roll = (ms: number, to = p, y0 = 0, y1 = y0) => push(ms, 'ride', 'ride', to, to > p ? 1 : to < p ? -1 : face, y0, y1)
  const poof = (at0 = p, variant?: 'muzzle') => marks.push({ kind: 'poof', t0: t, t1: t + 0.6 * S, p0: at0, p1: at0, dir: 1, ...(variant ? { variant } : {}) })
  const gone = () => {
    poof()
    stand(0.7 * S, 'stand', 'ride')
  }

  if (seg.poof) poof()

  if (seg.hold) {
    stand(seg.hold.ms, seg.hold.pose, 'hold')
    // The big moments get a set piece across the whole strip.
    const piece = seg.hold.pose === 'party' ? 'fireworks' : seg.hold.pose === 'nervous' ? 'storm' : seg.hold.pose === 'wave' ? 'plane' : null
    if (piece) marks.push({ kind: piece, t0: 0, t1: piece === 'plane' ? Math.max(seg.hold.ms, 7 * S) : seg.hold.ms + 0.6 * S, p0: p, p1: p, dir: 1 })
  }
  // The sea came in while it stood there: step out of the water first.
  if (p > at.limit) walkTo(at.limit)

  if (seg.mode === 'sleep' || seg.mode === 'stretch') {
    walkTo(at.home)
    if (seg.mode === 'sleep') stand(10 * 60 * S, 'nap', 'sleep', -1)
    else stand(10 * 60 * S, 'stretch', 'stretch', 1)
    return { beats, marks, events, duration: t, endP: p, endFace: face }
  }

  const where: Partial<Record<Activity, number>> = {
    peek: at.buttons, inspect: at.home, hide: at.home, fish: at.fish, build: at.castle, tidy: at.pile,
    ...(at.pebble === undefined ? {} : { kick: at.pebble }),
    ...(at.seaweed === undefined ? {} : { sway: at.seaweed }),
    // With a deck chair it sunbathes in it.
    ...(at.chair !== undefined && hasDecor('chair', seg.shells, seg.width) ? { sunbathe: at.chair } : {}),
    // The wave and the sub start at the water's edge.
    ...(seg.ride && (RIDES[seg.ride].kind === 'surf' || RIDES[seg.ride].kind === 'sub') ? { ride: at.limit } : {}),
  }
  const drowned: Activity[] = [...(at.pebble === undefined ? ['kick' as const] : []), ...(at.seaweed === undefined ? ['sway' as const] : [])]
  const target = isWork ? 120 * S : 150 * S
  const done = new Set<Activity>()
  let last: Activity | null = null
  let built = seg.castle

  const run = (a: Activity) => {
    switch (a) {
      case 'lookAround':
        stand(1.6 * S, 'look', a)
        stand(1.6 * S, 'look', a, face === 1 ? -1 : 1)
        stand(1.3 * S, 'look', a, face === 1 ? -1 : 1)
        return
      case 'gaze':
        if (rnd() < 0.4) stand(2.8 * S, 'wink', a)
        else stand(3.5 * S, 'gaze', a)
        if (rnd() < 0.35) say('aware', -2500)
        return
      case 'peek':
        stand(4 * S, 'peek', a, 1)
        if (rnd() < 0.5) say('peek', -3000)
        return
      case 'muse':
        say('muse', 600)
        stand(5 * S, 'muse', a)
        return
      case 'dig':
        stand(4 * S, 'dig', a)
        marks.push({ kind: 'hole', t0: t, t1: t + 25 * S, p0: p, p1: p, dir: face })
        return
      case 'forage': {
        stand(3 * S, 'dig', a)
        if (rnd() < 0.55) {
          walkTo(at.home, a, 'carry')
          stand(1.2 * S, 'cheer', a, -1)
          const isGolden = rnd() < 0.03
          events.push({ t: t - 1.2 * S, kind: 'shell', isGolden })
          marks.push({ kind: 'shell', t0: t - 1.2 * S, t1: t, p0: 0, p1: 0, dir: -1, ...(isGolden ? { variant: 'gold' as const } : {}) })
          say(isGolden ? 'golden' : 'found', -1000)
        } else {
          stand(1.4 * S, 'look', a)
        }
        return
      }
      case 'kick':
        stand(0.7 * S, 'kick', a, 1)
        marks.push({ kind: 'pebble', t0: t - 0.3 * S, t1: t + 9 * S, p0: p, p1: p, dir: 1 })
        stand(2.2 * S, 'look', a, 1)
        return
      case 'inspect':
        stand(2 * S, 'look', a, -1)
        stand(1.5 * S, 'peek', a, -1)
        return
      case 'hide':
        stand(5 * S, 'hide', a, 1)
        return
      case 'sway':
        stand(5 * S, 'sway', a, 1)
        return
      case 'sunbathe':
        stand(8 * S, 'sun', a)
        return
      case 'butterfly': {
        const dir: 1 | -1 = p < at.limit / 2 ? 1 : -1
        const to = clamp01(p + dir * Math.min(0.35, 140 / span))
        const t0 = t
        const from = p
        walkTo(to, a, 'chase', 34)
        stand(1.6 * S, 'look', a, dir)
        marks.push({ kind: 'butterfly', t0: Math.max(0, t0 - 0.8 * S), t1: t, p0: from, p1: p, dir })
        if (rnd() < 0.4) say('butterfly', -1500)
        return
      }
      case 'seagull':
        stand(0.9 * S, 'look', a)
        marks.push({ kind: 'seagull', t0: t - 0.4 * S, t1: t + 3.2 * S, p0: p, p1: p, dir: -1 })
        stand(1.6 * S, 'duck', a)
        stand(1.4 * S, 'look', a, -1)
        return
      case 'fish':
        stand(1 * S, 'stand', a, 1)
        marks.push({ kind: 'fish', t0: t, t1: t + 1.3 * S, p0: p, p1: p, dir: 1 })
        stand(1.6 * S, 'notice', a, 1)
        stand(2.2 * S, 'look', a, 1)
        return
      case 'neighbour':
        if (p > 0.7) walkTo(0.6)
        marks.push({ kind: 'neighbour', t0: t, t1: t + 8.5 * S, p0: p, p1: p, dir: -1 })
        stand(2.2 * S, 'look', a, 1)
        stand(3 * S, 'wave', a, 1)
        say('neighbour', -2000)
        stand(1 * S, 'stand', a, 1)
        stand(2.3 * S, 'look', a, 1)
        return
      case 'yawn':
        stand(2.5 * S, 'yawn', a)
        return
      case 'sneeze':
        stand(0.6 * S, 'stand', a)
        stand(1.4 * S, 'sneeze', a)
        return
      case 'hiccup':
        say('hic', 200)
        stand(3 * S, 'hic', a)
        return
      case 'skywatch':
        stand(7 * S, 'skywatch', a)
        if (rnd() < 0.3) say('sky', -4000)
        return
      case 'dance':
        stand(4.5 * S, 'dance', a)
        return
      case 'friend': {
        // A blue friend crab walks in from the left; they play, then it walks off again.
        if (p < 0.12) walkTo(0.2)
        const variant = seg.timeOfDay === 'night' || seg.timeOfDay === 'evening' ? 'sky' : rnd() < 0.5 ? 'dance' : 'chase'
        const t0 = t
        stand(3 * S, 'look', a, -1)
        stand(1.2 * S, 'wave', a, -1)
        const meet = t
        const from = p
        if (variant === 'dance') stand(4.5 * S, 'dance', a, 1)
        else if (variant === 'sky') stand(6 * S, 'skywatch', a, 1)
        else walkTo(p + Math.min(0.25, 120 / span), a, 'chase', 30)
        const part = t
        stand(3 * S, 'wave', a, -1)
        marks.push({ kind: 'friend', t0, t1: t, p0: from, p1: p, dir: 1, meet, part, variant })
        say('friend', -6000)
        return
      }
      case 'ride': {
        const ride = seg.ride ? RIDES[seg.ride] : undefined
        if (!ride || !rideFits(seg)) {
          stand(3 * S, 'look', a)
          return
        }
        const { kind, pxs, lift = 0 } = ride
        const reach = (secs: number) => (pxs * secs) / span
        const toward = (d: number) => Math.max(0, Math.min(at.limit, p + d))
        const msTo = (to: number) => (Math.abs(to - p) * span * S) / Math.max(1, pxs)
        const dir = p < at.limit / 2 ? 1 : -1
        say('ride', 800)
        if (kind === 'drive') {
          poof()
          const out = toward(dir * reach(9))
          roll(msTo(out), out)
          roll(0.7 * S)
          // The turn happens behind a puff of dust: the wide ones swing right round.
          poof()
          const back = toward(-dir * reach(5))
          roll(msTo(back), back)
        } else if (kind === 'fly' && pxs === 0) {
          // Straight up off the top of the sky, and back down on its tail.
          poof()
          roll(1.6 * S)
          roll(2.6 * S, p, 0, lift)
          roll(2 * S, p, lift)
          roll(3 * S, p, lift, 0)
        } else if (kind === 'fly') {
          poof()
          const up = 1.6 * S
          const across = 7 * S
          const d = dir * reach(8.6)
          const start = p
          const end = toward(d)
          const at1 = start + (end - start) * (up / (2 * up + across))
          const at2 = end - (end - start) * (up / (2 * up + across))
          roll(up, at1, 0, lift)
          roll(across, at2, lift)
          roll(up, end, lift, 0)
        } else if (kind === 'surf') {
          // A wave comes in past the shoreline and carries it up the sand.
          poof()
          const to = toward(-reach(6))
          roll(msTo(to), to)
        } else if (kind === 'sub') {
          // It wades in, and the sub comes up where it went under.
          const wade = pOf(spots(seg.width, seg.shore).sea + 2, seg.width)
          push(walkMs(wade), isWork ? 'work' : 'wander', 'ride', wade, 1)
          poof()
          roll(1.6 * S, p, -24, SUB_Y)
          const out = Math.min(1, p + reach(5))
          roll(msTo(out), out, SUB_Y)
          roll(1.2 * S, p, SUB_Y)
          roll(msTo(wade), wade, SUB_Y)
          roll(1.6 * S, p, SUB_Y, -24)
          gone()
          walkTo(at.limit)
          return
        } else if (seg.ride === 'pirate') {
          poof()
          face = 1
          roll(1.4 * S)
          const shot = t
          poof(Math.min(1, p + (44 - CRAB_W / 2) / span), 'muzzle')
          marks.push({ kind: 'cannon', t0: shot, t1: shot + 2.2 * S, p0: p, p1: p, dir: 1 })
          roll(3.4 * S)
        } else {
          poof()
          marks.push({ kind: 'disco', t0: t, t1: t + 9 * S, p0: p, p1: p, dir: 1 })
          roll(9 * S)
        }
        gone()
        return
      }
      case 'tidy':
        // Clears the work pile: picks it up and carries it home.
        stand(1 * S, 'build', a, 1)
        events.push({ t, kind: 'tidy' })
        marks.push({ kind: 'pile', t0: t, t1: t, p0: p, p1: p, dir: 1 })
        walkTo(at.home, a, 'carry')
        stand(0.8 * S, 'cheer', a, -1)
        return
      case 'build':
        stand(6 * S, 'build', a, 1)
        built = Math.min(MAX_CASTLE, built + 1)
        events.push({ t, kind: 'build' })
        marks.push({ kind: 'castle', t0: t - 0.6 * S, t1: t, p0: p, p1: p, dir: 1 })
        say('built', 0)
        return
      default:
        stand(LENGTH[a] ?? 3 * S, 'stand', a)
    }
  }

  let first: Activity | undefined = seg.first
  while (t < target) {
    const gap = (isWork ? 12 + rnd() * 12 : 20 + rnd() * 20) * S
    let a: Activity = 'lookAround'
    if (first) {
      a = first
      first = undefined
    } else {
      const w = weights({ ...seg, castle: built })
      if (last) delete w[last]
      for (const gone of drowned) delete w[gone]
      for (const once of done) if (ONCE.has(once)) delete w[once]
      for (let tries = 0; tries < 6; tries++) {
        const c = pick(rnd, w)
        const loc = where[c]
        // A ride is worth the walk to the water, however far off it is.
        if (loc === undefined || c === 'ride' || walkMs(loc, 32) <= gap - (LENGTH[c] ?? 0) - S) {
          a = c
          break
        }
        delete w[c]
      }
    }
    const loc = where[a]
    const len = LENGTH[a] ?? 3 * S
    // Walk somewhere, or to the activity's spot, filling the gap; pause on the way when there is time.
    const room = Math.max(0, gap - len)
    const dest = loc ?? inside(p + (rnd() * 2 - 1) * ((room / S) * speed) / span)
    const pxs = Math.max(speed, Math.min(32, (Math.abs(dest - p) * span * S) / Math.max(S, room - S)))
    const spare = room - walkMs(dest, pxs)
    if (spare > 1.5 * S) {
      const mid = p + (dest - p) * (0.3 + rnd() * 0.4)
      walkTo(mid, 'stroll', isWork ? 'work' : 'wander', pxs)
      if (spare > 3.5 * S && rnd() < 0.6) {
        stand(spare / 2, 'look', 'stroll')
        stand(spare / 2, 'stand', 'stroll', face === 1 ? -1 : 1)
      } else {
        stand(spare, 'stand', 'stroll')
      }
    }
    walkTo(dest, 'stroll', isWork ? 'work' : 'wander', pxs)
    run(a)
    done.add(a)
    last = a
  }
  return { beats, marks, events, duration: t, endP: p, endFace: face }
}

export type Where = { p: number; face: 1 | -1; pose: Pose; act: Activity; lift: number }

/** Where the crab is `t` ms into a plan, and what it is doing. */
export const whereAt = (pl: Plan, t: number): Where => {
  for (const b of pl.beats) {
    if (t < b.t1) {
      const k = b.t1 > b.t0 ? Math.max(0, (t - b.t0) / (b.t1 - b.t0)) : 1
      const y0 = b.y0 ?? 0
      return { p: b.p0 + (b.p1 - b.p0) * k, face: b.face, pose: b.pose, act: b.act, lift: y0 + ((b.y1 ?? 0) - y0) * k }
    }
  }
  const lastBeat = pl.beats[pl.beats.length - 1]
  return { p: pl.endP, face: pl.endFace, pose: lastBeat?.pose ?? 'stand', act: lastBeat?.act ?? 'stroll', lift: 0 }
}

/** Activity starts, for checking the pace. */
export const activityStarts = (pl: Plan): { act: Activity; t: number }[] => {
  const out: { act: Activity; t: number }[] = []
  let prev: Activity | null = null
  for (const b of pl.beats) {
    if (b.act !== prev && b.act !== 'stroll' && b.act !== 'hold') out.push({ act: b.act, t: b.t0 })
    prev = b.act
  }
  return out
}
