import { atom, read, update } from 'claude-code'
import type { EngineInterface, PaneCloseInput, PluginOptions, Register, Timer, ToolCallInput, ToolCallResult } from 'claude-code'

import type { Activity, Antic, Beach, BreakState, Bubble, CatchKind, LifeMode, Logbook, Mood, Needs, Pose, Prop, ReactionMood, Segment, SignKind, TideLines, Tiredness, Weather, WeatherNow } from '../types'
import { reconcile, sameRods } from './fishing'
import { FRESH_MS, finishedElsewhere, holderOf, parseBeach, pickSlot, wantsNote, whereCrabIs } from './roam'
import type { BeachRecord } from './roam'
import { MARK_TIDE, MAX_RODS, NO_CONTEXT_SHORE, TEMPERAMENTS, layoutOf, planOf, rideFits, shoreFrac, tideOf, whereAt } from './life'
import type { LifeEvent } from './life'
import { line, needsLine, signLine, themeLine, themeName } from './lines'
import type { Moment } from './lines'
import { care, cooldownLeft, freshNeeds, gain, isHungry, isSleepy, petMood, rest, tick } from './pet'
import type { Care } from './pet'
import { EMPTY_LOG, commitTitle, compactKeep, logCheck, logCommit, logFile, logNote, logText } from './logbook'
import { SCENE_H, sceneSvg, timeOfDay } from './scene'
import { SIGN_MOOD, breakKind, enqueue, heldSign, nextInQueue } from './signs'
import type { HeldKind } from './signs'
import { WINDY_KMH, holiday, skyFor, weatherOf } from './sky'
import type { Sky } from './sky'
import { CLAY, COSTUMES, costumeOfDay, isCostume } from './sprites'
import { beachCells } from './terminal'
import { nextUsage, usageMark, usageSign, usageStat } from './usage'
import type { Costume, CrabLook } from './sprites'

const reaction = atom({ plugin: 'crab-buddy', key: 'reaction' } as const, null)
const picked = atom({ plugin: 'crab-buddy', key: 'costume' } as const, null)
const isHidden = atom({ plugin: 'crab-buddy', key: 'isHidden' } as const, false)
const stats = atom({ plugin: 'crab-buddy', key: 'stats' } as const, { startedAt: 0, turns: 0, toolCalls: 0 })
const tide = atom({ plugin: 'crab-buddy', key: 'tide' } as const, null)
const tideLines = atom({ plugin: 'crab-buddy', key: 'tideLines' } as const, null)
const contextWarned = atom({ plugin: 'crab-buddy', key: 'contextWarned' } as const, false)
const contextHinted = atom({ plugin: 'crab-buddy', key: 'contextHinted' } as const, false)
const logbook = atom({ plugin: 'crab-buddy', key: 'logbook' } as const, EMPTY_LOG)
// Each an end time, not a flag: a reload drops the timer that would have cleared it.
const plantedSign = atom({ plugin: 'crab-buddy', key: 'plantedSign' } as const, null)
const bottleUntil = atom({ plugin: 'crab-buddy', key: 'bottleUntil' } as const, 0)
const signQueue = atom({ plugin: 'crab-buddy', key: 'signQueue' } as const, [])
const rods = atom({ plugin: 'crab-buddy', key: 'rods' } as const, [])
const crabAway = atom({ plugin: 'crab-buddy', key: 'crabAway' } as const, null)
const roamNote = atom({ plugin: 'crab-buddy', key: 'roamNote' } as const, null)
const beachSlot = atom({ plugin: 'crab-buddy', key: 'beachSlot' } as const, '')
const areSignsOff = atom({ plugin: 'crab-buddy', key: 'areSignsOff' } as const, false)
const stretchedSeg = atom({ plugin: 'crab-buddy', key: 'stretchedSeg' } as const, 0)
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
const needsYou = atom({ plugin: 'crab-buddy', key: 'needsYou' } as const, null)
const areNeedsOff = atom({ plugin: 'crab-buddy', key: 'areNeedsOff' } as const, false)
const areTipsOff = atom({ plugin: 'crab-buddy', key: 'areTipsOff' } as const, false)
const usage = atom({ plugin: 'crab-buddy', key: 'usage' } as const, null)
const isHourglassOff = atom({ plugin: 'crab-buddy', key: 'isHourglassOff' } as const, false)
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
const TIDE_SWEATY = 0.85
const TIDE_WARN = 0.9
/** Under this the warnings are ready to show again. */
const TIDE_REARM = 0.4
/** How long a compaction takes to land, and how often to look. */
const EBB_MS = 200
const EBB_TRIES = 5
/** The engine compacts a conversation this big left idle for about 54 minutes. */
const IDLE_MARK = 200_000
/** The engine won't let its minimum go lower than this. */
const IDLE_FLOOR = 100_000
const SIGN_MS = 2 * MIN
const CONTEXT_SIGN_MS = 10 * MIN
const HELD_SIGN_MS = 7000
/** The same news again this soon (a subagent's burst of commits) is not news. */
const SIGN_GAP_MS = 20_000
/** A burst of spawns is one look at the list. */
const LINES_MS = 500
/** How often it checks its lines while any are out. */
const WATCH_MS = 5000
/** A second cast this soon stays a rod in the sand: it's already at the water. */
const CAST_GAP_MS = 30_000
/** How often a roaming session writes its file and reads the others'. */
const ROAM_MS = 3000
/** /clear empties the session's state just after it ends: this is when to fill it again. */
const CLEAR_MS = 1000
const BOTTLE_MS = 5 * MIN
const CHIRP = 'sounds/chirp.wav'
const BUBBLE_GAP: Record<string, number> = { often: 5 * MIN, rare: 15 * MIN }
const NOTICE_MS = 1600
const PROP_MS = 3500
/** A different tool's prop waits this long, so a burst of calls doesn't flicker. */
const PROP_SWITCH_MS = 3000
/** VS Code closes a picture's frame after 30 s with nothing moving, and the next one starts healthy. */
const RESTART_MS = 35_000
// Long enough for any dialog left open: a reload or a missed answer takes the flag down after this.
const NEEDS_MAX_MS = 10 * MIN

// The tool Claude is using, mirrored by a prop in the crab's claw.
const PROPS: Record<string, Prop> = {
  Read: 'scroll', Grep: 'magnifier', Glob: 'magnifier', Edit: 'hammer', Write: 'hammer', NotebookEdit: 'hammer',
  Bash: 'keyboard', WebSearch: 'binoculars', WebFetch: 'binoculars', Agent: 'rod', Task: 'rod',
}
const EDITS = new Set(['Edit', 'Write', 'NotebookEdit'])
// Tools whose whole point is a person's answer.
const ASKS_YOU: ReadonlySet<string> = new Set(['AskUserQuestion', 'ExitPlanMode'])

// $.store keys: choices made with /crab and the pet itself outlive the session.
const KEY = {
  hidden: 'isHidden', breaksOff: 'areBreaksOff', soundOff: 'isSoundOff', needs: 'needs', name: 'name',
  firstMet: 'firstMet', bubbles: 'bubbles', signsOff: 'areSignsOff', castle: 'castle', shells: 'shells', golden: 'goldenShells', weather: 'weather', geo: 'weatherGeo',
  greeted: 'greetedDay', tank: 'isTank', fish: 'fishCaught', roam: 'isRoaming', logOff: 'isLogOff', earned: 'decorEarned',
  needsOff: 'areNeedsOff', tipsOff: 'areTipsOff', hourglassOff: 'isHourglassOff',
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
  cast: 'casting a line', reel: 'reeling a line in',
}

// git's own options may sit before the subcommand: `git -c user.name=x -C repo --no-pager commit`.
const COMMIT = /\bgit(?:\s+-[cC]\s+\S+|\s+--?[\w-]+(?:=\S+)?)*\s+commit\b/
const PUSH = /\bgit(?:\s+-[cC]\s+\S+|\s+--?[\w-]+(?:=\S+)?)*\s+push\b/
const MERGED = /\b(?:gh\s+pr|glab\s+mr)\s+merge\b/
const PR_OPEN = /\bgh\s+pr\s+create\b/
const MR_OPEN = /\bglab\s+mr\s+create\b/
// The same moves through a connected tool, whichever host it talks to.
const PR_TOOL = /^mcp__.*create_pull_?request/i
const MR_TOOL = /^mcp__.*create_merge_?request/i
const MERGE_TOOL = /^mcp__.*merge_(?:pull|merge)_?request/i
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

/** The news in a finished shell command: the furthest step wins, so `commit && push` is one sign. */
export const newsOf = (command: string, isError: boolean): HeldKind | null => {
  if (isError) return null
  if (MERGED.test(command)) return 'merged'
  if (PR_OPEN.test(command)) return 'pr'
  if (MR_OPEN.test(command)) return 'mr'
  if (PUSH.test(command)) return 'pushed'
  return COMMIT.test(command) ? 'commit' : null
}

export const toolNewsOf = (tool: string): HeldKind | null =>
  MERGE_TOOL.test(tool) ? 'merged' : PR_TOOL.test(tool) ? 'pr' : MR_TOOL.test(tool) ? 'mr' : null

/** What a finished shell command adds to the log. A failed commit is no commit. */
export const logShell = (log: Logbook, command: string, isError: boolean): Logbook => {
  let next = log
  if (TEST.test(command)) next = logCheck(next, 'test', !isError)
  if (BUILD.test(command)) next = logCheck(next, 'build', !isError)
  return COMMIT.test(command) && !isError ? logCommit(next, commitTitle(command)) : next
}

export const tirednessOf = (level: number | null): Tiredness =>
  level === null ? 'fresh' : level >= TIDE_SWEATY ? 'sweaty' : level >= MARK_TIDE ? 'tired' : 'fresh'

export const fmtTokens = (tokens: number): string => `${Math.round(tokens / 1000)}k`

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
  // Trimmed again after the cut, so a name cut at a space doesn't keep it.
  raw.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 16).trim()

const isNeeds = (v: unknown): v is Needs =>
  !!v && typeof v === 'object' && ['food', 'fun', 'energy', 'updatedAt'].every(k => typeof (v as Record<string, unknown>)[k] === 'number')

const numberOption = (options: PluginOptions, name: string, fallback: number): number => {
  const v = Number(options[name])
  return Number.isFinite(v) && v >= 0 ? v : fallback
}

const hourOf = (now: number): number => new Date(now).getHours()
/** Where the sea starts now for this tide, with the small tide of the hour on top. */
const shoreAt = (level: number | null, now: number): number => shoreFrac(level, new Date(now).getHours() + new Date(now).getMinutes() / 60)

/** Shells it takes to earn the crown. */
export const KING_SHELLS = 50

// Set from the options each time the module loads.
const cfg = { longMs: 120_000, breakMs: 90 * MIN, place: '', budgetUsd: 0 }
// Module scope is fine: a reload mid-turn only delays the idle check by a turn.
let isTurnRunning = false
/** This turn's last word was a commit or green tests, with no edit since. */
let isCleanStop = false
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
let ticker: Timer | null = null
// Only while a line is out.
let watcher: Timer | null = null
let isLookDue = false
let lastCast = -CAST_GAP_MS
// Roaming. In the module because /clear empties the atoms and keeps these; the slot is
// copied to an atom because a reload does the opposite.
const beachOf = { slot: '', token: '', repo: '', personAt: 0, doneAt: 0, isNeeds: false }
const others = new Map<string, { mtimeMs: number; beach: BeachRecord }>()
let rover: Timer | null = null
let isRoamBusy = false

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

async function react($: EngineInterface, mood: ReactionMood, ms = REACT_MS, first?: Activity, sign?: string): Promise<void> {
  const now = await $.clock.now()
  // Your own care and bad news go first; anything else lets a sign finish.
  if (!sign && !OVER_A_SIGN.has(mood) && (heldSign(await read($, life), now) || (await read($, needsYou)))) return
  const until = now + ms
  await update($, reaction, () => ({ mood, until }))
  $.clock.after(ms, () => {
    void update($, reaction, r => (r && r.until <= until ? null : r))
  })
  await startSegment($, { hold: { pose: mood, ms, ...(sign ? { sign } : {}) }, ...(first ? { first } : {}) })
}

const OVER_A_SIGN: ReadonlySet<ReactionMood> = new Set(['eat', 'play', 'love', 'nervous'])
// When each kind last went up. A reload forgets it, which at worst repeats one sign.
const lastSign = new Map<SignKind, number>()

/** Puts news on a sign, or in line for one. False when signs are off: the caller does what it did before. */
async function holdUp($: EngineInterface, kind: HeldKind, opts: { time?: string; first?: Activity; isAlways?: boolean } = {}): Promise<boolean> {
  if (await read($, areSignsOff)) return false
  const now = await $.clock.now()
  if (!opts.isAlways && now - (lastSign.get(kind) ?? -SIGN_GAP_MS) < SIGN_GAP_MS) return true
  lastSign.set(kind, now)
  const text = signLine(kind, now / 1000, opts.time)
  if (heldSign(await read($, life), now) || (await read($, needsYou))) await update($, signQueue, q => enqueue(q, { kind, text, at: now }))
  else await raiseSign($, kind, text, opts.first)
  return true
}

async function raiseSign($: EngineInterface, kind: HeldKind, text: string, first?: Activity): Promise<void> {
  await react($, SIGN_MOOD[kind], HELD_SIGN_MS, first, text)
  $.clock.after(HELD_SIGN_MS, () => void nextSign($))
}

async function nextSign($: EngineInterface): Promise<void> {
  // The flag stays up alone: the news waits, and goes up once it comes down.
  if (await read($, needsYou)) return
  const { next, rest } = nextInQueue(await read($, signQueue), await $.clock.now())
  await update($, signQueue, () => rest)
  if (next) await raiseSign($, next.kind as HeldKind, next.text)
}

async function plantSign($: EngineInterface, kind: SignKind, ms: number, time?: string): Promise<void> {
  const now = await $.clock.now()
  const until = now + ms
  await update($, plantedSign, () => ({ text: signLine(kind, now / 1000, time), until }))
  $.clock.after(ms, () => {
    void update($, plantedSign, p => (p && p.until <= until ? null : p))
  })
}

// Tool calls under way, newest last: a permission request names its tool and its agent, not its call.
const waiting = new Map<string, { tool: string; agentId: string | null }>()

/**
 * Claude is waiting for you: it turns to you and holds up a red flag until the answer comes.
 * Silent on purpose: Claude Code raises its own notifications.
 */
async function raiseFlag($: EngineInterface, id: string, what: string): Promise<void> {
  if (await read($, areNeedsOff)) return
  if ((await read($, needsYou))?.id === id) return
  const now = await $.clock.now()
  await update($, needsYou, () => ({ what, id, since: now }))
  await claimCrab($, 'needs')
  await startSegment($, { hold: { pose: 'look', ms: NEEDS_MAX_MS } })
  $.clock.after(NEEDS_MAX_MS, () => void lowerFlag($, id, now))
}

/** The answer came, or you're back: the flag comes down and news that waited goes up. */
async function lowerFlag($: EngineInterface, id?: string, since?: number): Promise<void> {
  const cur = await read($, needsYou)
  if (!cur || (id !== undefined && cur.id !== id) || (since !== undefined && cur.since !== since)) return
  await update($, needsYou, () => null)
  const seg = await read($, life)
  const now = await $.clock.now()
  // Still facing you for the flag: it gets on with its life.
  if (seg?.hold?.pose === 'look' && seg.startAt >= cur.since && now < seg.startAt + seg.hold.ms) await startSegment($)
  await nextSign($)
}

// What it should be doing now: the break reminder, working with Claude, its own life, or asleep.
async function desiredMode($: EngineInterface): Promise<LifeMode> {
  if (await read($, crabAway)) return 'away'
  const now = await $.clock.now()
  const b = await read($, breaks)
  if (!(await read($, areBreaksOff)) && isBreakDue(b, now, cfg.breakMs)) return 'stretch'
  if (isTurnRunning) return 'work'
  const n = (await read($, needs)) ?? freshNeeds(now)
  const isAwake = b.lastActive > 0 && now - b.lastActive < AWAKE_MS && timeOfDay(hourOf(now)) !== 'night' && !isSleepy(n)
  return isAwake ? 'idle' : 'sleep'
}

async function traces($: EngineInterface): Promise<{ castle: number; shells: number; golden: number; layout?: number; earned?: number }> {
  const now = await $.clock.now()
  const c = await $.store.get(KEY.castle)
  const sh = await $.store.get(KEY.shells)
  const gold = await $.store.get(KEY.golden)
  // When you met is this install's own: it stays put, on this machine, and every window reads the same one.
  const met = await $.store.get(KEY.firstMet)
  const earned = await $.store.get(KEY.earned)
  return {
    castle: isCastle(c) && c.day === dayKey(now) ? c.stage : 0, shells: isShells(sh) ? sh.count : 0, golden: isShells(gold) ? gold.count : 0,
    ...(typeof met === 'number' ? { layout: met >>> 0 } : {}),
    ...(typeof earned === 'number' ? { earned } : {}),
  }
}

/**
 * Starts the next stretch of its life from wherever it stands now, so it never
 * jumps. A "!" from noticing you, or a sign it's holding up, carries over into the new segment.
 */
async function startSegment($: EngineInterface, opts: { hold?: { pose: Pose; ms: number; sign?: string }; first?: Activity; haul?: CatchKind; isLeaving?: boolean } = {}): Promise<void> {
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
    if (!hold && cur.hold && (cur.hold.pose === 'notice' || cur.hold.sign) && left > 0) hold = { ...cur.hold, ms: left }
  }
  const n = await currentNeeds($)
  const tr = await traces($)
  const id = (cur?.id ?? 0) + 1
  const seg: Segment = {
    id, seed: (Math.imul(Math.floor(now) % 2147483647, 2654435761) ^ Math.imul(id, 40503)) >>> 0, startAt: now, startP: p, startFace: face,
    mode: await desiredMode($), width: lastWidth, castle: tr.castle, shells: tr.shells, golden: tr.golden,
    food: n.food, fun: n.fun, energy: n.energy, timeOfDay: timeOfDay(hourOf(now)),
    weather: (await read($, weather))?.kind ?? 'clear',
    shore: shoreAt((await read($, tide))?.level ?? null, now),
    ride: await wearing($),
    ...(tr.layout === undefined ? {} : { layout: tr.layout }),
    ...(tr.earned === undefined ? {} : { earned: tr.earned }),
    ...(hold ? { hold } : {}), ...(opts.first ? { first: opts.first } : {}), ...(opts.haul ? { haul: opts.haul } : {}), ...(opts.isLeaving ? { isLeaving: true } : {}), ...(poof ? { poof } : {}),
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
  if (ev.kind === 'rest') {
    await update($, stretchedSeg, () => seg.id)
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
}

// A look at the lines soon, so a burst of spawns is one look.
function lookAtLines($: EngineInterface): void {
  if (isLookDue) return
  isLookDue = true
  $.clock.after(LINES_MS, () => {
    isLookDue = false
    void checkLines($)
  })
}

async function checkLines($: EngineInterface): Promise<void> {
  const before = await read($, rods)
  const agents = await $.agent.list().catch(() => null)
  if (!agents) return
  const { rods: out, hauls } = reconcile(before, agents)
  if (!sameRods(before, out)) await update($, rods, () => out)
  if (out.length && !watcher) {
    watcher = $.clock.every(WATCH_MS, () => {
      void checkLines($)
    })
  } else if (!out.length) {
    watcher?.cancel()
    watcher = null
  }
  const now = await $.clock.now()
  if (hauls.length) await landHauls($, hauls, out.length)
  else if (out.some(r => !before.some(b => b.id === r.id)) && now - lastCast >= CAST_GAP_MS) {
    lastCast = now
    await startSegment($, { first: 'cast' })
  }
}

// It reels in, then says so once the catch has landed. The timer stands apart from the
// plan, so the news still comes if something cuts the walk to the water short.
async function landHauls($: EngineInterface, hauls: readonly CatchKind[], left: number): Promise<void> {
  const fish = hauls.filter(h => h === 'fish').length
  const kept = await $.store.get(KEY.fish)
  await $.store.set(KEY.fish, (typeof kept === 'number' ? kept : 0) + fish)
  if (fish) await saveNeeds($, gain(await currentNeeds($), { fun: 3 }))
  const haul: CatchKind = fish ? 'fish' : 'boot'
  await startSegment($, { first: 'reel', haul })
  const seg = await read($, life)
  const landing = seg ? (planOf(seg).marks.find(m => m.kind === 'catch')?.t1 ?? 0) : 0
  $.clock.after(Math.max(1, landing), async () => {
    const isSigned = await holdUp($, haul, { time: left ? `${left} still out` : 'all in', isAlways: true })
    if (!isSigned) await say($, haul === 'fish' ? 'caught' : 'lost', true)
  })
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

// The shared folder, beside the rest of Claude Code's own.
async function beachDir($: EngineInterface): Promise<string> {
  const base = (await $.env.get('CLAUDE_CONFIG_DIR')) || `${(await $.env.get('HOME')) ?? ''}/.claude`
  return `${base}/crab-buddy/beaches`
}

// A window that shows nothing, or a crab that's hiding or stepped aside, can't have it.
async function canHoldCrab($: EngineInterface): Promise<boolean> {
  if ((await read($, isHidden)) || !(await $.session.surfaces()).length) return false
  const { value: flow } = await $.state.get(savvyFlow)
  return !flow
}

async function settleOnBeach($: EngineInterface, dir: string, now: number): Promise<void> {
  beachOf.slot ||= await read($, beachSlot)
  if (beachOf.slot) {
    const mine = parseBeach(await $.fs.read(`${dir}/${beachOf.slot}`).catch(() => ''), beachOf.slot)
    // Another session started at the same moment and took this file.
    if (mine && mine.token !== beachOf.token && beachOf.token && now - mine.at < ROAM_MS * 3) beachOf.slot = ''
  }
  if (!beachOf.slot) {
    beachOf.slot = pickSlot(await $.fs.list(dir).catch(() => []), now)
    beachOf.token = `${now.toString(36)}${Math.random().toString(36).slice(2, 8)}`
  }
  if ((await read($, beachSlot)) !== beachOf.slot) {
    const slot = beachOf.slot
    await update($, beachSlot, () => slot)
  }
  if (!beachOf.repo) beachOf.repo = ((await $.session.repo().catch(() => null))?.root ?? (await $.session.cwd())).split('/').filter(Boolean).pop() ?? ''
}

async function writeBeach($: EngineInterface, dir: string, at: number, canHold: boolean): Promise<BeachRecord> {
  const beach: BeachRecord = { slot: beachOf.slot, token: beachOf.token, at, repo: beachOf.repo, personAt: beachOf.personAt, doneAt: beachOf.doneAt, ...(beachOf.isNeeds ? { isNeeds: true } : {}), canHold }
  await $.fs.write(`${dir}/${beachOf.slot}`, JSON.stringify(beach))
  return beach
}

// Only files that changed are read, and a half-written one keeps its last good reading.
async function readOthers($: EngineInterface, dir: string, now: number): Promise<BeachRecord[]> {
  const files = (await $.fs.list(dir)).filter(f => f.name.endsWith('.json') && f.name !== beachOf.slot && now - f.mtimeMs < FRESH_MS)
  for (const file of files) {
    if (others.get(file.name)?.mtimeMs === file.mtimeMs) continue
    const beach = parseBeach(await $.fs.read(`${dir}/${file.name}`).catch(() => ''), file.name)
    if (beach) others.set(file.name, { mtimeMs: file.mtimeMs, beach })
  }
  const names = new Set(files.map(f => f.name))
  for (const name of others.keys()) if (!names.has(name)) others.delete(name)
  return [...others.values()].map(o => o.beach)
}

// Moves the crab only when the holder changes: a write here redraws, and this runs every 3 seconds.
async function followCrab($: EngineInterface, holder: BeachRecord | null, note: string | null): Promise<void> {
  const away = await read($, crabAway)
  const where = holder && holder.slot !== beachOf.slot ? whereCrabIs(holder.repo, beachOf.repo) : null
  if (where !== away) {
    await update($, crabAway, () => where)
    if (where && !away) await startSegment($, { isLeaving: true })
    else if (!where) await startSegment($, { first: 'arrive' })
  }
  if (note !== (await read($, roamNote))) await update($, roamNote, () => note)
}

async function roamTick($: EngineInterface): Promise<void> {
  if (isRoamBusy) return
  isRoamBusy = true
  try {
    const now = await $.clock.now()
    const dir = await beachDir($)
    await settleOnBeach($, dir, now)
    const mine = await writeBeach($, dir, now, await canHoldCrab($))
    const beaches = [mine, ...(await readOthers($, dir, now))]
    const holder = holderOf(beaches, now)
    const finished = holder?.slot === beachOf.slot ? finishedElsewhere(beaches, holder, now) : null
    await followCrab($, holder, finished ? wantsNote(finished) : null)
  } catch {
    // The folder can't be reached: it stays where it is and tries again.
  } finally {
    isRoamBusy = false
  }
}

async function claimCrab($: EngineInterface, why: 'person' | 'done' | 'needs'): Promise<void> {
  if (!rover) return
  const now = await $.clock.now()
  if (why === 'person') beachOf.personAt = now
  else {
    beachOf.doneAt = now
    beachOf.isNeeds = why === 'needs'
  }
  await roamTick($)
}

// Roaming is one choice for all your sessions: each picks it up here within a minute.
async function syncRoam($: EngineInterface): Promise<void> {
  const isOn = (await readStore($, KEY.roam, false)) && (await $.session.surfaces()).length > 0
  if (isOn && !rover) {
    rover = $.clock.every(ROAM_MS, () => {
      void roamTick($)
    })
    void roamTick($)
  } else if (!isOn && rover) {
    rover.cancel()
    rover = null
    await followCrab($, null, null)
    if (beachOf.slot) await writeBeach($, await beachDir($), 0, false).catch(() => undefined)
  }
}

async function minuteTick($: EngineInterface): Promise<void> {
  await refreshWeather($)
  await syncRoam($)
  if ((await read($, rods)).length) await checkLines($)
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
  if (!isAsked && (heldSign(await read($, life), now) || (await read($, needsYou)) || (await breakSign($, now, await read($, life))))) return
  await showBubble($, line(moment, now / 1000, { name: await read($, petName), time }), now, BUBBLE_MS)
  // Only unprompted lines count toward the quiet time: answering you never uses it up.
  if (!isAsked) await update($, lastBubbleAt, () => now)
}

// The break's sign, once it has reached home to stretch.
async function breakSign($: EngineInterface, now: number, seg: Segment | null): Promise<string | null> {
  const b = await read($, breaks)
  if ((await read($, areSignsOff)) || (await read($, areBreaksOff)) || !isBreakDue(b, now, cfg.breakMs)) return null
  if (seg?.mode !== 'stretch' || (await read($, stretchedSeg)) !== seg.id) return null
  return signLine(breakKind(b.streakStart, now, cfg.breakMs), b.streakStart / 1000)
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
  if (await read($, crabAway)) {
    await claimCrab($, 'person')
    return `${await read($, petName)} is on its way.`
  }
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
  const kind = breakKind(b.streakStart, now, cfg.breakMs)
  const dueAt = Math.max(b.streakStart + (kind === 'walk' ? 2 : 1) * cfg.breakMs, b.snoozedUntil)
  if (b.toastedFor >= dueAt) return
  await update($, breaks, prev => ({ ...prev, toastedFor: now }))
  $.ui.toast(`${fmtDuration(now - b.streakStart)} in. ${kind === 'walk' ? 'Time for a walk' : 'Stretch break'}? (/crab snooze for 30 min)`)
}

async function snooze($: EngineInterface): Promise<void> {
  const now = await $.clock.now()
  await update($, breaks, b => ({ ...b, snoozedUntil: now + SNOOZE_MS }))
  await maybeShift($)
}

// Where compactions come for this window. The summary is counted locally and sends nothing.
async function linesFor($: EngineInterface, window: number): Promise<NonNullable<TideLines>> {
  const known = await read($, tideLines)
  if (known?.window === window) return known
  const counted = (await $.session.usage({ breakdown: 'summary' }).catch(() => null))?.context.breakdown
  const isIdleOff = counted?.isAutoCompactEnabled === false || (await $.settings.read({ key: 'idleCompaction' }).catch(() => undefined)) === false
  const minimum = Number(await $.env.get('CLAUDE_CODE_IDLE_COMPACT_MIN_TOKENS').catch(() => undefined))
  const lines = { window, full: counted?.autoCompactThreshold ?? window, idleMark: isIdleOff ? null : minimum > 0 ? Math.max(IDLE_FLOOR, minimum) : IDLE_MARK }
  await update($, tideLines, () => lines)
  return lines
}

/** Once the sea has gone well back, the signs may come again. */
async function rearmTide($: EngineInterface, level: number): Promise<void> {
  if (level >= TIDE_REARM) return
  await update($, contextWarned, () => false)
  await update($, contextHinted, () => false)
  compactTip = { isShown: false, tries: 0 }
}

// The ready /compact offered for this fill of the context: once shown, or after two tries the box was busy.
let compactTip = { isShown: false, tries: 0 }

/**
 * At a good moment to compact, or with the sea near the top, a /compact that says what to keep waits
 * dim in the empty prompt box: Tab takes it, and you still press Enter. Turn end is when the box can show it.
 */
async function suggestCompact($: EngineInterface): Promise<void> {
  if (compactTip.isShown || compactTip.tries >= 2 || (await read($, areTipsOff))) return
  if (!(await read($, contextHinted)) && !(await read($, contextWarned))) return
  compactTip.tries++
  const shown = await $.prompt.suggest({ text: compactKeep(await read($, logbook)) }).catch(() => null)
  if (shown?.isShown) compactTip.isShown = true
}

// The hourglass: the usage limit on a subscription, or the budget on API billing. A sign at 80% and at 95%, once each per window.
async function refreshUsage($: EngineInterface, limits: readonly { kind: string; percentUsed: number; resetsAt?: string }[], usd: number | undefined): Promise<void> {
  const now = await $.clock.now()
  const next = nextUsage(await read($, usage), limits, usd, cfg.budgetUsd, now)
  const mark = usageMark(next)
  await update($, usage, () => (next && mark !== null ? { ...next, signed: mark } : next))
  if (!next || mark === null || (await read($, isHourglassOff))) return
  const words = usageSign(next, now)
  if (await read($, areSignsOff)) $.ui.toast(`${next.kind === 'budget' ? 'Budget' : 'Usage limit'} at ${words}.`)
  else await plantSign($, next.kind, mark >= 95 ? CONTEXT_SIGN_MS : SIGN_MS, words)
}

// The context as a tide; the plain call is free. Warns once per session near the top.
async function refreshContext($: EngineInterface): Promise<void> {
  const usage = await $.session.usage().catch(() => null)
  if (!usage) return
  await refreshUsage($, usage.rateLimits, usage.cost?.usd)
  const { tokens, percent, window } = usage.context
  if (tokens === undefined) {
    await update($, tide, t => (t?.isCounted ? t : null))
    return
  }
  const lines = await linesFor($, window)
  // Idle compaction needs the one-hour cache. Limit windows are our stand-in for a subscription that has it.
  const mark = usage.rateLimits.length ? lines.idleMark : null
  const level = tideOf(tokens, lines.full, mark)
  // The level too: the same tokens fill a smaller window further, after /model.
  await update($, tide, t => (t?.tokens === tokens && t.mark === mark && t.level === level ? t : { tokens, level, mark }))
  await rearmTide($, level)
  await followTide($)
  if (level >= TIDE_WARN && !(await read($, contextWarned))) {
    await update($, contextWarned, () => true)
    if (await read($, areSignsOff)) $.ui.toast(`Context is ${Math.round(percent ?? 0)}% full. A fresh session soon would help.`)
    else await plantSign($, 'context', CONTEXT_SIGN_MS)
  }
}

// The shoreline is part of a segment's plan, so the crab never stands in the sea, and a
// segment lasts minutes (ten while it naps). So when the sea should stand somewhere else, a new
// segment starts from where the crab is now; a held pose finishes first.
async function followTide($: EngineInterface): Promise<void> {
  const cur = await read($, life)
  if (!cur) return
  const now = await $.clock.now()
  const left = cur.hold ? cur.startAt + cur.hold.ms - now : 0
  // Facing you with the flag: the sea moves and it keeps facing you.
  const flag = await read($, needsYou)
  if (left > 0 && flag && cur.hold?.pose === 'look' && cur.startAt >= flag.since) {
    const shore = shoreAt((await read($, tide))?.level ?? null, now)
    if (Math.round(lastWidth * shore) !== Math.round(lastWidth * (cur.shore ?? NO_CONTEXT_SHORE))) await startSegment($, { hold: { pose: 'look', ms: left } })
    return
  }
  if (left > 0) {
    const id = cur.id
    $.clock.after(left, async () => {
      if ((await read($, life))?.id === id) await followTide($)
    })
    return
  }
  const shore = shoreAt((await read($, tide))?.level ?? null, now)
  if (Math.round(lastWidth * shore) === Math.round(lastWidth * (cur.shore ?? NO_CONTEXT_SHORE))) return
  await startSegment($)
}

// A compaction leaves no size until the next reply, but the local count has it as soon as it
// lands, which the plain size going blank shows. It sends nothing, and the sea goes back at once.
async function ebbTide($: EngineInterface, tries = EBB_TRIES): Promise<void> {
  const context = (await $.session.usage({ breakdown: 'summary' }).catch(() => null))?.context
  if (!context) return
  if (context.tokens !== undefined) {
    if (tries > 1) $.clock.after(EBB_MS, () => void ebbTide($, tries - 1))
    return
  }
  const tokens = context.breakdown?.totalTokens
  if (tokens === undefined) return
  const lines = await linesFor($, context.window)
  const mark = (await read($, tide))?.mark ?? null
  const level = tideOf(tokens, lines.full, mark)
  await update($, tide, () => ({ tokens, level, mark, isCounted: true }))
  await rearmTide($, level)
  await startSegment($)
}

// /compact has to wait for the turn to end, so this runs then. Once per fill.
async function hintCompact($: EngineInterface): Promise<void> {
  const level = (await read($, tide))?.level ?? null
  if (level === null || level < MARK_TIDE || (await read($, contextHinted))) return
  await update($, contextHinted, () => true)
  if (await read($, areSignsOff)) await say($, 'compact', true)
  else await plantSign($, 'compact', SIGN_MS)
}

// The note for the summarizer, or nothing if the bottle is off or a read fails.
async function bottleNote($: EngineInterface): Promise<string> {
  try {
    return (await readStore($, KEY.logOff, false)) ? '' : logNote(await read($, logbook))
  } catch {
    return ''
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
  beach: Beach
}

// A new image makes the surface swap it and every animation pick up again, so a redraw
// that changes nothing you can see keeps the one it has. Not for long: if the surface
// drew it afresh, its clock would be running late.
const SCENE_KEEP_MS = 20_000
// By surface too: two surfaces asking in turn would otherwise miss every time.
const scenes = new Map<string, { key: string; at: number; source: string }>()

const sceneOf = (site: 'band' | 'tank', surface: string, v: View, b: Bubble, work: readonly string[], width: number, fit: { height?: number; fill?: boolean } = {}): string => {
  const words = b && b.until > v.now ? b.text : null
  // A held pose ending counts: with Reduce Motion on, only a new image takes it away.
  const isHolding = !!v.seg.hold && v.now < v.seg.startAt + v.seg.hold.ms
  const isGone = whereAt(planOf(v.seg), v.now - v.seg.startAt).pose === 'gone'
  const key = JSON.stringify([v.seg.id, v.seg.startAt, isHolding, isGone, width, fit, v.costume, v.look, words, v.prop, work, v.sky.weather, v.sky.isWindy, v.beach])
  const kept = scenes.get(`${site}:${surface}`)
  if (kept?.key === key && v.now >= kept.at && v.now - kept.at < SCENE_KEEP_MS) return kept.source
  const source = sceneSvg({ width, ...fit, costume: v.costume, look: v.look, timeOfDay: timeOfDay(hourOf(v.now)), bubble: words, now: v.now, seg: v.seg, prop: v.prop, sky: v.sky, hour: v.hour, work, beach: v.beach })
  scenes.set(`${site}:${surface}`, { key, at: v.now, source })
  return source
}

async function beachFor($: EngineInterface, v: View, size: { columns: number; rows: number }): Promise<string> {
  const b = await read($, bubble)
  return beachCells({ ...size, now: v.now, seg: v.seg, costume: v.costume, timeOfDay: timeOfDay(hourOf(v.now)), sky: v.sky, bubble: b && b.until > v.now ? b.text : null, beach: v.beach })
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
  const away = await read($, crabAway)
  const mood: Mood = away ? 'nap' : r && r.until > now ? r.mood : isDue ? 'stretch' : isWorking ? 'work' : isAwake ? 'wander' : 'nap'
  // Before the session starts its life (a preview, a test), it dozes at home.
  const seg: Segment = (await read($, life)) ?? {
    id: 0, seed: 1, startAt: now, startP: 0, startFace: 1, mode: 'sleep', width: lastWidth, castle: 0, shells: 0,
    food: n.food, fun: n.fun, energy: n.energy, timeOfDay: tod,
  }
  const a = await read($, antic)
  const prop = a && a.until > now && isTurnRunning && !away ? a.prop : null
  // It reaching the water is what takes the crab off the picture.
  await read($, stretchedSeg)
  const doing = (mood === 'wander' || mood === 'work') ? ACT_WORD[whereAt(planOf(seg), now - seg.startAt).act] : undefined
  const choice = await read($, picked)
  const date = new Date(now)
  const w = await read($, weather)
  const costume: Costume = isCostume(choice) ? choice : wornAt(now, w?.kind)
  const sky = skyFor(now, w?.kind ?? 'clear', w?.isWindy ?? false)
  const hour = date.getHours() + date.getMinutes() / 60
  const water = await read($, tide)
  const ctxTired = tirednessOf(water?.level ?? null)
  const tiredness: Tiredness = ctxTired === 'fresh' && isSleepy(n) ? 'tired' : ctxTired
  const look: CrabLook = { tiredness, isGrumpy: petMood(n) === 'grumpy', isHungry: isHungry(n), hasNightcap: tod === 'night' && mood === 'nap' }
  const s = await read($, stats)
  const name = await read($, petName)
  const isPastMark = !!water && water.mark !== null && water.tokens >= water.mark
  const summary = `${fmtDuration(now - (s.startedAt || now))} · ${s.turns} turns · ${s.toolCalls} tool calls${water ? ` · context ${fmtTokens(water.tokens)}${isPastMark ? ', past the mark' : ''}` : ''}`
  const flag = await read($, needsYou)
  const heldNow = flag?.what ?? heldSign(seg, now) ?? (await breakSign($, now, seg))
  const sign = away ? null : heldNow
  const isFlag = !!flag && !!sign
  const plantedNow = await read($, plantedSign)
  const signsOn = !(await read($, areSignsOff))
  // With no crab to hold it, news stands in the sand; otherwise the sand says where it went.
  const planted = (away ? heldNow : null) ?? (plantedNow && plantedNow.until > now ? plantedNow.text : null) ?? (signsOn ? (away ?? (await read($, roamNote))) : null)
  const lines = (await read($, rods)).length
  const used = (await read($, isHourglassOff)) ? null : await read($, usage)
  const beach: Beach = { ...(sign ? { sign } : {}), ...(isFlag ? { isFlag } : {}), ...(planted ? { planted } : {}), ...(used ? { usage: Math.min(1, used.percent / 100) } : {}), ...((await read($, bottleUntil)) > now ? { hasBottle: true } : {}), ...(lines ? { rods: Math.min(MAX_RODS, lines) } : {}), ...(typeof water?.mark === 'number' ? { hasMark: true } : {}) }
  const extra = [tiredness === 'fresh' ? '' : tiredness, look.isGrumpy ? 'grumpy' : '', look.isHungry ? 'hungry' : '', sign ? `holding up ${isFlag ? 'a red flag' : 'a sign'} saying ${sign}` : '', planted ? `beside a sign saying ${planted}` : '', lines ? `${lines} fishing ${lines === 1 ? 'line' : 'lines'} out` : ''].filter(Boolean)
  const alt = away
    ? `${name}'s beach, empty: ${name} is ${away}${planted && planted !== away ? `, a sign saying ${planted}` : ''}${lines ? `, ${lines} fishing ${lines === 1 ? 'line' : 'lines'} out` : ''}`
    : `${name} the crab, ${costume}, ${MOOD_WORD[mood]}${doing ? `, ${doing}` : ''}${extra.length ? `, ${extra.join(', ')}` : ''}`
  return { now, name, costume, mood, seg, prop, sky, hour, look, n, summary, alt, isDue, beach }
}

// What outlives a session goes back into the state: at the start, and again after /clear empties it.
async function loadChoices($: EngineInterface, options: PluginOptions): Promise<void> {
  const hidden = await readStore($, KEY.hidden, false)
  const breaksOff = await readStore($, KEY.breaksOff, cfg.breakMs === 0)
  const soundOff = await readStore($, KEY.soundOff, options.sound === 'off')
  const signsOff = await readStore($, KEY.signsOff, options.signs === 'off')
  await update($, isHidden, () => hidden)
  await update($, areBreaksOff, () => breaksOff)
  await update($, isSoundOff, () => soundOff)
  await update($, areSignsOff, () => signsOff)
  const needsOff = await readStore($, KEY.needsOff, false)
  const tipsOff = await readStore($, KEY.tipsOff, false)
  const hourglassOff = await readStore($, KEY.hourglassOff, false)
  await update($, areNeedsOff, () => needsOff)
  await update($, areTipsOff, () => tipsOff)
  await update($, isHourglassOff, () => hourglassOff)
  const storedMode = await $.store.get(KEY.bubbles)
  const mode = storedMode === 'often' || storedMode === 'rare' || storedMode === 'off' ? storedMode : options.bubbles === 'often' || options.bubbles === 'off' ? String(options.bubbles) : 'rare'
  await update($, bubbleMode, () => mode)
  const storedName = await $.store.get(KEY.name)
  if (typeof storedName === 'string' && cleanName(storedName)) await update($, petName, () => cleanName(storedName))
  if (await readStore($, KEY.tank, false)) void seatTank($)
}

// What each tool call means for the crab: its prop, the work pile, the logbook, news and moods.
async function watchTool($: EngineInterface, e: ToolCallInput, next: (e: ToolCallInput) => Promise<ToolCallResult>): Promise<ToolCallResult> {
  await update($, stats, s => ({ ...s, toolCalls: s.toolCalls + 1 }))
  const prop = PROPS[e.tool]
  if (!e.agentId) {
    if (prop) await showProp($, prop)
    await update($, turnWork, w => (w.length >= 15 ? w : [...w, prop ?? 'other']))
  }
  if (EDITS.has(e.tool)) {
    const result = await next(e)
    if (result.deny === undefined && result.isError !== true) {
      const { file_path, notebook_path } = e as { file_path?: unknown; notebook_path?: unknown }
      await update($, logbook, l => logFile(l, String(file_path ?? notebook_path ?? '')))
      isCleanStop = false
    }
    return result
  }
  if (e.tool !== 'Bash') {
    const news = toolNewsOf(e.tool)
    if (!news) return next(e)
    const result = await next(e)
    if (result.deny === undefined && result.isError !== true) await holdUp($, news)
    return result
  }
  const result = await next(e)
  if (result.deny === undefined) {
    const command = String((e as { command?: unknown }).command ?? '')
    const isError = result.isError === true
    const wasRed = (await read($, logbook)).test === 'failed'
    await update($, logbook, l => logShell(l, command, isError))
    const mood = reactionTo(command, isError)
    if (mood && !e.agentId) isCleanStop = mood !== 'nervous'
    const news = newsOf(command, isError) ?? (TEST.test(command) && !isError && wasRed ? 'green' : null)
    const isSigned = news ? await holdUp($, news) : false
    if (mood) {
      if (!isSigned) await react($, mood)
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
}

export const register: Register = (on, options) => {
  cfg.longMs = numberOption(options, 'longTaskSeconds', 120) * 1000
  cfg.breakMs = numberOption(options, 'breakMinutes', 90) * MIN
  cfg.budgetUsd = numberOption(options, 'budgetUsd', 0)
  cfg.place = String(options.weatherPlace ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80)

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({
      name: 'crab',
      description: 'Crab buddy: feed, play, pet, name, stats, lines, log, theme, tank or strip, breaks, sound, bubbles, signs, roam, costume',
      argumentHint: '[feed | play | pet | name <name> | stats | lines | log [on|off] | theme | size | tank | strip | snooze | breaks on|off | sound on|off | bubbles often|rare|off | signs on|off | needs on|off | tips on|off | hourglass on|off | roam on|off | here | where | off | on | restart | today | <costume>]',
    })
    const now = await $.clock.now()
    await loadChoices($, options)
    // A reload lost the timer, and the rods are still out.
    if ((await read($, rods)).length) await checkLines($)
    const met = await $.store.get(KEY.firstMet)
    const metAt = typeof met === 'number' && met > 0 ? met : now
    if (metAt === now) await $.store.set(KEY.firstMet, now)
    // A beach keeps what it already earned: only what comes after this count is its own.
    if (typeof (await $.store.get(KEY.earned)) !== 'number') {
      const sh = await $.store.get(KEY.shells)
      await $.store.set(KEY.earned, isShells(sh) ? sh.count : 0)
    }
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
    ticker?.cancel()
    ticker = $.clock.every(MIN, () => {
      void minuteTick($)
    })
    rover?.cancel()
    rover = null
    await syncRoam($)

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
    if (word === 'log') {
      if (value === 'on' || value === 'off') {
        await $.store.set(KEY.logOff, value === 'off')
        return { text: value === 'off' ? 'The bottle stays ashore: summaries get nothing from the crab. It keeps the log.' : 'Bottle on: the log goes to the summarizer before each compaction.' }
      }
      const log = logText(await read($, logbook)) || 'Nothing logged yet.'
      return { text: `${log}\nThe bottle is ${(await readStore($, KEY.logOff, false)) ? 'off' : 'on'}: /crab log on|off.` }
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
      const fish = await $.store.get(KEY.fish)
      const { temperament } = layoutOf(tr.layout)
      const used = await read($, usage)
      return { text: `${v.summary}${used ? ` · ${usageStat(used, v.now)}` : ''} · food ${Math.round(v.n.food)} · fun ${Math.round(v.n.fun)} · energy ${Math.round(v.n.energy)} · ${tr.shells} shells${tr.golden ? ` (+${tr.golden} golden)` : ''}${typeof fish === 'number' && fish > 0 ? ` · ${fish} fish` : ''}${temperament ? ` · ${TEMPERAMENTS[temperament].word}` : ''} · ${themeAt(v.now)}` }
    }
    if (word === 'lines') {
      const out = await read($, rods)
      if (!out.length) return { text: 'No lines in the water.' }
      return { text: `${out.length} ${out.length === 1 ? 'line' : 'lines'} in the water:\n${out.map(r => `- ${r.description || 'a subagent'}`).join('\n')}` }
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
    if (word === 'roam') {
      if (value !== 'on' && value !== 'off') return { text: 'Use /crab roam on or /crab roam off. On, one crab goes between your windows.' }
      await $.store.set(KEY.roam, value === 'on')
      await syncRoam($)
      return { text: value === 'on' ? 'One crab now: it comes to whichever window you write in, and goes to one that finishes a long task. Your other sessions join within a minute.' : 'Every window keeps its own crab again.' }
    }
    if (word === 'here') {
      if (!rover) return { text: "It's not roaming. /crab roam on turns that on." }
      await claimCrab($, 'person')
      return { text: `${await read($, petName)} is on its way.` }
    }
    if (word === 'where') {
      const away = await read($, crabAway)
      return { text: `${await read($, petName)} is ${away ?? 'here'}.` }
    }
    if (word === 'signs') {
      if (value !== 'on' && value !== 'off') return { text: 'Use /crab signs on or /crab signs off.' }
      await update($, areSignsOff, () => value === 'off')
      await $.store.set(KEY.signsOff, value === 'off')
      if (value === 'off') {
        await update($, plantedSign, () => null)
        await update($, signQueue, () => [])
      }
      return { text: value === 'off' ? 'No more signs: bubbles and toasts carry the news.' : 'Signs are back.' }
    }
    // The helper's switches, each kept across sessions.
    if (word === 'needs' || word === 'tips' || word === 'hourglass') {
      if (value !== 'on' && value !== 'off') return { text: `Use /crab ${word} on or /crab ${word} off.` }
      const isOff = value === 'off'
      if (word === 'needs') await update($, areNeedsOff, () => isOff)
      else if (word === 'tips') await update($, areTipsOff, () => isOff)
      else await update($, isHourglassOff, () => isOff)
      await $.store.set(word === 'needs' ? KEY.needsOff : word === 'tips' ? KEY.tipsOff : KEY.hourglassOff, isOff)
      if (word === 'needs' && isOff) await lowerFlag($)
      const said = {
        needs: ['It holds up a red flag while Claude waits for you.', 'No red flag: Claude Code still tells you when it waits.'],
        tips: ['It suggests a ready /compact at a good moment: Tab takes it.', 'No suggestions in the prompt box.'],
        hourglass: ['The hourglass shows your usage limit, or your budget.', 'No hourglass, and no usage signs.'],
      }[word]
      return { text: isOff ? said[1] : said[0] }
    }
    if (word === 'breaks' || word === 'sound') {
      if (value !== 'on' && value !== 'off') return { text: `Use /crab ${word} on or /crab ${word} off.` }
      await setFlag($, word, value === 'on')
      // A timer set to 0 in the settings stays off: say so rather than promise a reminder that never comes.
      if (word === 'breaks') {
        if (value === 'off') return { text: 'Break reminders are off.' }
        return { text: cfg.breakMs > 0 ? `Break reminders are on (every ${Math.round(cfg.breakMs / MIN)} minutes).` : `Break reminders are on, but breakMinutes is 0 in the settings, so none will come. Set it with /plugin configure crab-buddy@crab-buddy.` }
      }
      if (value === 'off') return { text: 'The done chirp is off.' }
      return { text: cfg.longMs > 0 ? 'The done chirp is on.' : 'The done chirp is on, but longTaskSeconds is 0 in the settings, so no task counts as long. Set it with /plugin configure crab-buddy@crab-buddy.' }
    }
    if (word && !isCostume(word)) {
      return { text: `Unknown option "${word}". Try: feed, play, pet, ride, name, stats, lines, log, theme, size, tank, strip, snooze, breaks, sound, bubbles, signs, roam, here, where, off, on, restart, today, or a costume (${COSTUMES.join(', ')}).` }
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
    } else {
      lookAtLines($)
    }
    return next(e)
  })

  // Each subagent is a rod: a spawn, its first turn and every end are reasons to look at the lines.
  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)
    lookAtLines($)
    return result
  })

  // The main conversation's turns only: subagents finishing do not set it off.
  on('turn.complete', async ($, e, next) => {
    if (!e.agentId) {
      isTurnRunning = false
      await lowerFlag($)
      const now = await $.clock.now()
      await update($, stats, s => ({ ...s, turns: s.turns + 1 }))
      await update($, breaks, b => ({ ...b, lastActive: now }))
      await saveNeeds($, gain(await currentNeeds($), { food: 3 }))
      const isOk = e.reason === 'answer' && !e.isAborted
      // Context first, so the new segment's shoreline is up to date.
      await refreshContext($)
      const tidy = (await read($, turnWork)).length ? 'tidy' : undefined
      if (isOk && cfg.longMs > 0 && e.durationMs >= cfg.longMs) {
        await claimCrab($, 'done')
        if (!(await holdUp($, 'done', { time: fmtDuration(e.durationMs), ...(tidy ? { first: tidy } : {}) }))) {
          await react($, 'wave', WAVE_MS, tidy)
          await say($, 'long', false, fmtDuration(e.durationMs))
        }
        $.ui.toast(`Done after ${fmtDuration(e.durationMs)}.`)
        if (!(await read($, isSoundOff))) void $.audio.play({ asset: CHIRP }, { gain: 0.5 }).catch(() => undefined)
      } else {
        await react($, isOk ? 'cheer' : 'daze', REACT_MS, tidy)
      }
      await checkBreak($)
      if (petMood(await currentNeeds($)) === 'grumpy') await say($, 'grumpy')
      if (isOk && isCleanStop) await hintCompact($)
      if (isOk) await suggestCompact($)
      isCleanStop = false
    } else {
      lookAtLines($)
    }
    return next(e)
  })

  // Fires during a turn too, so a long turn raises the tide, and the sea moves with it at once.
  on('session.measure', async ($, e, next) => {
    await refreshContext($)
    return next(e)
  })

  // The bottle: the log joins whatever the summarizer was told, and never replaces it.
  on('session.compact', async ($, e, next) => {
    const note = e.agentId ? '' : await bottleNote($)
    const result = await next(note ? { ...e, instructions: e.instructions ? `${e.instructions}\n\n${note}` : note } : e)
    // A precompute only prepares one: nothing has been compacted yet.
    const isCompacted = !e.agentId && e.trigger !== 'precompute' && result.skip === undefined
    if (isCompacted) {
      await update($, plantedSign, () => null)
      $.clock.after(EBB_MS, () => void ebbTide($))
    }
    if (isCompacted && note) {
      const until = (await $.clock.now()) + BOTTLE_MS
      await update($, bottleUntil, () => until)
      $.clock.after(BOTTLE_MS, () => {
        void update($, bottleUntil, u => (u <= until ? 0 : u))
      })
      await say($, 'bottle', true)
    }
    return result
  })

  // /clear starts a new conversation in the same process, and no session.start says so.
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      await update($, logbook, () => EMPTY_LOG)
      await update($, plantedSign, () => null)
      await update($, signQueue, () => [])
      await update($, bottleUntil, () => 0)
      await update($, turnWork, () => [])
      await update($, contextWarned, () => false)
      await update($, contextHinted, () => false)
      // A new conversation: the sea goes all the way out until its first reply measures it.
      await update($, tide, () => null)
      compactTip = { isShown: false, tries: 0 }
      $.clock.after(CLEAR_MS, async () => {
        await loadChoices($, options)
        await saveNeeds($, await currentNeeds($))
        await startSegment($)
      })
    } else if (rover && beachOf.slot) {
      // Closing: the others needn't wait for this file to go stale.
      await writeBeach($, await beachDir($), 0, false).catch(() => undefined)
    }
    return next(e)
  })

  // A permission dialog is about to ask you: the newest call of that tool, in that loop, is the one waiting.
  on('classic.PermissionRequest', async ($, e, next) => {
    const agentId = e.agent_id ?? null
    const call = [...waiting].reverse().find(([, c]) => c.tool === e.tool_name && c.agentId === agentId)
    await raiseFlag($, call?.[0] ?? `ask:${e.tool_name}`, needsLine(e.tool_name, !!agentId))
    return next(e)
  })

  // Claude Code's own "needs your permission" notice, for an ask no dialog hook saw.
  on('classic.Notification', async ($, e, next) => {
    if (/permission/i.test(e.notification_type) && !(await read($, needsYou))) await raiseFlag($, 'notice', 'needs you')
    return next(e)
  })

  // A foreground command shows its progress once it runs: you said yes, so the flag comes down.
  // Drawing is pure, so the flag comes down from a timer just after, not from the draw itself.
  on('ui.render', { component: 'ToolProgress' }, async ($, e, next) => {
    const id = String((e.props as { tool_use_id?: unknown }).tool_use_id ?? '')
    if (id && (await read($, needsYou))?.id === id) $.clock.after(0, () => void lowerFlag($, id))
    return next(e)
  })

  // You sent a message: it stops, a "!" pops up, and it turns toward you. The day's first also gets today's theme.
  on('prompt.submit', async ($, e, next) => {
    if (!e.isMeta && !e.command) {
      await lowerFlag($)
      await update($, signQueue, () => [])
      const wasAway = !!(await read($, crabAway))
      await claimCrab($, 'person')
      if (!wasAway) await startSegment($, { hold: { pose: 'notice', ms: NOTICE_MS } })
      await greet($)
    }
    return next(e)
  })

  // Counts every call, mirrors the main conversation's tools with a prop, and reacts
  // to commits, tests and builds once the shell answers. The result goes back untouched.
  // Claude waiting for you on a call: a question, a plan to approve, or a permission the dialog asks for
  // (classic.PermissionRequest below). The flag comes down when the call goes on, however it ends.
  on('tool.call', async ($, e, next) => {
    const id = String((e as { tool_use_id?: unknown }).tool_use_id ?? '')
    if (!id) return watchTool($, e, next)
    waiting.set(id, { tool: e.tool, agentId: e.agentId ?? null })
    if (!e.agentId && ASKS_YOU.has(e.tool)) await raiseFlag($, id, needsLine(e.tool))
    try {
      return await watchTool($, e, next)
    } finally {
      waiting.delete(id)
      // Raised for this call, or for its tool when the dialog could not tell which call.
      const flag = await read($, needsYou)
      if (flag && (flag.id === id || flag.id === `ask:${e.tool}` || flag.id === 'notice')) await lowerFlag($, flag.id)
    }
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
      const scene = sceneOf('band', e.surface, v, b, await read($, turnWork), width, { fill: true })
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
          <Svg source={sceneOf('tank', e.surface, v, b, await read($, turnWork), t.sceneWidth, { height: t.sceneHeight })} alt={v.alt} width={t.width} height={t.height} />
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
