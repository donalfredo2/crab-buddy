// End-to-end tests that drive the real register() through the engine, closing gaps so
// every feature in README.md has at least two. The pure parts live in crab.test.tsx.
import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import type { On } from 'claude-code'

import type { Segment } from '../types'
import type { BeachRecord } from './roam'
import { plan } from './life'
import { KING_SHELLS } from './register'
import { sceneSvg } from './scene'
import { skyFor } from './sky'
import { COSTUMES, costumeOfDay } from './sprites'

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
const RUN = { origin: { kind: 'user' }, presentation: { isFullscreen: false, columns: 100 } } as never
const TURN = { answer: 'hi', durationMs: 1000, isAborted: false, turnId: 't1' } as const
const dayCostume = (ms: number) => costumeOfDay(ms, new Date(ms).getTimezoneOffset())

// Stands for the engine beneath the plugin, recording toasts and sounds (as in crab.test.tsx).
function engine(on: On, ctx: { percent: number | null; isPlaced?: boolean } = { percent: null }) {
  const isPlaced = ctx.isPlaced ?? true
  const toasts: string[] = []
  const sounds: unknown[] = []
  const panes: string[] = []
  on('command.register', () => ({ value: { command: 'crab' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('command.run', () => ({ text: '' }))
  on('prompt.submit', (_, e) => ({ text: e.text }) as never)
  on('session.usage', () => ({
    value: {
      startedAt: T0,
      context: { window: 1_000_000, ...(ctx.percent === null ? {} : { percent: ctx.percent, tokens: ctx.percent * 10_000 }) },
      rateLimits: [],
    },
  }) as never)
  on('settings.read', () => ({ value: { idleCompaction: undefined } }) as never)
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('audio.play', (_, e) => {
    sounds.push(e)
    return { value: undefined }
  })
  on('ui.blit', () => ({ value: { deny: 'not mounted' } }) as never)
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
  return { toasts, sounds, panes }
}

type Tester = Parameters<TestBody>[0]

const start = ($: Tester) => $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
const crab = ($: Tester, args: string) => $.command.run({ command: 'crab', args, ...(RUN as object) } as never)
const said = async ($: Tester, args: string) => String(((await crab($, args)) as { text?: string }).text)

async function band($: Tester, isWorking = false): Promise<{ alt: string; source: string }> {
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: { ...BAND.props, isWorking } })
  const svg = await ui.find({ type: 'Svg' })
  await ui.unmount()
  return { alt: String(svg?.props.alt ?? ''), source: String(svg?.props.source ?? '') }
}
const alt = async ($: Tester, isWorking = false) => (await band($, isWorking)).alt
const hasBubble = async ($: Tester, isWorking = false) => /class="bubble"/.test((await band($, isWorking)).source)
const heldWords = async ($: Tester, isWorking = false) => /holding up a sign saying ([^,]+)/.exec(await alt($, isWorking))?.[1] ?? null
const stat = async ($: Tester, meter: 'food' | 'fun' | 'energy') => Number(new RegExp(`${meter} (\\d+)`).exec(await said($, 'stats'))?.[1])
const shell = (on: On, fails: RegExp = /npm test/) =>
  on('tool.call', (_, e) => {
    const command = String((e as { command?: unknown }).command ?? '')
    return { result: { stdout: 'ok', stderr: '', interrupted: false }, isError: fails.test(command) } as never
  })
const run = ($: Tester, command: string) => $.tool.call({ tool: 'Bash', command } as never)
// The "!" it shows when it notices you.
const NOTICE = /opacity="1"><g fill="#E8577A"><rect x="12" y="-9"/
const savvy = (on: On, isUp: () => boolean) =>
  on('state.get', { plugin: 'savvy-progress', key: 'flow' }, () => ({
    value: { value: isUp() ? { title: 'build', isFinished: false } : null, version: 1 },
  }) as never)
const tank = ($: Tester) =>
  $.ui.mount({
    plugin: 'crab-buddy', component: 'Pane', requestId: 'crab-tank', surface: 'desktop',
    props: { title: "Crabby's beach", isFocused: false, bodyColumns: 45, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
  } as never)
const needs = (over: object) => ({ food: 80, fun: 80, energy: 90, updatedAt: T0, lastFed: 0, lastPlayed: 0, lastPetted: 0, ...over })

// --- feed, play and pet as commands

test('/crab feed feeds it once, then says it is still full and how long to wait', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  await start($)
  expect(await said($, 'feed')).toBe('Crabby ate a shrimp.')
  expect(await stat($, 'food')).toBe(95)
  expect(await alt($)).toMatch(/eating/)
  expect(await said($, 'feed')).toBe('Still full: try again in 5m 0s.')
  await clock.advance(2 * MIN)
  expect(await said($, 'feed')).toBe('Still full: try again in 3m 0s.')
  expect(await stat($, 'food')).toBe(95)
  await clock.advance(3 * MIN)
  expect(await said($, 'feed')).toBe('Crabby ate a shrimp.')
  expect(await stat($, 'food')).toBe(100)
})

test('/crab play chases the ball, lifts fun by 15, and needs 5 minutes to catch its breath', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  await start($)
  expect(await said($, 'play')).toBe('Crabby chased the ball.')
  expect(await alt($)).toMatch(/playing/)
  expect(await stat($, 'fun')).toBe(95)
  expect(await said($, 'play')).toBe('Catching its breath: try again in 5m 0s.')
  expect((await band($)).source).toMatch(/catching my breath…|one sec…|later\?/)
  await clock.advance(5 * MIN)
  expect(await said($, 'play')).toBe('Crabby chased the ball.')
})

test('/crab pet makes it happy, lifts fun by 5, and a second pet within a minute finds it already beaming', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  await start($)
  expect(await said($, 'pet')).toBe('Crabby enjoyed that.')
  expect(await alt($)).toMatch(/happy to be petted/)
  expect(await stat($, 'fun')).toBe(85)
  expect(await said($, 'pet')).toBe('Already beaming: try again in 1m 0s.')
  await clock.advance(61_000)
  expect(await said($, 'pet')).toBe('Crabby enjoyed that.')
  expect(await stat($, 'fun')).toBe(90)
})

test('a care command uses its name, and answers with a bubble even while bubbles are rare', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on, { name: 'Pinchy' })
  engine(on)
  await start($)
  expect(await said($, 'feed')).toBe('Pinchy ate a shrimp.')
  expect((await band($)).source).toMatch(/nom nom|yum!|tasty 🍤|thank you!/)
  expect(await said($, 'pet')).toBe('Pinchy enjoyed that.')
  expect(await hasBubble($)).toBe(true)
})

// --- needs

test('a finished turn feeds it 3, a commit adds 10 fun and passing tests 5 more', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on, { needs: needs({ food: 50, fun: 50 }) })
  engine(on)
  shell(on, /nothing/)
  await start($)
  await $.turn.start({ text: 'go', turnId: 't1' })
  await run($, 'git commit -m "x"')
  expect(await stat($, 'fun')).toBe(60)
  await run($, 'npm test')
  expect(await stat($, 'fun')).toBe(65)
  await $.turn.complete({ ...TURN, reason: 'answer' })
  expect(await stat($, 'food')).toBe(53)
})

test('hungry below 30 it thinks of a shrimp, and a feed puts that right', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on, { needs: needs({ food: 20 }) })
  engine(on)
  await start($)
  await $.turn.start({ text: 'go', turnId: 't1' })
  const hungry = await band($, true)
  expect(hungry.alt).toMatch(/hungry/)
  expect(hungry.source).toMatch(/class="think"/)
  await crab($, 'feed')
  await $.turn.complete({ ...TURN, reason: 'answer' })
  expect(await alt($)).not.toMatch(/hungry/)
})

test('under 25 on any meter it is grumpy, and playing with it cheers it up', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on, { needs: needs({ fun: 20 }) })
  engine(on)
  await start($)
  expect(await alt($)).toMatch(/grumpy/)
  await crab($, 'play')
  expect(await alt($)).not.toMatch(/grumpy/)
})

test('energy drains a point every 3 minutes while Claude works', async ($, on) => {
  const clock = mock.clock(on, { now: at(12) })
  mock.store(on)
  engine(on)
  await start($)
  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.advance(30 * MIN)
  expect(await stat($, 'energy')).toBe(80)
  await $.turn.complete({ ...TURN, reason: 'answer' })
  await clock.advance(5 * MIN)
  expect(await stat($, 'energy')).toBe(80)
})

test('after 23:00 the same half hour of work drains twice as much energy', async ($, on) => {
  const clock = mock.clock(on, { now: at(23, 10) })
  mock.store(on)
  engine(on)
  await start($)
  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.advance(30 * MIN)
  expect(await stat($, 'energy')).toBe(70)
})

test('a 15-minute break gives back 40 energy', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on, { needs: needs({ energy: 35 }) })
  engine(on)
  await start($)
  await $.turn.start({ text: 'go', turnId: 't1' })
  await $.turn.complete({ ...TURN, reason: 'answer' })
  await clock.advance(10 * MIN)
  expect(await stat($, 'energy')).toBe(35)
  await clock.advance(6 * MIN)
  expect(await stat($, 'energy')).toBe(75)
})

// --- breaks

test('/crab snooze puts a due break off for 30 minutes', async ($, on) => {
  const clock = mock.clock(on, { now: at(9) })
  mock.store(on)
  const { toasts } = engine(on)
  await start($)
  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.advance(91 * MIN)
  expect(await alt($, true)).toMatch(/stretching/)
  expect(await said($, 'snooze')).toBe('Break reminder snoozed for 30 minutes.')
  expect(await alt($, true)).toMatch(/working/)
  await clock.advance(28 * MIN)
  expect(await alt($, true)).toMatch(/working/)
  expect(toasts.filter(t => /Stretch/.test(t)).length).toBe(1)
  await clock.advance(3 * MIN)
  expect(await alt($, true)).toMatch(/stretching/)
  expect(toasts.filter(t => /Stretch/.test(t)).length).toBe(2)
})

test('/crab snooze before the break is due pushes the reminder past the snooze', async ($, on) => {
  const clock = mock.clock(on, { now: at(9) })
  mock.store(on)
  const { toasts } = engine(on)
  await start($)
  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.advance(80 * MIN)
  await crab($, 'snooze')
  await clock.advance(15 * MIN)
  expect(toasts.filter(t => /Stretch/.test(t))).toEqual([])
  expect(await alt($, true)).toMatch(/working/)
  await clock.advance(16 * MIN)
  expect(toasts.filter(t => /Stretch/.test(t)).length).toBe(1)
  expect(await alt($, true)).toMatch(/stretching/)
})

test('/crab breaks on brings the reminder back after off', async ($, on) => {
  const clock = mock.clock(on, { now: at(9) })
  mock.store(on)
  const { toasts } = engine(on)
  await start($)
  expect(await said($, 'breaks off')).toBe('Break reminders are off.')
  expect(await said($, 'breaks on')).toBe('Break reminders are on (every 90 minutes).')
  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.advance(91 * MIN)
  expect(toasts.filter(t => /Stretch/.test(t))).toEqual(['1h 30m in. Stretch break? (/crab snooze for 30 min)'])
})

test('/crab breaks off is remembered by the next session, and a bad word is refused', async ($, on) => {
  const clock = mock.clock(on, { now: at(9) })
  mock.store(on)
  const { toasts } = engine(on)
  await start($)
  expect(await said($, 'breaks maybe')).toBe('Use /crab breaks on or /crab breaks off.')
  await crab($, 'breaks off')
  await start($)
  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.advance(100 * MIN)
  expect(toasts.filter(t => /Stretch/.test(t))).toEqual([])
  expect(await alt($, true)).toMatch(/working/)
})

// --- the chirp

test('/crab sound on brings the chirp back after off', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  const { sounds } = engine(on)
  await start($)
  expect(await said($, 'sound off')).toBe('The done chirp is off.')
  expect(await said($, 'sound on')).toBe('The done chirp is on.')
  await $.turn.complete({ ...TURN, reason: 'answer', durationMs: 200_000 })
  expect(sounds.length).toBe(1)
})

test('/crab sound off is remembered by the next session, and a bad word is refused', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  const { sounds, toasts } = engine(on)
  await start($)
  expect(await said($, 'sound loud')).toBe('Use /crab sound on or /crab sound off.')
  await crab($, 'sound off')
  await start($)
  await $.turn.complete({ ...TURN, reason: 'answer', durationMs: 200_000 })
  expect(toasts).toEqual(['Done after 3m 20s.'])
  expect(sounds.length).toBe(0)
})

// --- speech bubbles

test('with bubbles often an unprompted line can come again after 5 minutes', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  shell(on)
  await start($)
  await crab($, 'signs off')
  expect(await said($, 'bubbles often')).toBe('Speech bubbles: often.')
  await run($, 'git commit -m a')
  expect(await hasBubble($, true)).toBe(true)
  await clock.advance(6 * MIN)
  expect(await hasBubble($, true)).toBe(false)
  await run($, 'git commit -m b')
  expect(await hasBubble($, true)).toBe(true)
})

test('with bubbles rare the same line waits 15 minutes', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  shell(on)
  await start($)
  await crab($, 'signs off')
  expect(await said($, 'bubbles rare')).toBe('Speech bubbles: rare.')
  await run($, 'git commit -m a')
  expect(await hasBubble($, true)).toBe(true)
  await clock.advance(6 * MIN)
  await run($, 'git commit -m b')
  expect(await hasBubble($, true)).toBe(false)
  await clock.advance(10 * MIN)
  await run($, 'git commit -m c')
  expect(await hasBubble($, true)).toBe(true)
})

test('an unknown bubbles setting is refused and leaves the bubbles as they were', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  await start($)
  expect(await said($, 'bubbles loud')).toBe('Use /crab bubbles often, rare or off.')
  expect(await said($, 'bubbles')).toBe('Use /crab bubbles often, rare or off.')
  await crab($, 'pet')
  expect(await hasBubble($)).toBe(true)
})

// --- the logbook

function summarizer(on: On): (string | undefined)[] {
  const told: (string | undefined)[] = []
  on('session.compact', (_, e) => {
    told.push(e.instructions)
    return { messages: e.messages }
  })
  return told
}
const SAID = [{ role: 'user', text: 'hello', toolUses: [], toolResults: [] }]
const compact = ($: Tester) => $.session.compact({ trigger: 'manual', messages: SAID } as never)
const edit = ($: Tester, path: string) => $.tool.call({ tool: 'Edit', file_path: path, old_string: 'a', new_string: 'b' } as never)

test('/crab log with nothing logged says so, and that the bottle is on', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  await start($)
  expect(await said($, 'log')).toBe('Nothing logged yet.\nThe bottle is on: /crab log on|off.')
})

test('/crab log shows edits, tests and commits as they happen', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  shell(on)
  await start($)
  await edit($, '/repo/src/tide.ts')
  await run($, 'npm test')
  const before = await said($, 'log')
  expect(before).toMatch(/tide\.ts/)
  expect(before).toMatch(/failed/)
  await run($, 'git commit -m "fix the tide"')
  expect(await said($, 'log')).toMatch(/fix the tide/)
})

test('/crab log off is remembered by the next session, and log on says the bottle goes again', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  shell(on)
  const told = summarizer(on)
  await start($)
  await crab($, 'log off')
  await start($)
  await edit($, '/a.ts')
  expect(await said($, 'log')).toMatch(/bottle is off/)
  await compact($)
  expect(told[0]).toBeUndefined()
  expect(await said($, 'log on')).toBe('Bottle on: the log goes to the summarizer before each compaction.')
  await compact($)
  expect(told[1]).toMatch(/a\.ts/)
})

// --- fishing lines

const agent = (id: string, status: string, over: object = {}) => ({ id, status, type: 'general-purpose', description: `job ${id}`, ...over })
const agents = (on: On, list: unknown[]) => on('agent.list', () => ({ value: list }) as never)
const subagentTurn = ($: Tester, id = 'a') => $.turn.start({ turnId: `t-${id}`, agentId: id } as never)

test('/crab lines lists every line out, and stands in for one with no description', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  agents(on, [agent('a', 'running', { description: '' }), agent('b', 'pending'), agent('c', 'completed')])
  await start($)
  await subagentTurn($)
  await clock.advance(600)
  expect(await said($, 'lines')).toBe('2 lines in the water:\n- a subagent\n- job b')
  expect(await alt($)).toMatch(/2 fishing lines out/)
})

test('/crab lines says the water is empty with no subagent, or only a teammate', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  agents(on, [agent('t', 'running', { type: 'teammate' })])
  await start($)
  expect(await said($, 'lines')).toBe('No lines in the water.')
  await subagentTurn($)
  await clock.advance(600)
  expect(await said($, 'lines')).toBe('No lines in the water.')
})

// --- where and here

function shoreline(on: On, clockNow: () => number) {
  const files = new Map<string, { text: string; mtimeMs: number }>()
  const DIR = '/home/u/.claude/crab-buddy/beaches'
  mock.env(on, { HOME: '/home/u' })
  on('session.surfaces', () => ({ value: ['desktop'] }) as never)
  on('session.cwd', () => ({ value: '/work/api' }) as never)
  on('session.repo', () => ({ value: { root: '/work/api', remote: null, internal: false, repository: null } }) as never)
  on('fs.write', (_, e) => {
    files.set(e.path, { text: e.text, mtimeMs: clockNow() })
    return { value: undefined } as never
  })
  on('fs.read', (_, e) => {
    const file = files.get(e.path)
    if (!file) throw new Error('ENOENT')
    return { value: file.text } as never
  })
  on('fs.list', () => ({ value: [...files].map(([path, f]) => ({ name: path.split('/').pop(), kind: 'file', size: 1, mtimeMs: f.mtimeMs, isLink: false })) }) as never)
  const record = (over: Partial<BeachRecord>): BeachRecord => ({ slot: 'web.json', token: 'web.json', at: clockNow(), repo: 'web', personAt: 0, doneAt: 0, canHold: true, ...over })
  return { other: (over: Partial<BeachRecord>) => files.set(`${DIR}/web.json`, { text: JSON.stringify(record(over)), mtimeMs: clockNow() }) }
}

test('/crab here with roaming on calls the crab back from another window', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  const { other } = shoreline(on, clock.now)
  await start($)
  await crab($, 'roam on')
  other({ personAt: clock.now() + 1 })
  await clock.advance(3100)
  expect(await said($, 'where')).toBe('Crabby is at web.')
  expect(await said($, 'here')).toBe('Crabby is on its way.')
  expect(await alt($)).toMatch(/^Crabby the crab/)
  expect(await said($, 'where')).toBe('Crabby is here.')
})

test('/crab where and here after roaming is turned off: it is home and not roaming', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  const { other } = shoreline(on, clock.now)
  await start($)
  await crab($, 'roam on')
  other({ personAt: clock.now() + 1 })
  await clock.advance(3100)
  expect(await alt($)).toMatch(/empty/)
  expect(await said($, 'roam off')).toBe('Every window keeps its own crab again.')
  expect(await said($, 'where')).toBe('Crabby is here.')
  expect(await said($, 'here')).toBe("It's not roaming. /crab roam on turns that on.")
})

// --- costumes

test('/crab with no word picks another costume for this session, never the crown without 50 shells', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  await start($)
  const today = dayCostume(T0)
  let current: string = today
  for (let i = 0; i < 12; i++) {
    const picked = /now the (\w+) for this session/.exec(await said($, ''))?.[1] ?? ''
    expect((COSTUMES as readonly string[]).includes(picked)).toBe(true)
    expect(picked).not.toBe(current)
    expect(await alt($)).toContain(`, ${picked}, `)
    current = picked
  }
})

test('/crab with no word can land on the crown once 50 shells are in', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on, { shells: { count: KING_SHELLS, last: 'x' } })
  engine(on)
  await start($)
  let isKing = false
  for (let i = 0; i < 150 && !isKing; i++) isKing = /now the king/.test(await said($, ''))
  expect(isKing).toBe(true)
  expect(await alt($)).toMatch(/, king, /)
})

test("/crab today takes the picked costume off again, and /crab theme stops mentioning it", async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  await start($)
  const today = dayCostume(T0)
  const other = COSTUMES.find(c => c !== today) ?? 'plain'
  await crab($, other)
  expect(await said($, 'theme')).toBe(`Today is ${today} day; this session wears the ${other} you picked. /crab today switches back.`)
  expect(await said($, 'today')).toBe(`Back to today's costume: ${today}.`)
  expect(await alt($)).toContain(`, ${today}, `)
  expect(await said($, 'theme')).toBe(`Today is ${today} day.`)
})

test('/crab today with nothing picked keeps today\'s costume', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  await start($)
  const today = dayCostume(T0)
  expect(await said($, 'today')).toBe(`Back to today's costume: ${today}.`)
  expect(await alt($)).toContain(`, ${today}, `)
})

test('/crab king with no shells is refused and the crab keeps today\'s costume', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on, { name: 'Pinchy' })
  engine(on)
  await start($)
  expect(await said($, 'king')).toBe('The crown takes 50 shells. Pinchy has 0.')
  expect(await alt($)).toContain(`, ${dayCostume(T0)}, `)
})

// --- size and name

test('/crab size reports the terminal strip too', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  await start($)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, bodyColumns: 80 } })
  expect(await said($, 'size')).toBe('Strip on terminal: 80 columns (viewport unknown), beach drawn 565 px wide.')
  await ui.unmount()
})

test('/crab size before the strip is drawn says so', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  await start($)
  expect(await said($, 'size')).toBe("The strip hasn't been drawn yet.")
})

test('/crab size follows the last surface that drew the strip', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  await start($)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop', viewport: { columns: 120, rows: 40 }, props: { ...BAND.props, bodyColumns: 120 } } as never)
  expect(await said($, 'size')).toBe('Strip on desktop: 120 columns (viewport 120), beach drawn 885 px wide.')
  await ui.unmount()
})

test('/crab name keeps 16 characters at most', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  await start($)
  expect(await said($, 'name Bartholomew Crabsworth')).toBe('Your crab is now called Bartholomew Crab.')
  expect(await alt($)).toMatch(/^Bartholomew Crab the crab/)
})

test('/crab name with nothing after it says its name and how to change it', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  await start($)
  expect(await said($, 'name')).toBe('Its name is Crabby. Use /crab name <name> to change it.')
  expect(await said($, 'name    ')).toBe('Its name is Crabby. Use /crab name <name> to change it.')
  expect(await said($, 'name \u0007\u001b')).toBe('Its name is Crabby. Use /crab name <name> to change it.')
})

test('/crab name drops control characters, keeps your capitals, and is remembered next session', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  await start($)
  expect(await said($, 'NAME Sh\u0007el\u001bly')).toBe('Your crab is now called Shelly.')
  await start($)
  expect(await alt($)).toMatch(/^Shelly the crab/)
  expect(await said($, 'name')).toBe('Its name is Shelly. Use /crab name <name> to change it.')
})

// --- unknown words

test('an unknown /crab word gets a list of what it knows, and the crab carries on', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  await start($)
  const answer = await said($, 'foo')
  expect(answer).toMatch(/^Unknown option "foo"\. Try: feed, play, pet, ride, name, stats/)
  expect(answer).toContain('snooze')
  expect(answer).toContain(COSTUMES.join(', '))
  expect(await alt($)).toMatch(/^Crabby the crab/)
})

test('an unknown word is matched without case, and changes no costume', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  await start($)
  expect(await said($, 'FOO Bar')).toMatch(/^Unknown option "foo"/)
  expect(await alt($)).toContain(`, ${dayCostume(T0)}, `)
  expect(await said($, 'Chef')).toBe('Crab buddy is now the chef for this session.')
})

// --- the hide switch

test('/crab off is remembered by the next session until /crab on', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  await start($)
  expect(await said($, 'off')).toBe('Crab buddy is hiding. /crab on brings it back.')
  await start($)
  expect((await band($)).source).toBe('')
  expect(await said($, 'on')).toBe('Crab buddy is back.')
  await start($)
  expect(await alt($)).toMatch(/^Crabby the crab/)
})

// --- settings passed as userConfig options

test('longTaskSeconds 0 turns the long-task wave, toast and chirp off', { options: { longTaskSeconds: 0 } }, async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  const { toasts, sounds } = engine(on)
  await start($)
  await $.turn.complete({ ...TURN, reason: 'answer', durationMs: 600_000 })
  expect(toasts).toEqual([])
  expect(sounds.length).toBe(0)
  expect(await heldWords($)).toBe(null)
  expect(await alt($)).toMatch(/cheering/)
})

test('a lower longTaskSeconds makes a shorter turn count as long', { options: { longTaskSeconds: 30 } }, async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  const { toasts, sounds } = engine(on)
  await start($)
  await $.turn.complete({ ...TURN, reason: 'answer', durationMs: 20_000 })
  expect(toasts).toEqual([])
  await $.turn.complete({ ...TURN, reason: 'answer', durationMs: 45_000 })
  expect(toasts).toEqual(['Done after 45s.'])
  expect(sounds.length).toBe(1)
  expect(await heldWords($)).toMatch(/45s/)
})

test('breakMinutes 0 turns the break reminder off', { options: { breakMinutes: 0 } }, async ($, on) => {
  const clock = mock.clock(on, { now: at(9) })
  mock.store(on)
  const { toasts } = engine(on)
  await start($)
  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.advance(200 * MIN)
  expect(toasts.filter(t => /Stretch|walk/.test(t))).toEqual([])
  expect(await alt($, true)).toMatch(/working/)
})

test('a shorter breakMinutes brings the stretch sooner', { options: { breakMinutes: 30 } }, async ($, on) => {
  const clock = mock.clock(on, { now: at(9) })
  mock.store(on)
  const { toasts } = engine(on)
  await start($)
  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.advance(29 * MIN)
  expect(toasts.filter(t => /Stretch/.test(t))).toEqual([])
  await clock.advance(2 * MIN)
  expect(toasts.filter(t => /Stretch/.test(t))).toEqual(['30m 0s in. Stretch break? (/crab snooze for 30 min)'])
  expect(await said($, 'breaks on')).toBe('Break reminders are on (every 30 minutes).')
})

test("sound 'off' keeps the long-task toast but drops the chirp, until /crab sound on", { options: { sound: 'off' } }, async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  const { toasts, sounds } = engine(on)
  await start($)
  await $.turn.complete({ ...TURN, reason: 'answer', durationMs: 150_000 })
  expect(toasts).toEqual(['Done after 2m 30s.'])
  expect(sounds.length).toBe(0)
  await crab($, 'sound on')
  await $.turn.complete({ ...TURN, reason: 'answer', durationMs: 150_000 })
  expect(sounds.length).toBe(1)
})

test("bubbles 'off' keeps the greeting and care replies quiet", { options: { bubbles: 'off' } }, async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  await start($)
  await $.prompt.submit({ text: 'hello crab' } as never)
  expect(await hasBubble($)).toBe(false)
  expect(await said($, 'pet')).toBe('Crabby enjoyed that.')
  expect(await hasBubble($)).toBe(false)
})

test("bubbles 'often' lets an unprompted line come again after 5 minutes", { options: { bubbles: 'often' } }, async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  shell(on)
  await start($)
  await crab($, 'signs off')
  await run($, 'git commit -m a')
  expect(await hasBubble($, true)).toBe(true)
  await clock.advance(6 * MIN)
  await run($, 'git commit -m b')
  expect(await hasBubble($, true)).toBe(true)
})

test("signs 'off' carries news in bubbles and toasts, not on a plank", { options: { signs: 'off' } }, async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  const { toasts } = engine(on)
  shell(on)
  await start($)
  await run($, 'git commit -m a')
  expect(await heldWords($, true)).toBe(null)
  expect(await hasBubble($, true)).toBe(true)
  await $.turn.complete({ ...TURN, reason: 'answer', durationMs: 150_000 })
  expect(await heldWords($)).toBe(null)
  expect(await alt($)).toMatch(/waving/)
  expect(toasts).toEqual(['Done after 2m 30s.'])
})

test("with signs 'off', /crab signs on brings the planks back", { options: { signs: 'off' } }, async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  shell(on)
  await start($)
  expect(await said($, 'signs on')).toBe('Signs are back.')
  await run($, 'git push')
  expect(await heldWords($)).toBeTruthy()
})

// --- the work pile

const pileOf = (source: string): string[] => {
  const pile = /<g class="(?:wpile)?" shape-rendering="crispEdges">((?:<rect [^>]*\/>)*)<\/g>/.exec(source)?.[1] ?? ''
  return [...pile.matchAll(/fill="(#[0-9A-F]{6})"/g)].map(m => m[1] ?? '')
}

test('each kind of tool adds a block of its own colour, and a subagent\'s tools add none', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  on('tool.call', () => ({ result: { stdout: '', stderr: '', interrupted: false }, isError: false }) as never)
  await start($)
  await $.turn.start({ text: 'go', turnId: 't1' })
  await $.tool.call({ tool: 'Edit', file_path: '/x', old_string: 'a', new_string: 'b', agentId: 'helper' } as never)
  expect(pileOf((await band($, true)).source)).toEqual([])
  for (const tool of ['Grep', 'WebFetch', 'Agent', 'TodoWrite']) await $.tool.call({ tool, pattern: 'x', url: 'https://x', description: 'x', prompt: 'y', todos: [] } as never)
  expect(pileOf((await band($, true)).source)).toEqual(['#9FC7E8', '#5A5853', '#F5C542', '#D9C493'])
})

test('the work pile stops growing at 15 blocks', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  on('tool.call', () => ({ result: { stdout: '', stderr: '', interrupted: false }, isError: false }) as never)
  await start($)
  await $.turn.start({ text: 'go', turnId: 't1' })
  for (let i = 0; i < 20; i++) await $.tool.call({ tool: 'Read', file_path: `/f${i}` } as never)
  const pile = pileOf((await band($, true)).source)
  expect(pile.length).toBe(15)
  expect(new Set(pile)).toEqual(new Set(['#E9D6A6']))
})

// --- the friend crab

const seg = (over: Partial<Segment> = {}): Segment => ({
  id: 1, seed: 42, startAt: T0, startP: 0.5, startFace: 1, mode: 'idle', width: 800, castle: 0, shells: 0,
  food: 80, fun: 60, energy: 80, timeOfDay: 'day', ...over,
})

test('the friend crab comes, says hello, plays, then leaves; by night they watch the sky together', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const day = plan(seg({ seed, first: 'friend' }))
    const visit = day.marks.find(m => m.kind === 'friend')
    expect(visit).toBeDefined()
    expect(['dance', 'chase']).toContain(visit?.variant)
    expect(visit?.t0 ?? 0).toBeLessThan(visit?.meet ?? 0)
    expect(visit?.meet ?? 0).toBeLessThan(visit?.part ?? 0)
    expect(visit?.part ?? 0).toBeLessThan(visit?.t1 ?? 0)
    expect(day.events.some(e => e.kind === 'say' && e.moment === 'friend')).toBe(true)
    expect(plan(seg({ seed, first: 'friend', timeOfDay: 'night' })).marks.find(m => m.kind === 'friend')?.variant).toBe('sky')
  }
})

test('the blue friend is drawn only while it visits', () => {
  const draw = (s: Segment, at: number) => sceneSvg({ width: 800, costume: 'plain', look: {}, timeOfDay: 'day', bubble: null, now: T0 + at, prop: null, sky: skyFor(T0), hour: 12, work: [], seg: s })
  const visiting = seg({ first: 'friend' })
  const visit = plan(visiting).marks.find(m => m.kind === 'friend')
  expect(draw(visiting, (visit?.meet ?? 0) + 500)).toMatch(/#5B8FD9/)
  expect(draw(seg({ mode: 'sleep' }), 1000)).not.toMatch(/#5B8FD9/)
})

// --- the "!" when you send a message

test('a slash command or a meta message does not make it notice you', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  await start($)
  await $.prompt.submit({ text: '/crab stats', command: 'crab' } as never)
  expect((await band($)).source).not.toMatch(NOTICE)
  await $.prompt.submit({ text: 'caveat', isMeta: true } as never)
  expect((await band($)).source).not.toMatch(NOTICE)
})

test('a message to a napping crab gets the "!" too', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  await start($)
  expect(await alt($)).toMatch(/napping/)
  await $.prompt.submit({ text: 'wake up' } as never)
  expect((await band($)).source).toMatch(NOTICE)
  await clock.advance(2000)
  expect((await band($)).source).not.toMatch(NOTICE)
})

// --- stepping aside for savvy-progress

test('once the savvy-progress bar goes away the crab comes back', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  let isUp = false
  savvy(on, () => isUp)
  await start($)
  expect(await alt($)).toMatch(/^Crabby the crab/)
  isUp = true
  expect((await band($)).source).toBe('')
  isUp = false
  expect(await alt($)).toMatch(/^Crabby the crab/)
})

test('while a savvy-progress bar is up the tank still shows the crab', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  savvy(on, () => true)
  await start($)
  await crab($, 'tank')
  const ui = await tank($)
  expect(await ui.find({ type: 'Svg' })).toBeDefined()
  expect(await ui.find({ key: 'crab-feed' })).toBeDefined()
  await ui.unmount()
})

// --- golden shells and reduced motion

test('a golden shell is rare, and the shells it finds are mostly plain', () => {
  let found = 0
  let golden = 0
  for (let seed = 1; seed <= 3000; seed++) {
    for (const e of plan(seg({ seed: seed * 7919, first: 'forage' })).events) {
      if (e.kind !== 'shell') continue
      found++
      if (e.isGolden) golden++
    }
  }
  expect(found).toBeGreaterThan(500)
  expect(golden).toBeGreaterThan(0)
  expect(golden / found).toBeLessThan(0.08)
})

test('a golden shell shines on the pile and /crab stats counts it apart', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on, { shells: { count: 7, last: 'x' }, goldenShells: { count: 2, last: 'y' } })
  engine(on)
  await start($)
  expect((await band($)).source).toContain('fill="#FFF3B0"')
  expect(await said($, 'stats')).toMatch(/ 7 shells \(\+2 golden\)/)
})

test('a beach without a golden shell has no shine, and stats does not mention gold', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on, { shells: { count: 7, last: 'x' } })
  engine(on)
  await start($)
  expect((await band($)).source).not.toContain('fill="#FFF3B0"')
  expect(await said($, 'stats')).not.toMatch(/golden/)
})

test('the strip and the tank both stop animating when reduced motion is asked for', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  await start($)
  const RULE = '@media (prefers-reduced-motion: reduce){*{animation:none!important}'
  expect((await band($)).source).toContain(RULE)
  await crab($, 'tank')
  const ui = await tank($)
  expect(String((await ui.find({ type: 'Svg' }))?.props.source)).toContain(RULE)
  await ui.unmount()
})

// --- found by this suite and fixed: each once broke what README.md promises.

// README (Settings): "0 turns a timer off". /crab breaks on used to promise "every 90 minutes"
// with breakMinutes 0, and no reminder ever came.
test('with breakMinutes 0, /crab breaks on says the setting keeps it off instead of promising one', { options: { breakMinutes: 0 } }, async ($, on) => {
  const clock = mock.clock(on, { now: at(9) })
  mock.store(on)
  const { toasts } = engine(on)
  await start($)
  const answer = await said($, 'breaks on')
  expect(answer).not.toMatch(/every \d+ minutes/)
  expect(answer).toMatch(/breakMinutes is 0/)
  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.advance(91 * MIN)
  expect(toasts.some(t => /Stretch/.test(t))).toBe(false)
})

test('with a break time set, /crab breaks on names it, and /crab sound on warns when no task counts as long', { options: { breakMinutes: 45, longTaskSeconds: 0 } }, async ($, on) => {
  mock.clock(on, { now: at(9) })
  mock.store(on)
  engine(on)
  await start($)
  expect(await said($, 'breaks on')).toBe('Break reminders are on (every 45 minutes).')
  expect(await said($, 'sound on')).toMatch(/longTaskSeconds is 0/)
})

// README: "`/crab name <name>`: give it a name (up to 16 characters)". A name cut at a space kept it.
test('a long name cut at 16 characters does not end in a space', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  await start($)
  expect(await said($, 'name Sir Pinchington the Third')).toBe('Your crab is now called Sir Pinchington.')
  expect(await alt($)).toMatch(/^Sir Pinchington the crab/)
})

// --- the crab's CSS motion: a browser plays these keyframes (scripts/check-animations.ts
// checks them frame by frame in Chromium); these hold the rules it found broken.
const keyframes = (svg: string, name: string): [number, string][] => {
  const body = new RegExp(`@keyframes ${name}\\{((?:[\\d.]+%\\{[^}]*\\})*)\\}`).exec(svg)?.[1] ?? ''
  return [...body.matchAll(/([\d.]+)%\{([^}]*)\}/g)].map(m => [Number(m[1]), m[2] ?? ''])
}
const draw = (over: Partial<Segment>, now = T0 + 1500) => sceneSvg({
  width: 600, costume: 'plain', look: {}, timeOfDay: 'day', bubble: null, now, prop: null, sky: skyFor(T0), hour: 12, work: [],
  seg: { id: 1, seed: 7, startAt: T0, startP: 0.3, startFace: 1, mode: 'idle', width: 600, castle: 1, shells: 4, food: 80, fun: 60, energy: 80, timeOfDay: 'day', ...over },
})
const heightOf = (v: string) => Number(/translateY\((-?[\d.]+)px\)/.exec(v)?.[1])

test('every pose layer ends on the last beat, so a late redraw does not snap back to the pose it was drawn in', () => {
  for (const seed of [7, 11, 99, 7919, 15838]) {
    const s = { seed }
    const pl = plan({ id: 1, seed, startAt: T0, startP: 0.3, startFace: 1, mode: 'idle', width: 600, castle: 1, shells: 4, food: 80, fun: 60, energy: 80, timeOfDay: 'day' })
    const svg = draw(s)
    const poses = [...new Set(pl.beats.map(b => b.pose))]
    const lastPose = pl.beats[pl.beats.length - 1]?.pose
    poses.forEach((pose, i) => {
      const end = keyframes(svg, `l${i}`).at(-1)
      expect(end?.[0]).toBe(100)
      expect(end?.[1]).toBe(`opacity:${pose === lastPose ? 1 : 0}`)
    })
  }
})

test('rising from the sea, it climbs to the sand and stays there; drawn mid-rise, it never sinks back', () => {
  const frames = keyframes(draw({ first: 'arrive', startP: 0, shore: 0.8 }, T0 + 700), 'ly')
  expect(frames[0]?.[0]).toBe(0)
  expect(heightOf(frames[0]?.[1] ?? '')).toBe(24)
  expect(frames.at(-1)?.[0]).toBe(100)
  expect(heightOf(frames.at(-1)?.[1] ?? '')).toBe(0)
  // Once up, every later frame is on the sand.
  const up = frames.findIndex(([, v]) => heightOf(v) === 0)
  expect(frames.slice(up).every(([, v]) => heightOf(v) === 0)).toBe(true)
})

test('leaving, it sinks into the sea before it is gone, with no two heights at one moment', () => {
  const frames = keyframes(draw({ mode: 'away', isLeaving: true, startP: 0.3, shore: 0.8 }), 'ly')
  expect(frames.some(([, v]) => heightOf(v) === 24)).toBe(true)
  // Two frames at one offset: the later wins, and a sink would never show.
  for (const [i, [pct, v]] of frames.entries()) {
    const next = frames[i + 1]
    if (next && next[0] === pct) expect(heightOf(next[1])).toBe(heightOf(v))
  }
  // It reaches the bottom before the plan says it is gone.
  const sunk = frames.find(([, v]) => heightOf(v) === 24)
  const gone = frames.findLast(([, v]) => heightOf(v) === 0)
  expect((sunk?.[0] ?? 100) < (gone?.[0] ?? 0)).toBe(true)
})

// --- the front door: help, what's new, feedback

test('/crab help lists the main commands and leaves the costume alone', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  await start($)
  const before = await alt($)
  const help = await said($, 'help')
  expect(help).toMatch(/^crab-buddy \d+\.\d+\.\d+\. New in/)
  for (const cmd of ['/crab feed', '/crab tank', '/crab weather', '/crab log', '/crab roam on', '/crab feedback']) expect(help).toContain(cmd)
  expect(await said($, '?')).toBe(help)
  expect(await alt($)).toBe(before)
  expect(await said($, 'nonsense')).toMatch(/\/crab help lists the main ones\.$/)
})

test('a first install hears no news, and the next session none either', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  await start($)
  expect(await heldWords($)).toBe(null)
  await clock.advance(MIN)
  await start($)
  expect(await heldWords($)).toBe(null)
})

test('after an update the crab holds up what is new once, and not again', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on, { firstMet: T0 - 24 * 60 * MIN, seenVersion: '0.22.1' })
  engine(on)
  await start($)
  expect(await heldWords($)).toBe('new: /crab help')
  await clock.advance(MIN)
  await start($)
  expect(await heldWords($)).toBe(null)
})

test('a crab met before versions kept a record still gets the news', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on, { firstMet: T0 - 24 * 60 * MIN })
  engine(on)
  await start($)
  expect(await heldWords($)).toBe('new: /crab help')
})

test('with signs off there is no news sign', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on, { firstMet: T0 - 24 * 60 * MIN, seenVersion: '0.22.1', areSignsOff: true })
  engine(on)
  await start($)
  expect(await heldWords($)).toBe(null)
})

test('/crab feedback says where to write and what is switched off, and sends nothing', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  const fetched: string[] = []
  on('http.fetch', (_, e) => {
    fetched.push((e as { url: string }).url)
    return { value: { status: 200, ok: true, headers: {}, text: '{}' } } as never
  })
  await start($)
  expect(await said($, 'feedback')).toMatch(/switched off: nothing$/)
  await crab($, 'sound off')
  await crab($, 'signs off')
  const text = await said($, 'feedback')
  expect(text).toContain('https://github.com/donalfredo2/crab-buddy/issues/new/choose')
  expect(text).toMatch(/crab-buddy \d+\.\d+\.\d+, roaming off, switched off: signs, sound$/)
  expect(fetched).toEqual([])
})
