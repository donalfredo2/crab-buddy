import { atom, read, update } from 'claude-code'
import type { EngineInterface, PaneCloseInput, PluginOptions, Register, Timer } from 'claude-code'

import type { Activity, Antic, BreakState, Bubble, LifeMode, Mood, Needs, Pose, Prop, ReactionMood, Segment, Tiredness, Weather, WeatherNow } from '../types'
import { planOf, rideFits, shoreFrac, whereAt } from './life'
import type { LifeEvent } from './life'
import { line, themeLine, themeName } from './lines'
import type { Moment } from './lines'
import { care, cooldownLeft, freshNeeds, gain, isHungry, isSleepy, petMood, rest, tick } from './pet'
import type { Care } from './pet'
import { SCENE_H, sceneSvg, timeOfDay } from './scene'
import { WINDY_KMH, holiday, skyFor, weatherOf } from './sky'
import type { Sky } from './sky'
import { CLAY, COSTUMES, costumeOfDay, isCostume } from './sprites'
import { beachCells } from './terminal'
import type { Costume, CrabLook } from './sprites'

const reaction = atom({ plugin: 'crab-buddy', key: 'reaction' } as const, null)
const picked = atom({ plugin: 'crab-buddy', key: 'costume' } as const, null)
const isHidden = atom({ plugin: 'crab-buddy', key: 'isHidden' } as const, false)
const stats = atom({ plugin: 'crab-buddy', key: 'stats' } as const, { startedAt: 0, turns: 0, toolCalls: 0 })
const contextPercent = atom({ plugin: 'crab-buddy', key: 'contextPercent' } as const, null)
const contextWarned = atom({ plugin: 'crab-buddy', key: 'contextWarned' } as const, false)
const breaks = atom({ plugin: 'crab-buddy', key: 'breaks' } as const, { streakStart: 0, lastActive: 0, snoozedUntil: 0, toastedFor: 0 })
const areBreaksOff = atom({ plugin: 'crab-buddy', key: 'areBreaksOff' } as const, false)
const isSoundOff = atom({ plugin: 'crab-buddy', key: 'isSoundOff' } as const, false)
const needs = atom({ plugin: 'crab-buddy', key: 'needs' } as const, null)
const restedAt = atom({ plugin: 'crab-buddy', key: 'restedAt' } as const, 0)
const petName = atom({ plugin: 'crab-buddy', key: 'name' } as const, 'Crabby')
const bubble = atom({ plugin: 'crab-buddy', key: 'bubble' } as const, null)
const lastBubbleAt = atom({ plugin: 'crab-buddy', key: 'lastBubbleAt' } as const, 0)
const bubbleMode = atom({ plugin: 'crab-buddy', key: 'bubbleMode' } as const, 'rare')
const life = atom({ plugin: 'crab-buddy', key: 'life' } as const, null)
const antic = atom({ plugin: 'crab-buddy', key: 'antic' } as const, null)
const weather = atom({ plugin: 'crab-buddy', key: 'weather' } as const, null)
const turnWork = atom({ plugin: 'crab-buddy', key: 'turnWork' } as const, [])
const isTank = atom({ plugin: 'crab-buddy', key: 'isTank' } as const, false)
// savvy-progress draws its own crab in its bar: ours steps aside while that bar is up.
const savvyFlow = { plugin: 'savvy-progress', key: 'flow' } as const

const MIN = 60_000
const REACT_MS = 2600
const WAVE_MS = 4000
const CARE_MS = 3200
const BUBBLE_MS = 4500
const GREET_MS = 8000
const IDLE_MS = 15 * MIN
const AWAKE_MS = 10 * MIN
const SNOOZE_MS = 30 * MIN
const CONTEXT_WARN = 85
const CHIRP = 'sounds/chirp.wav'
const BUBBLE_GAP: Record<string, number> = { often: 5 * MIN, rare: 15 * MIN }
const NOTICE_MS = 1600
const PROP_MS = 3500
/** A different tool's prop waits this long, so a burst of calls doesn't flicker. */
const PROP_SWITCH_MS = 3000
/** VS Code closes a picture's frame after 30 s with nothing moving, and the next one starts healthy. */
const RESTART_MS = 35_000

// The tool Claude is using, mirrored by a prop in the crab's claw.
const PROPS: Record<string, Prop> = {
  Read: 'scroll', Grep: 'magnifier', Glob: 'magnifier', Edit: 'hammer', Write: 'hammer', NotebookEdit: 'hammer',
  Bash: 'keyboard', WebSearch: 'binoculars', WebFetch: 'binoculars', Agent: 'whistle', Task: 'whistle',
}

// $.store keys: choices made with /crab and the pet itself outlive the session.
const KEY = {
  hidden: 'isHidden', breaksOff: 'areBreaksOff', soundOff: 'isSoundOff', needs: 'needs', name: 'name',
  firstMet: 'firstMet', bubbles: 'bubbles', castle: 'castle', shells: 'shells', golden: 'goldenShells', weather: 'weather', geo: 'weatherGeo',
  greeted: 'greetedDay', tank: 'isTank',
} as const

const TERMINAL_GLYPH: Record<Mood, string> = {
  nap: 'z', work: '…', wander: '·', cheer: '✦', daze: '✗', wave: '👋', party: '🎉', cool: '😎', nervous: '💦', stretch: '🙆', eat: '🍤', play: '🎾', love: '♥',
}
const MOOD_WORD: Record<Mood, string> = {
  nap: 'napping', work: 'working', wander: 'wandering', cheer: 'cheering', daze: 'dazed', wave: 'waving', party: 'partying',
  cool: 'cool', nervous: 'nervous', stretch: 'stretching', eat: 'eating', play: 'playing', love: 'happy to be petted',
}
const ACT_WORD: Partial<Record<Activity, string>> = {
  lookAround: 'looking around', gaze: 'looking at you', peek: 'peeking at the buttons', muse: 'thinking', dig: 'digging',
  forage: 'looking for shells', kick: 'kicking a pebble', inspect: 'checking its shell', hide: 'hiding in a shell',
  sway: 'swaying with the seaweed', sunbathe: 'sunbathing', butterfly: 'chasing a butterfly', seagull: 'ducking from a seagull',
  ride: 'out on its gadget', fish: 'watching a fish', neighbour: 'saying hi to a neighbour', yawn: 'yawning', sneeze: 'sneezing', hiccup: 'hiccuping',
  skywatch: 'watching the sky', dance: 'dancing', build: 'building its sandcastle', tidy: 'tidying up the work pile', friend: 'playing with its friend',
}

// git's own options may sit before the subcommand: `git -c user.name=x -C repo --no-pager commit`.
const COMMIT = /\bgit(?:\s+-[cC]\s+\S+|\s+--?[\w-]+(?:=\S+)?)*\s+commit\b/
// `claude"?` also catches a quoted path to the binary: `"/…/claude" plugin test`.
const TEST = /\b(?:(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?test|pytest|vitest|jest|go\s+test|cargo\s+test|claude"?\s+plugin\s+test|xcodebuild\s+test)\b/
const BUILD = /\b(?:(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?build|xcodebuild|cargo\s+build|go\s+build|tsc)\b/

// What a finished shell command makes the crab feel; null when it is none of ours.
export const reactionTo = (command: string, isError: boolean): ReactionMood | null => {
  if (COMMIT.test(command)) return isError ? null : 'party'
  if (TEST.test(command)) return isError ? 'nervous' : 'cool'
  if (BUILD.test(command)) return isError ? null : 'cool'
  return null
}

export const tirednessOf = (percent: number | null): Tiredness =>
  percent === null ? 'fresh' : percent >= 80 ? 'sweaty' : percent >= 50 ? 'tired' : 'fresh'

export const fmtDuration = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h) return `${h}h ${m}m`
  return m ? `${m}m ${s % 60}s` : `${s}s`
}

// Due once the streak reaches the limit, unless snoozed or idle long enough to reset.
export const isBreakDue = (b: BreakState, now: number, limitMs: number): boolean =>
  limitMs > 0 && b.streakStart > 0 && now - b.lastActive < IDLE_MS && now - b.streakStart >= limitMs && now >= b.snoozedUntil

export const cleanName = (raw: string): string =>
  raw.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 16)

const isNeeds = (v: unknown): v is Needs =>
  !!v && typeof v === 'object' && ['food', 'fun', 'energy', 'updatedAt'].every(k => typeof (v as Record<string, unknown>)[k] === 'number')

const numberOption = (options: PluginOptions, name: string, fallback: number): number => {
  const v = Number(options[name])
  return Number.isFinite(v) && v >= 0 ? v : fallback
}

const hourOf = (now: number): number => new Date(now).getHours()

/** Shells it takes to earn the crown. */
export const KING_SHELLS = 50

// Set from the options each time the module loads.
const cfg = { longMs: 120_000, breakMs: 90 * MIN, place: '' }
// Module scope is fine: a reload mid-turn only delays the idle check by a turn.
let isTurnRunning = false
// The strip's last drawn width: a new segment plans its walks for it.
let lastWidth = 800
// What the surface last reported for the strip, for /crab size.
let lastBand: { surface: string; columns: number; viewport?: number; width: number } | null = null
// Where the surface last seated the tank, for /crab tank to report.
let tankSeat: { placement: string; columns: number } | null = null
const TANK = 'crab-tank'
// The terminal's beach: each drawn Raster by its site, repainted on a timer.
const RASTER = 'crab-beach'
const rasters = new Map<string, { columns: number; rows: number }>()
let frame = 0
let isPainting = false
let painter: Timer | null = null

export const dayKey = (now: number): string => {
  const d = new Date(now)
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}
type Castle = { day: string; stage: number; last: string }
type Shells = { count: number; last: string }
const isCastle = (v: unknown): v is Castle => !!v && typeof v === 'object' && typeof (v as Castle).day === 'string' && typeof (v as Castle).stage === 'number'
const isShells = (v: unknown): v is Shells => !!v && typeof v === 'object' && typeof (v as Shells).count === 'number'
const segKey = (seg: Segment): string => `${seg.startAt}:${seg.seed}`

/** One more castle stage, today's; null when this segment already built (a second session, a replay). */
export const nextCastle = (stored: unknown, today: string, key: string): Castle | null => {
  if (isCastle(stored) && stored.last === key) return null
  const stage = isCastle(stored) && stored.day === today ? stored.stage : 0
  return { day: today, stage: Math.min(5, stage + 1), last: key }
}

export const nextShells = (stored: unknown, key: string): Shells | null => {
  if (isShells(stored) && stored.last === key) return null
  return { count: (isShells(stored) ? stored.count : 0) + 1, last: key }
}

/** Today's costume where you are: a holiday's own, else the day's. */
export const costumeAt = (now: number): Costume => {
  const d = new Date(now)
  const hol = holiday(d)
  return hol === 'halloween' ? 'ghost' : hol === 'christmas' ? 'santa' : hol === 'oktoberfest' ? 'oktoberfest' : costumeOfDay(now, d.getTimezoneOffset())
}

/** What it wears unless you picked: a holiday's costume stays on in the rain, a daily one gives way to the raincoat. */
export const wornAt = (now: number, weatherKind?: Weather): Costume => {
  const day = costumeAt(now)
  return (weatherKind === 'rain' || weatherKind === 'storm') && (COSTUMES as readonly string[]).includes(day) ? 'raincoat' : day
}

export const themeAt = (now: number): string => themeName(costumeAt(now), holiday(new Date(now)))

// The strip's own width, in px, on the surfaces that draw it as an image. The image always
// takes the row's room left of the buttons; this only sets how wide a beach is drawn into
// it, so a wrong guess stretches the pixels a little and never leaves a gap.
// Desktop: a cell of the code font is about 8 px. With a 125 px reserve the row had 60 to
// 120 px spare beside the three buttons, so 75 leaves them room either way; Snooze takes
// about 50 more. VS Code: a column is the chat font's wide `─`, about 13.5 px, and its
// native buttons are larger.
const ROOM = { desktop: { cell: 8, buttons: 75, snooze: 50 }, vscode: { cell: 13.5, buttons: 120, snooze: 70 } }

export const stripWidth = (bodyColumns: number, isDue: boolean, surface?: string): number => {
  const room = surface === 'vscode' ? ROOM.vscode : ROOM.desktop
  return Math.max(200, Math.min(1600, Math.round((bodyColumns || 100) * room.cell) - room.buttons - (isDue ? room.snooze : 0)))
}

/**
 * The tank: the same beach drawn bigger (2x in a 352 px dock by default; 1x to 2.5x
 * by width), with more sky above. Docked beside the chat it is nearly square; seated
 * above the prompt, a low band. 8 px a cell, less a cell of margin.
 */
export const tankSize = (bodyColumns: number, placement: 'dock' | 'inline') => {
  const width = Math.max(200, Math.min(1600, (bodyColumns || 40) * 8 - 8))
  const scale = Math.max(1, Math.min(2.5, width / 176))
  const height = placement === 'dock' ? Math.max(160, Math.min(640, Math.round(width * 0.8))) : 160
  return { width, height, sceneWidth: Math.round(width / scale), sceneHeight: Math.max(SCENE_H, Math.round(height / scale)) }
}

/** The terminal's strip: three rows, leaving room for the buttons beside it. */
export const terminalColumns = (bodyColumns: number, isDue: boolean): number => Math.max(20, (bodyColumns || 100) - (isDue ? 30 : 18))

/** The tank in a terminal: docked, as tall as the dock allows up to 14 rows; inline, 4. */
export const terminalTankRows = (bodyRows: number, placement: 'dock' | 'inline'): number =>
  placement === 'dock' ? Math.max(4, Math.min(14, bodyRows - 2)) : 4

async function todays($: EngineInterface): Promise<Costume> {
  return wornAt(await $.clock.now(), (await read($, weather))?.kind)
}

/** What it has on: the one you picked, else today's. */
async function wearing($: EngineInterface): Promise<Costume> {
  const choice = await read($, picked)
  return isCostume(choice) ? choice : todays($)
}

async function react($: EngineInterface, mood: ReactionMood, ms = REACT_MS, first?: Activity): Promise<void> {
  const until = (await $.clock.now()) + ms
  await update($, reaction, () => ({ mood, until }))
  $.clock.after(ms, () => {
    void update($, reaction, r => (r && r.until <= until ? null : r))
  })
  await startSegment($, { hold: { pose: mood, ms }, ...(first ? { first } : {}) })
}

// What it should be doing now: the break reminder, working with Claude, its own life, or asleep.
async function desiredMode($: EngineInterface): Promise<LifeMode> {
  const now = await $.clock.now()
  const b = await read($, breaks)
  if (!(await read($, areBreaksOff)) && isBreakDue(b, now, cfg.breakMs)) return 'stretch'
  if (isTurnRunning) return 'work'
  const n = (await read($, needs)) ?? freshNeeds(now)
  const isAwake = b.lastActive > 0 && now - b.lastActive < AWAKE_MS && timeOfDay(hourOf(now)) !== 'night' && !isSleepy(n)
  return isAwake ? 'idle' : 'sleep'
}

async function traces($: EngineInterface): Promise<{ castle: number; shells: number; golden: number }> {
  const now = await $.clock.now()
  const c = await $.store.get(KEY.castle)
  const sh = await $.store.get(KEY.shells)
  const gold = await $.store.get(KEY.golden)
  return { castle: isCastle(c) && c.day === dayKey(now) ? c.stage : 0, shells: isShells(sh) ? sh.count : 0, golden: isShells(gold) ? gold.count : 0 }
}

/**
 * Starts the next stretch of its life from wherever it stands now, so it never
 * jumps. A "!" from noticing you carries over into the new segment.
 */
async function startSegment($: EngineInterface, opts: { hold?: { pose: Pose; ms: number }; first?: Activity } = {}): Promise<void> {
  const now = await $.clock.now()
  const cur = await read($, life)
  let p = 0
  let face: 1 | -1 = 1
  let hold = opts.hold
  let poof = false
  if (cur) {
    const here = whereAt(planOf(cur), now - cur.startAt)
    p = here.p
    face = here.face
    poof = here.pose === 'ride'
    const left = cur.hold ? cur.startAt + cur.hold.ms - now : 0
    if (!hold && cur.hold?.pose === 'notice' && left > 0) hold = { pose: 'notice', ms: left }
  }
  const n = await currentNeeds($)
  const tr = await traces($)
  const id = (cur?.id ?? 0) + 1
  const seg: Segment = {
    id, seed: (Math.imul(Math.floor(now) % 2147483647, 2654435761) ^ Math.imul(id, 40503)) >>> 0, startAt: now, startP: p, startFace: face,
    mode: await desiredMode($), width: lastWidth, castle: tr.castle, shells: tr.shells, golden: tr.golden,
    food: n.food, fun: n.fun, energy: n.energy, timeOfDay: timeOfDay(hourOf(now)),
    weather: (await read($, weather))?.kind ?? 'clear',
    shore: shoreFrac(await read($, contextPercent), new Date(now).getHours() + new Date(now).getMinutes() / 60),
    ride: await wearing($),
    ...(hold ? { hold } : {}), ...(opts.first ? { first: opts.first } : {}), ...(poof ? { poof } : {}),
  }
  await update($, life, () => seg)
  const pl = planOf(seg)
  for (const ev of pl.events) $.clock.after(Math.max(0, ev.t), () => void lifeEvent($, id, ev))
  $.clock.after(Math.max(1000, pl.duration), () => void nextSegment($, id))
}

async function nextSegment($: EngineInterface, id: number): Promise<void> {
  if ((await read($, life))?.id === id) await startSegment($)
}

// A moment of its plan: a line to say, a castle stage, a shell for the pile. Only
// while that segment is still the one playing, and only once.
async function lifeEvent($: EngineInterface, id: number, ev: LifeEvent): Promise<void> {
  const seg = await read($, life)
  if (!seg || seg.id !== id) return
  if (ev.kind === 'say' && ev.moment) return say($, ev.moment === 'ride' ? `ride-${seg.ride ?? 'plain'}` : ev.moment)
  if (ev.kind === 'tidy') {
    await update($, turnWork, () => [])
    return
  }
  const now = await $.clock.now()
  const key = segKey(seg)
  if (ev.kind === 'build') {
    const c = nextCastle(await $.store.get(KEY.castle), dayKey(now), key)
    if (c) await $.store.set(KEY.castle, c)
  } else if (ev.kind === 'shell') {
    const which = ev.isGolden ? KEY.golden : KEY.shells
    const sh = nextShells(await $.store.get(which), key)
    if (sh) await $.store.set(which, sh)
    if (sh?.count === KING_SHELLS && !ev.isGolden) await $.ui.toast(`${KING_SHELLS} shells! The crown is yours: /crab king`)
  }
}

// Changes of mode that no event announces: dozing off, night falling, a break due.
async function maybeShift($: EngineInterface): Promise<void> {
  const now = await $.clock.now()
  const cur = await read($, life)
  if (cur?.hold && now < cur.startAt + cur.hold.ms) return
  if (!cur || cur.mode !== (await desiredMode($))) await startSegment($)
}

async function showProp($: EngineInterface, prop: Prop): Promise<void> {
  const now = await $.clock.now()
  const cur = await read($, antic)
  const isOn = !!cur && cur.until > now
  const next: Antic = isOn && cur.prop === prop ? { ...cur, until: now + PROP_MS }
    : isOn && now - cur.since < PROP_SWITCH_MS ? { ...cur, until: Math.max(cur.until, now + PROP_MS) }
      : { prop, since: now, until: now + PROP_MS }
  await update($, antic, () => next)
  const until = next?.until ?? 0
  $.clock.after(PROP_MS, () => void update($, antic, a => (a && a.until <= until ? null : a)))
  // Whistling for help: the hermit-crab neighbour pops over, at most once a minute.
  if (prop === 'whistle') {
    const seg = await read($, life)
    if (!(seg?.first === 'neighbour' && now - seg.startAt < MIN)) await startSegment($, { first: 'neighbour' })
  }
}

type Geo = { place: string; lat: number; lon: number }
type StoredWeather = { place: string; at: number; code: number; wind: number }
const isGeo = (v: unknown): v is Geo => !!v && typeof v === 'object' && typeof (v as Geo).lat === 'number' && typeof (v as Geo).lon === 'number' && typeof (v as Geo).place === 'string'
const isStoredWeather = (v: unknown): v is StoredWeather =>
  !!v && typeof v === 'object' && typeof (v as StoredWeather).at === 'number' && typeof (v as StoredWeather).code === 'number' && typeof (v as StoredWeather).place === 'string'
const WEATHER_MS = 60 * MIN
let isFetching = false

export const toWeatherNow = (w: StoredWeather): WeatherNow => ({ kind: weatherOf(w.code), isWindy: (w.wind ?? 0) >= WINDY_KMH, at: w.at })

async function getJson($: EngineInterface, url: string): Promise<unknown> {
  const res = await $.http.fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return JSON.parse(res.text) as unknown
}

/**
 * The real weather for the place in the settings, at most once an hour, kept in
 * $.store so every open session shares it. Only the place's name and coordinates
 * go out, to Open-Meteo. No place set, or offline: clear skies, no errors.
 */
async function refreshWeather($: EngineInterface): Promise<void> {
  if (!cfg.place) {
    await update($, weather, () => null)
    return
  }
  const now = await $.clock.now()
  const stored = await $.store.get(KEY.weather)
  if (isStoredWeather(stored) && stored.place === cfg.place) {
    await update($, weather, () => toWeatherNow(stored))
    if (now - stored.at < WEATHER_MS) return
  }
  if (isFetching) return
  isFetching = true
  try {
    let geo = await $.store.get(KEY.geo)
    if (!isGeo(geo) || geo.place !== cfg.place) {
      const found = (await getJson($, `https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(cfg.place)}`)) as { results?: { latitude?: number; longitude?: number }[] }
      const hit = found.results?.[0]
      if (typeof hit?.latitude !== 'number' || typeof hit.longitude !== 'number') return
      geo = { place: cfg.place, lat: hit.latitude, lon: hit.longitude }
      await $.store.set(KEY.geo, geo)
    }
    const { lat, lon } = geo as Geo
    const data = (await getJson($, `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(2)}&longitude=${lon.toFixed(2)}&current=weather_code,wind_speed_10m`)) as { current?: { weather_code?: number; wind_speed_10m?: number } }
    const code = data.current?.weather_code
    if (typeof code !== 'number') return
    const w: StoredWeather = { place: cfg.place, at: now, code, wind: data.current?.wind_speed_10m ?? 0 }
    await $.store.set(KEY.weather, w)
    await update($, weather, () => toWeatherNow(w))
  } catch {
    // Offline or the service is down: keep what we had.
  } finally {
    isFetching = false
  }
}

async function minuteTick($: EngineInterface): Promise<void> {
  await refreshWeather($)
  await checkBreak($)
  await tickNeeds($)
  await maybeShift($)
}

/** A speech bubble. `isAsked` bubbles answer the person and skip the rate limit. */
async function say($: EngineInterface, moment: Moment, isAsked = false, time?: string): Promise<void> {
  const mode = await read($, bubbleMode)
  if (mode === 'off') return
  const now = await $.clock.now()
  if (!isAsked && now - (await read($, lastBubbleAt)) < (BUBBLE_GAP[mode] ?? 15 * MIN)) return
  await showBubble($, line(moment, now / 1000, { name: await read($, petName), time }), now, BUBBLE_MS)
  // Only unprompted lines count toward the quiet time: answering you never uses it up.
  if (!isAsked) await update($, lastBubbleAt, () => now)
}

async function showBubble($: EngineInterface, text: string, now: number, ms: number): Promise<void> {
  const until = now + ms
  await update($, bubble, () => ({ text, until }))
  $.clock.after(ms, () => {
    void update($, bubble, b => (b && b.until <= until ? null : b))
  })
}

// Your first message of the day, in any session, gets today's theme. It counts as an
// unprompted line, so a "late" line right after doesn't talk over it.
async function greet($: EngineInterface): Promise<void> {
  if ((await read($, bubbleMode)) === 'off') return
  const now = await $.clock.now()
  const today = dayKey(now)
  if ((await $.store.get(KEY.greeted)) === today) return
  await $.store.set(KEY.greeted, today)
  await showBubble($, themeLine(await todays($), holiday(new Date(now))), now, GREET_MS)
  await update($, lastBubbleAt, () => now)
}

async function saveNeeds($: EngineInterface, n: Needs): Promise<void> {
  await update($, needs, () => n)
  await $.store.set(KEY.needs, n)
}

// The store is the source of truth, so two open sessions don't double the decay.
async function currentNeeds($: EngineInterface): Promise<Needs> {
  const stored = await $.store.get(KEY.needs)
  return isNeeds(stored) ? stored : ((await read($, needs)) ?? freshNeeds(await $.clock.now()))
}

async function tickNeeds($: EngineInterface): Promise<void> {
  const now = await $.clock.now()
  const hour = hourOf(now)
  let n = tick(await currentNeeds($), now, { isWorking: isTurnRunning, isLate: hour >= 23 || hour < 5 })
  const b = await read($, breaks)
  if (!isTurnRunning && b.lastActive > 0 && now - b.lastActive >= IDLE_MS && (await read($, restedAt)) < b.lastActive) {
    n = rest(n, now - b.lastActive)
    await update($, restedAt, () => now)
  }
  await saveNeeds($, n)
  if (isHungry(n)) await say($, 'hungry')
  else if (isSleepy(n)) await say($, 'sleepy')
}

async function doCare($: EngineInterface, what: Care): Promise<string> {
  const now = await $.clock.now()
  const n = await currentNeeds($)
  const next = care(n, what, now)
  if (!next) {
    await say($, what === 'feed' ? 'full' : what === 'play' ? 'tired' : 'pettedAgain', true)
    return `${what === 'feed' ? 'Still full' : what === 'play' ? 'Catching its breath' : 'Already beaming'}: try again in ${fmtDuration(cooldownLeft(n, what, now))}.`
  }
  await saveNeeds($, next)
  await react($, what === 'feed' ? 'eat' : what === 'play' ? 'play' : 'love', CARE_MS)
  await say($, what === 'feed' ? 'fed' : what === 'play' ? 'played' : 'petted', true)
  return `${await read($, petName)} ${what === 'feed' ? 'ate a shrimp' : what === 'play' ? 'chased the ball' : 'enjoyed that'}.`
}

async function checkBreak($: EngineInterface): Promise<void> {
  if (await read($, areBreaksOff)) return
  const now = await $.clock.now()
  if (isTurnRunning) await update($, breaks, b => ({ ...b, lastActive: now }))
  const b = await read($, breaks)
  if (b.streakStart && !isTurnRunning && now - b.lastActive >= IDLE_MS) {
    await update($, breaks, prev => ({ ...prev, streakStart: 0, toastedFor: 0 }))
    return
  }
  if (!isBreakDue(b, now, cfg.breakMs)) return
  const dueAt = Math.max(b.streakStart + cfg.breakMs, b.snoozedUntil)
  if (b.toastedFor >= dueAt) return
  await update($, breaks, prev => ({ ...prev, toastedFor: now }))
  $.ui.toast(`${fmtDuration(now - b.streakStart)} in. Stretch break? (/crab snooze for 30 min)`)
}

async function snooze($: EngineInterface): Promise<void> {
  const now = await $.clock.now()
  await update($, breaks, b => ({ ...b, snoozedUntil: now + SNOOZE_MS }))
  await maybeShift($)
}

// The context window's fill; the plain call is free. Warns once per session near the top.
async function refreshContext($: EngineInterface): Promise<void> {
  let percent: number | null = null
  try {
    percent = (await $.session.usage()).context.percent ?? null
  } catch {
    return
  }
  await update($, contextPercent, () => percent)
  if (percent === null) return
  if (percent < 50) {
    await update($, contextWarned, () => false)
  } else if (percent >= CONTEXT_WARN && !(await read($, contextWarned))) {
    await update($, contextWarned, () => true)
    $.ui.toast(`Context is ${Math.round(percent)}% full. A fresh session soon would help.`)
  }
}

async function readStore($: EngineInterface, key: string, fallback: boolean): Promise<boolean> {
  const v = await $.store.get(key)
  return typeof v === 'boolean' ? v : fallback
}

async function setFlag($: EngineInterface, which: 'breaks' | 'sound', isOn: boolean): Promise<void> {
  if (which === 'breaks') {
    await update($, areBreaksOff, () => !isOn)
    await $.store.set(KEY.breaksOff, !isOn)
  } else {
    await update($, isSoundOff, () => !isOn)
    await $.store.set(KEY.soundOff, !isOn)
  }
}

async function setBubbles($: EngineInterface, mode: string): Promise<void> {
  await update($, bubbleMode, () => mode)
  await $.store.set(KEY.bubbles, mode)
}

/** Your own close of the tank, by its mark or a key, not this plugin's or an unload. */
export const isClosedByYou = (e: PaneCloseInput): boolean => e.id === TANK && e.origin.kind === 'person'

async function setTank($: EngineInterface, isOn: boolean): Promise<void> {
  await update($, isTank, () => isOn)
  await $.store.set(KEY.tank, isOn)
}

async function openTank($: EngineInterface) {
  return $.ui.open({ id: TANK, title: `${await read($, petName)}'s beach` })
}

// The strip stands aside only once the tank is really drawn somewhere.
async function isTankUp($: EngineInterface): Promise<boolean> {
  return (await read($, isTank)) && (await $.ui.panes()).some(p => p.id === TANK && p.isPlaced)
}

// A session that starts in tank mode seats the tank first, then lets the strip go.
async function seatTank($: EngineInterface): Promise<void> {
  await openTank($)
  await update($, isTank, () => true)
}

type View = {
  now: number
  name: string
  costume: Costume
  mood: Mood
  seg: Segment
  prop: Prop | null
  sky: Sky
  hour: number
  look: CrabLook
  n: Needs
  summary: string
  alt: string
  isDue: boolean
}

// A new image makes the surface swap it and every animation pick up again, so a redraw
// that changes nothing you can see keeps the one it has. Not for long: if the surface
// drew it afresh, its clock would be running late.
const SCENE_KEEP_MS = 20_000
const scenes = new Map<'band' | 'tank', { key: string; at: number; source: string }>()

const sceneOf = (site: 'band' | 'tank', v: View, b: Bubble, work: readonly string[], width: number, fit: { height?: number; fill?: boolean } = {}): string => {
  const words = b && b.until > v.now ? b.text : null
  // A held pose ending counts: with Reduce Motion on, only a new image takes it away.
  const isHolding = !!v.seg.hold && v.now < v.seg.startAt + v.seg.hold.ms
  const key = JSON.stringify([v.seg.id, v.seg.startAt, isHolding, width, fit, v.costume, v.look, words, v.prop, work, v.sky.weather, v.sky.isWindy])
  const kept = scenes.get(site)
  if (kept?.key === key && v.now >= kept.at && v.now - kept.at < SCENE_KEEP_MS) return kept.source
  const source = sceneSvg({ width, ...fit, costume: v.costume, look: v.look, timeOfDay: timeOfDay(hourOf(v.now)), bubble: words, now: v.now, seg: v.seg, prop: v.prop, sky: v.sky, hour: v.hour, work })
  scenes.set(site, { key, at: v.now, source })
  return source
}

async function beachFor($: EngineInterface, v: View, size: { columns: number; rows: number }): Promise<string> {
  const b = await read($, bubble)
  return beachCells({ ...size, now: v.now, seg: v.seg, costume: v.costume, timeOfDay: timeOfDay(hourOf(v.now)), sky: v.sky, bubble: b && b.until > v.now ? b.text : null })
}

// The repaint timer runs only while a terminal beach is drawn somewhere.
function startPainting($: EngineInterface): void {
  painter ??= $.clock.every(250, () => {
    void repaint($)
  })
}

// No CSS in a terminal: its beach is repainted four times a second, once a second while it naps.
async function repaint($: EngineInterface): Promise<void> {
  if (!rasters.size || isPainting) return
  isPainting = true
  frame++
  try {
    const v = await view($, isTurnRunning)
    if (v.mood === 'nap' && frame % 4) return
    for (const [requestId, size] of rasters) {
      // Gone, resized or not this surface's: the next draw seats it again.
      const done = await $.ui.blit({ requestId, key: RASTER, cells: await beachFor($, v, size), ...size }).catch(() => ({ deny: 'failed' }))
      if (done.deny) rasters.delete(requestId)
    }
    if (!rasters.size) {
      painter?.cancel()
      painter = null
    }
  } finally {
    isPainting = false
  }
}

// What the crab is doing right now, shared by the band and the tank.
async function view($: EngineInterface, isWorking: boolean): Promise<View> {
  const now = await $.clock.now()
  const r = await read($, reaction)
  const n = (await read($, needs)) ?? freshNeeds(now)
  const b = await read($, breaks)
  const tod = timeOfDay(hourOf(now))
  const isDue = !(await read($, areBreaksOff)) && isBreakDue(b, now, cfg.breakMs)
  const isAwake = b.lastActive > 0 && now - b.lastActive < AWAKE_MS && tod !== 'night' && !isSleepy(n)
  const mood: Mood = r && r.until > now ? r.mood : isDue ? 'stretch' : isWorking ? 'work' : isAwake ? 'wander' : 'nap'
  // Before the session starts its life (a preview, a test), it dozes at home.
  const seg: Segment = (await read($, life)) ?? {
    id: 0, seed: 1, startAt: now, startP: 0, startFace: 1, mode: 'sleep', width: lastWidth, castle: 0, shells: 0,
    food: n.food, fun: n.fun, energy: n.energy, timeOfDay: tod,
  }
  const a = await read($, antic)
  const prop = a && a.until > now && isTurnRunning ? a.prop : null
  const doing = (mood === 'wander' || mood === 'work') ? ACT_WORD[whereAt(planOf(seg), now - seg.startAt).act] : undefined
  const choice = await read($, picked)
  const date = new Date(now)
  const w = await read($, weather)
  const costume: Costume = isCostume(choice) ? choice : wornAt(now, w?.kind)
  const sky = skyFor(now, w?.kind ?? 'clear', w?.isWindy ?? false)
  const hour = date.getHours() + date.getMinutes() / 60
  const pct = await read($, contextPercent)
  const ctxTired = tirednessOf(pct)
  const tiredness: Tiredness = ctxTired === 'fresh' && isSleepy(n) ? 'tired' : ctxTired
  const look: CrabLook = { tiredness, isGrumpy: petMood(n) === 'grumpy', isHungry: isHungry(n), hasNightcap: tod === 'night' && mood === 'nap' }
  const s = await read($, stats)
  const name = await read($, petName)
  const summary = `${fmtDuration(now - (s.startedAt || now))} · ${s.turns} turns · ${s.toolCalls} tool calls${pct === null ? '' : ` · context ${Math.round(pct)}%`}`
  const extra = [tiredness === 'fresh' ? '' : tiredness, look.isGrumpy ? 'grumpy' : '', look.isHungry ? 'hungry' : ''].filter(Boolean)
  const alt = `${name} the crab, ${costume}, ${MOOD_WORD[mood]}${doing ? `, ${doing}` : ''}${extra.length ? `, ${extra.join(', ')}` : ''}`
  return { now, name, costume, mood, seg, prop, sky, hour, look, n, summary, alt, isDue }
}

export const register: Register = (on, options) => {
  cfg.longMs = numberOption(options, 'longTaskSeconds', 120) * 1000
  cfg.breakMs = numberOption(options, 'breakMinutes', 90) * MIN
  cfg.place = String(options.weatherPlace ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80)

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({
      name: 'crab',
      description: 'Crab buddy: feed, play, pet, name, stats, theme, tank or strip, breaks, sound, bubbles, costume',
      argumentHint: '[feed | play | pet | name <name> | stats | theme | size | tank | strip | snooze | breaks on|off | sound on|off | bubbles often|rare|off | off | on | restart | today | <costume>]',
    })
    const now = await $.clock.now()
    const hidden = await readStore($, KEY.hidden, false)
    const breaksOff = await readStore($, KEY.breaksOff, cfg.breakMs === 0)
    const soundOff = await readStore($, KEY.soundOff, options.sound === 'off')
    await update($, isHidden, () => hidden)
    await update($, areBreaksOff, () => breaksOff)
    await update($, isSoundOff, () => soundOff)
    if (await readStore($, KEY.tank, false)) void seatTank($)
    const storedMode = await $.store.get(KEY.bubbles)
    const mode = storedMode === 'often' || storedMode === 'rare' || storedMode === 'off' ? storedMode : options.bubbles === 'often' || options.bubbles === 'off' ? String(options.bubbles) : 'rare'
    await update($, bubbleMode, () => mode)
    const storedName = await $.store.get(KEY.name)
    if (typeof storedName === 'string' && cleanName(storedName)) await update($, petName, () => cleanName(storedName))
    const met = await $.store.get(KEY.firstMet)
    const metAt = typeof met === 'number' && met > 0 ? met : now
    if (metAt === now) await $.store.set(KEY.firstMet, now)
    // Time away does not starve it; a long enough gap is rest.
    const stored = await $.store.get(KEY.needs)
    await saveNeeds($, isNeeds(stored) ? { ...rest(stored, now - stored.updatedAt), updatedAt: now } : freshNeeds(now))
    let startedAt = now
    try {
      startedAt = (await $.session.usage()).startedAt || startedAt
    } catch {
      // No usage: count from now.
    }
    await update($, stats, s => (s.startedAt ? s : { ...s, startedAt }))
    await refreshContext($)
    if (timeOfDay(hourOf(now)) === 'morning') await say($, 'morning')
    void refreshWeather($)
    await startSegment($)
    $.clock.every(MIN, () => {
      void minuteTick($)
    })

    return started
  })

  on('command.run', { command: 'crab' }, async ($, e) => {
    const args = (e.args ?? '').trim()
    const [rawWord = '', ...rest] = args.split(/\s+/)
    const word = rawWord.toLowerCase()
    const value = (rest[0] ?? '').toLowerCase()
    if (word === 'feed' || word === 'play' || word === 'pet') return { text: await doCare($, word) }
    if (word === 'name') {
      const name = cleanName(args.slice(rawWord.length))
      if (!name) return { text: `Its name is ${await read($, petName)}. Use /crab name <name> to change it.` }
      await update($, petName, () => name)
      await $.store.set(KEY.name, name)
      await say($, 'named', true)
      return { text: `Your crab is now called ${name}.` }
    }
    if (word === 'off' || word === 'on') {
      const hide = word === 'off'
      await update($, isHidden, () => hide)
      await $.store.set(KEY.hidden, hide)
      return { text: hide ? 'Crab buddy is hiding. /crab on brings it back.' : 'Crab buddy is back.' }
    }
    // Only this session's flag, so closing it mid-restart doesn't leave the crab hidden.
    if (word === 'restart') {
      if (await read($, isHidden)) return { text: "It's already away. /crab on brings it back." }
      await update($, isHidden, () => true)
      $.clock.after(RESTART_MS, async () => {
        if (!(await readStore($, KEY.hidden, false))) await update($, isHidden, () => false)
      })
      return { text: `${await read($, petName)} will be back in ${RESTART_MS / 1000} seconds, freshly drawn.` }
    }
    if (word === 'tank') {
      const opened = await openTank($)
      await setTank($, true)
      if (!opened.isPlaced) return { text: `The tank is open but this surface isn't showing it (${opened.reason}), so the crab stays above the prompt for now. /crab strip cancels.` }
      const where = tankSeat ? `${tankSeat.placement === 'dock' ? 'docked beside the chat' : 'above the prompt'}, ${tankSeat.columns} columns wide` : 'just opened'
      return { text: `The crab is in its tank (${where}). /crab strip brings it back above the prompt.` }
    }
    if (word === 'strip') {
      await setTank($, false)
      await $.ui.close({ id: TANK })
      return { text: 'The crab is back above the prompt. /crab tank moves it into its tank.' }
    }
    if (word === 'today') {
      await update($, picked, () => null)
      await startSegment($)
      return { text: `Back to today's costume: ${await todays($)}.` }
    }
    if (word === 'stats') {
      const v = await view($, false)
      const tr = await traces($)
      return { text: `${v.summary} · food ${Math.round(v.n.food)} · fun ${Math.round(v.n.fun)} · energy ${Math.round(v.n.energy)} · ${tr.shells} shells${tr.golden ? ` (+${tr.golden} golden)` : ''} · ${themeAt(v.now)}` }
    }
    if (word === 'ride') {
      const mode = await desiredMode($)
      const name = await read($, petName)
      if (mode === 'sleep' || mode === 'stretch') return { text: `${name} is ${mode === 'sleep' ? 'asleep' : 'stretching'}. It'll ride later.` }
      await startSegment($, { first: 'ride' })
      const seg = await read($, life)
      return { text: seg && rideFits(seg) ? `${name} is off on its gadget.` : `There isn't room for the gadget on this strip.` }
    }
    if (word === 'theme') {
      const now = await $.clock.now()
      const choice = await read($, picked)
      const theme = themeAt(now)
      if (isCostume(choice) && choice !== costumeAt(now)) return { text: `Today is ${theme}; this session wears the ${choice} you picked. /crab today switches back.` }
      return { text: `Today is ${theme}.` }
    }
    if (word === 'snooze') {
      await snooze($)
      return { text: 'Break reminder snoozed for 30 minutes.' }
    }
    if (word === 'size') {
      if (!lastBand) return { text: "The strip hasn't been drawn yet." }
      return { text: `Strip on ${lastBand.surface}: ${lastBand.columns} columns (viewport ${lastBand.viewport ?? 'unknown'}), beach drawn ${lastBand.width} px wide.` }
    }
    if (word === 'bubbles') {
      if (value !== 'often' && value !== 'rare' && value !== 'off') return { text: 'Use /crab bubbles often, rare or off.' }
      await setBubbles($, value)
      return { text: `Speech bubbles: ${value}.` }
    }
    if (word === 'breaks' || word === 'sound') {
      if (value !== 'on' && value !== 'off') return { text: `Use /crab ${word} on or /crab ${word} off.` }
      await setFlag($, word, value === 'on')
      if (word === 'breaks') return { text: value === 'off' ? 'Break reminders are off.' : `Break reminders are on (every ${Math.round(cfg.breakMs / MIN) || 90} minutes).` }
      return { text: value === 'off' ? 'The done chirp is off.' : 'The done chirp is on.' }
    }
    if (word && !isCostume(word)) {
      return { text: `Unknown option "${word}". Try: feed, play, pet, ride, name, stats, theme, size, tank, strip, snooze, breaks, sound, bubbles, off, on, restart, today, or a costume (${COSTUMES.join(', ')}).` }
    }
    const { shells } = await traces($)
    if (word === 'king' && shells < KING_SHELLS) return { text: `The crown takes ${KING_SHELLS} shells. ${await read($, petName)} has ${shells}.` }
    const current = (await read($, picked)) ?? (await todays($))
    const others = [...COSTUMES, ...(shells >= KING_SHELLS ? (['king'] as const) : [])].filter(c => c !== current)
    const choice: Costume = isCostume(word) ? word : (others[Math.floor(Math.random() * others.length)] ?? 'plain')
    await update($, picked, () => choice)
    await update($, isHidden, () => false)
    await $.store.set(KEY.hidden, false)
    await startSegment($)
    return { text: `Crab buddy is now the ${choice} for this session.` }
  })

  // A new turn ends any leftover reaction and keeps the work streak going.
  on('turn.start', async ($, e, next) => {
    if (!e.agentId) {
      isTurnRunning = true
      const now = await $.clock.now()
      await update($, reaction, () => null)
      await update($, breaks, b =>
        !b.streakStart || now - b.lastActive >= IDLE_MS ? { ...b, streakStart: now, lastActive: now, toastedFor: 0 } : { ...b, lastActive: now },
      )
      const hour = hourOf(now)
      if (hour >= 23 || hour < 5) await say($, 'late')
      await checkBreak($)
      await startSegment($)
    }
    return next(e)
  })

  // The main conversation's turns only: subagents finishing do not set it off.
  on('turn.complete', async ($, e, next) => {
    if (!e.agentId) {
      isTurnRunning = false
      const now = await $.clock.now()
      await update($, stats, s => ({ ...s, turns: s.turns + 1 }))
      await update($, breaks, b => ({ ...b, lastActive: now }))
      await saveNeeds($, gain(await currentNeeds($), { food: 3 }))
      const isOk = e.reason === 'answer' && !e.isAborted
      // Context first, so the new segment's shoreline is up to date.
      await refreshContext($)
      const tidy = (await read($, turnWork)).length ? 'tidy' : undefined
      if (isOk && cfg.longMs > 0 && e.durationMs >= cfg.longMs) {
        await react($, 'wave', WAVE_MS, tidy)
        await say($, 'long', false, fmtDuration(e.durationMs))
        $.ui.toast(`Done after ${fmtDuration(e.durationMs)}.`)
        if (!(await read($, isSoundOff))) void $.audio.play({ asset: CHIRP }, { gain: 0.5 }).catch(() => undefined)
      } else {
        await react($, isOk ? 'cheer' : 'daze', REACT_MS, tidy)
      }
      await checkBreak($)
      if (petMood(await currentNeeds($)) === 'grumpy') await say($, 'grumpy')
    }
    return next(e)
  })

  // You sent a message: it stops, a "!" pops up, and it turns toward you. The day's first also gets today's theme.
  on('prompt.submit', async ($, e, next) => {
    if (!e.isMeta && !e.command) {
      await startSegment($, { hold: { pose: 'notice', ms: NOTICE_MS } })
      await greet($)
    }
    return next(e)
  })

  // Counts every call, mirrors the main conversation's tools with a prop, and reacts
  // to commits, tests and builds once the shell answers. The result goes back untouched.
  on('tool.call', async ($, e, next) => {
    await update($, stats, s => ({ ...s, toolCalls: s.toolCalls + 1 }))
    const prop = PROPS[e.tool]
    if (!e.agentId) {
      if (prop) await showProp($, prop)
      await update($, turnWork, w => (w.length >= 15 ? w : [...w, prop ?? 'other']))
    }
    if (e.tool !== 'Bash') return next(e)
    const result = await next(e)
    if (result.deny === undefined) {
      const mood = reactionTo(String((e as { command?: unknown }).command ?? ''), result.isError === true)
      if (mood) {
        await react($, mood)
        if (mood === 'party') {
          await saveNeeds($, gain(await currentNeeds($), { fun: 10 }))
          await say($, 'commit')
        } else if (mood === 'cool') {
          await saveNeeds($, gain(await currentNeeds($), { fun: 5 }))
          await say($, 'testsPass')
        } else {
          await say($, 'testsFail')
        }
      }
    }
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, isHidden))) return next(e)
    const { value: flow } = await $.state.get(savvyFlow)
    if (flow) return next(e)
    if (await isTankUp($)) return next(e)

    // Other mods' bands stay, drawn above the crab. The engine's own placeholder
    // is never nested: the desktop drops a band that nests it.
    const drawn = await Promise.resolve(next(e)).catch(() => null)
    const above = drawn && typeof drawn === 'object' && (drawn as { type?: string }).type !== 'engine' ? drawn : null

    const v = await view($, e.props.isWorking)
    const b = await read($, bubble)

    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const care = (key: Care, label: string) => <Button key={`crab-${key}`} label={label} plain onPress={() => void doCare($, key)} />
    const buttons = [
      v.isDue ? <Button key="crab-snooze" label="Snooze" plain onPress={() => snooze($)} /> : null,
      care('feed', '🍤'),
      care('play', '🎾'),
      care('pet', '✋'),
    ]

    if (e.surface !== 'terminal' && 'Svg' in ui) {
      const { Svg } = ui
      const width = stripWidth(e.props.bodyColumns, v.isDue, e.surface)
      lastWidth = width
      lastBand = { surface: e.surface, columns: e.props.bodyColumns, viewport: e.viewport?.columns, width }
      // A plain image, not the hover-capable frame: that frame paints a solid box behind the crab.
      const scene = sceneOf('band', v, b, await read($, turnWork), width, { fill: true })
      // No wrapping: a row wraps by default, and the image starts out wider than any row.
      return (
        <Box flexDirection="column">
          {above}
          <Box flexDirection="row" flexWrap="nowrap" alignItems="flex-end" gap={1}>
            <Box flexGrow={1} flexShrink={1} minWidth={0}>
              <Svg source={scene} alt={v.alt} height={SCENE_H} />
            </Box>
            <Box flexDirection="row" flexShrink={0} gap={1}>
              {buttons}
            </Box>
          </Box>
        </Box>
      )
    }

    if ('Raster' in ui) {
      const { Raster } = ui
      const size = { columns: terminalColumns(e.props.bodyColumns, v.isDue), rows: 3 }
      lastWidth = stripWidth(e.props.bodyColumns, v.isDue)
      lastBand = { surface: e.surface, columns: e.props.bodyColumns, viewport: e.viewport?.columns, width: lastWidth }
      rasters.set(e.requestId, size)
      startPainting($)
      return (
        <Box flexDirection="column">
          {above}
          <Box flexDirection="row" alignItems="flex-end" gap={1}>
            <Raster key={RASTER} {...size} cells={await beachFor($, v, size)} />
            <Box flexDirection="row" gap={1}>
              {buttons}
            </Box>
          </Box>
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        {above}
        <Box flexDirection="row" justifyContent="flex-end" gap={1}>
          {b && b.until > v.now ? <Text italic dimColor>“{b.text}”</Text> : null}
          <Text dimColor>{TERMINAL_GLYPH[v.mood]}</Text>
          <Text color={v.look.tiredness === 'sweaty' ? 'red' : CLAY}>▣</Text>
          {buttons}
        </Box>
      </Box>
    )
  })

  // Closing the tank with its mark brings the crab back above the prompt.
  on('ui.close', async ($, e, next) => {
    if (isClosedByYou(e)) await setTank($, false)
    return next(e)
  })

  // The tank: the same beach, bigger and with more sky, and the care buttons under it.
  on('ui.render', { component: 'Pane', requestId: TANK }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    if (await read($, isHidden)) return <Text dimColor>Crab buddy is hiding. /crab on brings it back.</Text>
    tankSeat = { placement: e.props.placement, columns: e.props.bodyColumns }

    const v = await view($, isTurnRunning)
    const b = await read($, bubble)
    const care = (key: Care, label: string) => <Button key={`crab-${key}`} label={label} plain onPress={() => void doCare($, key)} />
    const buttons = [
      v.isDue ? <Button key="crab-snooze" label="Snooze" plain onPress={() => snooze($)} /> : null,
      care('feed', '🍤'),
      care('play', '🎾'),
      care('pet', '✋'),
    ]

    if (e.surface !== 'terminal' && 'Svg' in ui) {
      const { Svg } = ui
      const t = tankSize(e.props.bodyColumns, e.props.placement)
      lastWidth = t.sceneWidth
      return (
        <Box flexDirection="column" gap={1}>
          <Svg source={sceneOf('tank', v, b, await read($, turnWork), t.sceneWidth, { height: t.sceneHeight })} alt={v.alt} width={t.width} height={t.height} />
          <Box flexDirection="row" justifyContent="center" gap={1}>
            {buttons}
          </Box>
        </Box>
      )
    }

    if ('Raster' in ui) {
      const { Raster } = ui
      const size = { columns: Math.max(20, e.props.bodyColumns), rows: terminalTankRows(e.props.scroll.bodyRows, e.props.placement) }
      lastWidth = size.columns * 8
      rasters.set(TANK, size)
      startPainting($)
      return (
        <Box flexDirection="column">
          <Raster key={RASTER} {...size} cells={await beachFor($, v, size)} />
          <Box flexDirection="row" gap={1}>
            {buttons}
          </Box>
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        {b && b.until > v.now ? <Text italic dimColor>“{b.text}”</Text> : null}
        <Box flexDirection="row" gap={1}>
          <Text dimColor>{TERMINAL_GLYPH[v.mood]}</Text>
          <Text color={v.look.tiredness === 'sweaty' ? 'red' : CLAY}>▣</Text>
          {buttons}
        </Box>
      </Box>
    )
  })

}
