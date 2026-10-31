// The crab as a helper: a red flag while Claude waits for you, a ready /compact at the good
// moment, and an hourglass for the usage limit or budget. Each only nudges: nothing it does
// changes what Claude or a tool does.
import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import type { On } from 'claude-code'

import { compactKeep, EMPTY_LOG } from './logbook'
import { needsLine } from './lines'
import { ACTIVE_MS, finishedElsewhere, holderOf, parseBeach, wantsNote } from './roam'
import { beachCells, decodeCells } from './terminal'
import { skyFor } from './sky'
import { hourglassSvg } from './scene'
import { clockOf, nextUsage, usageForecast, usageMark } from './usage'

const MIN = 60_000
// The host's own timer: a turn of its event loop lets a settled call reach the plugin.
const hostTimer = (globalThis as unknown as { setTimeout: (f: () => void, ms: number) => void }).setTimeout
const at = (hour: number, minute = 0) => new Date(2026, 9, 29, hour, minute).getTime()
const T0 = at(12)
const BAND = {
  plugin: 'crab-buddy', component: 'AbovePrompt', requestId: 'above-prompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const
const TURN = { answer: 'hi', durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answer' } as const
const RUN = { origin: { kind: 'user' }, presentation: { isFullscreen: false, columns: 100 } } as never

type Ctx = { tokens: number | null; rateLimits?: { kind: string; percentUsed: number; resetsAt?: string }[]; usd?: number; counted?: number; isBoxBusy?: boolean }

/** The engine beneath the plugin. A tool call waits until the test lets it go, as one does while a dialog is open. */
function engine(on: On, ctx: Ctx = { tokens: null }) {
  const toasts: string[] = []
  const sounds: unknown[] = []
  const notified: string[] = []
  const suggested: string[] = []
  const gates = new Map<string, () => void>()
  on('command.register', () => ({ value: { command: 'crab' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.end', (_, e) => ({ sessionId: e.sessionId }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('command.run', () => ({ text: '' }))
  on('prompt.submit', (_, e) => ({ text: e.text }) as never)
  on('session.compact', (_, e) => ({ messages: e.messages }) as never)
  on('session.usage', (_, e) => ({
    value: {
      startedAt: T0,
      context: {
        window: 1_000_000,
        ...(ctx.tokens === null ? {} : { tokens: ctx.tokens, percent: ctx.tokens / 10_000 }),
        ...((e as { breakdown?: string }).breakdown ? { breakdown: { autoCompactThreshold: 967_000, isAutoCompactEnabled: true, totalTokens: ctx.counted ?? ctx.tokens ?? 0 } } : {}),
      },
      rateLimits: ctx.rateLimits ?? [],
      ...(ctx.usd === undefined ? {} : { cost: { usd: ctx.usd } }),
    },
  }) as never)
  on('settings.read', () => ({ value: { idleCompaction: false } }) as never)
  on('tool.call', (_, e) => new Promise(resolve => {
    const id = String((e as { tool_use_id?: string }).tool_use_id)
    gates.set(id, () => resolve({ result: { stdout: 'ok', stderr: '', interrupted: false }, isError: false } as never))
  }) as never)
  on('classic.PermissionRequest', () => ({}) as never)
  on('classic.Notification', () => ({}) as never)
  on('prompt.suggest', (_, e) => {
    if (ctx.isBoxBusy) return { isShown: false }
    suggested.push(e.text)
    return { isShown: true }
  })
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.notify', (_, e) => {
    notified.push(String((e as { text?: unknown }).text))
    return { value: { isSent: true, channel: 'test' } } as never
  })
  on('audio.play', (_, e) => {
    sounds.push(e)
    return { value: undefined }
  })
  on('ui.blit', () => ({ value: {} }) as never)
  on('ui.panes', () => ({ value: [] }) as never)
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('ui.close', () => ({ value: undefined }) as never)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  /** Lets the call go on, as the person's answer does. */
  const answer = async (id: string) => {
    gates.get(id)?.()
    gates.delete(id)
    await new Promise<void>(r => hostTimer(r, 0))
  }
  return { toasts, sounds, notified, suggested, answer }
}

type Tester = Parameters<TestBody>[0]
const start = ($: Tester) => $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
const crab = ($: Tester, args: string) => $.command.run({ command: 'crab', args, ...(RUN as object) } as never)
const said = async ($: Tester, args: string) => String(((await crab($, args)) as { text?: string }).text)
async function band($: Tester): Promise<{ alt: string; source: string }> {
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: { ...BAND.props } })
  const svg = await ui.find({ type: 'Svg' })
  await ui.unmount()
  return { alt: String(svg?.props.alt ?? ''), source: String(svg?.props.source ?? '') }
}
const flagOf = async ($: Tester): Promise<string | null> => /holding up a red flag saying ([^,]+)/.exec((await band($)).alt)?.[1] ?? null
/** A tool call left waiting: the promise settles once the test answers it. */
const call = ($: Tester, tool: string, id: string, over: object = {}) =>
  $.tool.call({ tool, tool_use_id: id, ...(tool === 'Bash' ? { command: 'git push' } : {}), ...over } as never)
const tick = () => new Promise<void>(r => hostTimer(r, 0))

// --- the red flag

test('a permission dialog raises the red flag on the call it waits for, and the answer takes it down', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  const { answer } = engine(on)
  await start($)
  const pending = call($, 'Bash', 'c1')
  await tick()
  expect(await flagOf($)).toBe(null)
  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'git push' } })
  expect(await flagOf($)).toBe('needs you: Bash')
  expect((await band($)).source).toContain('#D9435E')
  await answer('c1')
  await pending
  expect(await flagOf($)).toBe(null)
  expect((await band($)).source).not.toContain('#D9435E')
})

test('the flag is silent: no toast, no sound, no notification', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  const { toasts, sounds, notified, answer } = engine(on)
  await start($)
  const pending = call($, 'Bash', 'c1')
  await tick()
  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: {} })
  await clock.advance(2 * MIN)
  expect(await flagOf($)).toBe('needs you: Bash')
  expect(toasts).toEqual([])
  expect(sounds).toEqual([])
  expect(notified).toEqual([])
  await answer('c1')
  await pending
})

test('a question for you and a plan to approve raise it too, until answered', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  const { answer } = engine(on)
  await start($)
  const q = call($, 'AskUserQuestion', 'q1', { questions: [] })
  await tick()
  expect(await flagOf($)).toBe('a question for you')
  await answer('q1')
  await q
  expect(await flagOf($)).toBe(null)
  const plan = call($, 'ExitPlanMode', 'p1')
  await tick()
  expect(await flagOf($)).toBe('a plan to approve')
  await answer('p1')
  await plan
  expect(await flagOf($)).toBe(null)
})

test('a subagent asking for permission raises "a helper needs you"', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  const { answer } = engine(on)
  await start($)
  const pending = call($, 'Edit', 'h1', { agentId: 'helper', file_path: '/repo/a.ts', old_string: 'a', new_string: 'b' })
  await tick()
  await $.classic.PermissionRequest({ tool_name: 'Edit', tool_input: {}, agent_id: 'helper' })
  expect(await flagOf($)).toBe('a helper needs you')
  await answer('h1')
  await pending
  expect(await flagOf($)).toBe(null)
})

test('you writing or the turn ending takes the flag down, and a forgotten one goes after ten minutes', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  await start($)
  await $.classic.PermissionRequest({ tool_name: 'WebFetch', tool_input: {} })
  expect(await flagOf($)).toBe('needs you: WebFetch')
  await $.prompt.submit({ text: 'never mind', isMeta: false } as never)
  expect(await flagOf($)).toBe(null)
  await $.classic.PermissionRequest({ tool_name: 'WebFetch', tool_input: {} })
  await $.turn.complete(TURN)
  expect(await flagOf($)).toBe(null)
  await $.classic.PermissionRequest({ tool_name: 'WebFetch', tool_input: {} })
  await clock.advance(10 * MIN + 1000)
  expect(await flagOf($)).toBe(null)
})

test('a long command you said yes to takes the flag down once it shows its progress', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  const { answer } = engine(on)
  await start($)
  const pending = call($, 'Bash', 'b1', { command: 'npm run build' })
  await tick()
  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: {} })
  expect(await flagOf($)).toBe('needs you: Bash')
  const ui = await $.ui.mount({ plugin: 'crab-buddy', component: 'ToolProgress', requestId: 'b1', surface: 'desktop', props: { tool_use_id: 'b1', kind: 'background_hint', hint: '(ctrl+b to run in background)' } } as never)
  await ui.unmount()
  await clock.advance(10)
  expect(await flagOf($)).toBe(null)
  await answer('b1')
  await pending
})

test('news that comes while the flag is up waits, and goes up after it', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  const { answer } = engine(on)
  await start($)
  const pending = call($, 'Bash', 'c1')
  await tick()
  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: {} })
  // A commit lands from a helper meanwhile: its sign waits behind the flag.
  const commit = call($, 'Bash', 'c2', { command: 'git commit -m "x"', agentId: 'helper' })
  await tick()
  await answer('c2')
  await commit
  expect(await flagOf($)).toBe('needs you: Bash')
  await answer('c1')
  await pending
  expect((await band($)).alt).toMatch(/holding up a sign saying (committed!|into the history books|saved for ever)/)
})

test('/crab needs off keeps the flag down, and the choice outlives the session', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  await start($)
  expect(await said($, 'needs off')).toMatch(/No red flag/)
  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: {} })
  expect(await flagOf($)).toBe(null)
  await start($)
  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: {} })
  expect(await flagOf($)).toBe(null)
  expect(await said($, 'needs on')).toMatch(/red flag/)
  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: {} })
  expect(await flagOf($)).toBe('needs you: Bash')
  expect(await said($, 'needs maybe')).toBe('Use /crab needs on or /crab needs off.')
})

test("Claude Code's own permission notice raises the flag when no dialog hook did", async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  await start($)
  await $.classic.Notification({ message: 'Claude needs your permission to use Bash', notification_type: 'permission_prompt' })
  expect(await flagOf($)).toBe('needs you')
  // An idle reminder is not a question for you.
  await $.turn.complete(TURN)
  await $.classic.Notification({ message: 'Claude is waiting for your input', notification_type: 'idle_prompt' })
  expect(await flagOf($)).toBe(null)
})

test('the terminal shows the flag white on red beside its head', () => {
  const seg = { id: 1, seed: 7, startAt: T0, startP: 0.4, startFace: 1, mode: 'idle', width: 82, castle: 1, shells: 2, food: 60, fun: 60, energy: 60, timeOfDay: 'day' } as const
  const base = { columns: 82, rows: 3, now: T0 + 1000, seg, costume: 'plain', timeOfDay: 'day', sky: skyFor(T0), bubble: null } as const
  const cells = (beach: object) => {
    const w = decodeCells(beachCells({ ...base, beach } as never))
    return Array.from({ length: w.length / 3 }, (_, i) => ({ ch: w[i * 3] ?? 0, fg: w[i * 3 + 1] ?? 0, bg: w[i * 3 + 2] ?? 0 }))
  }
  const flag = cells({ sign: 'needs you: Bash', isFlag: true })
  const words = flag.filter(c => c.bg === 0xD9435E && c.fg === 0xFFFFFF).map(c => String.fromCharCode(c.ch)).join('')
  expect(words.trim()).toBe('needs you: Bash')
  expect(cells({ sign: 'pushed!' }).some(c => c.bg === 0xD9435E)).toBe(false)
})

test('the flag says what it waits on in a few words', () => {
  expect(needsLine('Bash')).toBe('needs you: Bash')
  expect(needsLine('mcp__github__create_pull_request')).toBe('needs you: create_pull_reques')
  expect(needsLine('Edit', true)).toBe('a helper needs you')
  expect(needsLine('AskUserQuestion')).toBe('a question for you')
})

test('roaming: a window waiting for you calls the crab once you go quiet, like a finished task', () => {
  const here = { slot: 'a.json', token: 'a', at: T0, repo: 'api', personAt: T0 - 5000, doneAt: 0, canHold: true }
  const there = { slot: 'b.json', token: 'b', at: T0, repo: 'web', personAt: 0, doneAt: T0 - 1000, isNeeds: true, canHold: true }
  // You wrote here a moment ago: it stays, and says the other window needs you.
  expect(holderOf([here, there], T0)?.slot).toBe('a.json')
  const waiting = finishedElsewhere([here, there], here, T0)
  expect(waiting && wantsNote(waiting)).toBe('web needs you')
  // Quiet for a minute: it goes there.
  const later = T0 + ACTIVE_MS
  expect(holderOf([{ ...here, at: later }, { ...there, at: later }], later)?.slot).toBe('b.json')
})

test('roaming: the reason travels in the beach file, and an old file still reads as done', () => {
  const written = { token: 'b', at: T0, repo: 'web', personAt: 0, doneAt: T0, isNeeds: true, canHold: true }
  expect(parseBeach(JSON.stringify(written), 'b.json')?.isNeeds).toBe(true)
  const old = parseBeach(JSON.stringify({ ...written, isNeeds: undefined }), 'b.json')
  expect(old?.isNeeds).toBeUndefined()
  expect(old && wantsNote(old)).toBe('web is done')
})

// --- the ready /compact

const edit = async ($: Tester, answer: (id: string) => Promise<void>, path: string, id: string) => {
  const pending = call($, 'Edit', id, { file_path: path, old_string: 'a', new_string: 'b' })
  await tick()
  await answer(id)
  await pending
}

test('near the top of the context a ready /compact waits in the prompt box, saying what to keep', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  const ctx: Ctx = { tokens: 300_000 }
  const { suggested, answer } = engine(on, ctx)
  await start($)
  await edit($, answer, '/repo/src/auth.ts', 'e1')
  await $.turn.complete(TURN)
  expect(suggested).toEqual([])
  ctx.tokens = 950_000
  await edit($, answer, '/repo/src/login.ts', 'e2')
  await $.turn.complete(TURN)
  expect(suggested).toEqual(['/compact Keep the work on src/login.ts, src/auth.ts'])
  // Once for this fill of the context.
  await $.turn.complete(TURN)
  expect(suggested.length).toBe(1)
})

test('after the sea goes back it can offer one again, and /clear starts afresh', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  const ctx: Ctx = { tokens: 950_000 }
  const { suggested } = engine(on, ctx)
  await start($)
  await $.turn.complete(TURN)
  expect(suggested).toEqual(['/compact'])
  ctx.tokens = 100_000
  await $.turn.complete(TURN)
  ctx.tokens = 960_000
  await $.turn.complete(TURN)
  expect(suggested.length).toBe(2)
  ctx.tokens = null
  await $.session.end({ reason: 'clear', sessionId: 's1', resume: { id: 's1' } } as never)
  await clock.advance(1500)
  ctx.tokens = 960_000
  await $.turn.complete(TURN)
  expect(suggested.length).toBe(3)
})

test('/crab tips off keeps the prompt box clear, and the choice outlives the session', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  const ctx: Ctx = { tokens: 950_000 }
  const { suggested } = engine(on, ctx)
  await start($)
  expect(await said($, 'tips off')).toBe('No suggestions in the prompt box.')
  await $.turn.complete(TURN)
  await start($)
  await $.turn.complete(TURN)
  expect(suggested).toEqual([])
  expect(await said($, 'tips on')).toMatch(/Tab takes it/)
})

test('a busy prompt box gets one more try at the next turn, then the crab lets it be', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  const ctx: Ctx = { tokens: 950_000, isBoxBusy: true }
  const { suggested } = engine(on, ctx)
  await start($)
  await $.turn.complete(TURN)
  await $.turn.complete(TURN)
  ctx.isBoxBusy = false
  await $.turn.complete(TURN)
  expect(suggested).toEqual([])
})

test('a stopped or failed turn offers nothing', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  const { suggested } = engine(on, { tokens: 950_000 })
  await start($)
  await $.turn.complete({ ...TURN, isAborted: true })
  await $.turn.complete({ ...TURN, reason: 'error' } as never)
  expect(suggested).toEqual([])
})

test('the /compact keeps files, the last commit and anything failing, in a short line', () => {
  expect(compactKeep(EMPTY_LOG)).toBe('/compact')
  expect(compactKeep({ files: ['/r/a.ts'], test: 'failed', build: null, commits: ['add login'] })).toBe('/compact Keep the work on r/a.ts; the last commit "add login"; the tests are failing')
  const line = compactKeep({ files: Array.from({ length: 30 }, (_, i) => `/repo/src/feature/very-long-file-name-${i}.ts`), test: null, build: 'failed', commits: ['x'] })
  expect(line.length).toBeLessThanOrEqual(240)
  expect(line).toMatch(/very-long-file-name-29/)
  expect(line).toMatch(/the build is failing/)
})

// --- the hourglass

const RESET = new Date(T0 + 3 * 3_600_000).toISOString()
const hourglassOf = async ($: Tester): Promise<string | null> => /<g class="hourglass"[\s\S]*?<\/g>/.exec((await band($)).source)?.[0] ?? null
const sandIn = (svg: string | null): number => (svg?.match(/fill="#E8C27A"|fill="#E8577A"/g) ?? []).length

test('on a subscription the hourglass stands on the home shell and drains as the limit fills', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  const ctx: Ctx = { tokens: 100_000, rateLimits: [{ kind: 'five_hour', percentUsed: 10, resetsAt: RESET }] }
  engine(on, ctx)
  await start($)
  const early = await hourglassOf($)
  expect(early).not.toBe(null)
  // Most sand still on top: the top bulb's cells sit above the neck.
  expect(early).toMatch(/class="trk"/)
  ctx.rateLimits = [{ kind: 'five_hour', percentUsed: 60, resetsAt: RESET }]
  await clock.advance(10 * MIN)
  await $.turn.complete(TURN)
  const later = await hourglassOf($)
  expect(later).not.toBe(early)
  expect(sandIn(later)).toBe(sandIn(early))
  expect(String((await crab($, 'stats') as { text?: string }).text)).toMatch(new RegExp(`limit 60% \\(resets ${clockOf(Date.parse(RESET))}`))
})

test('no rate limits and no budget: no hourglass, and stats leave it out', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on, { tokens: 100_000, usd: 4 })
  await start($)
  expect(await hourglassOf($)).toBe(null)
  expect(String((await crab($, 'stats') as { text?: string }).text)).not.toMatch(/limit|spent/)
})

test('signs at 80% and 95%, once each per window, with when it runs out at this pace', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  const ctx: Ctx = { tokens: 100_000, rateLimits: [{ kind: 'five_hour', percentUsed: 60, resetsAt: RESET }] }
  engine(on, ctx)
  await start($)
  ctx.rateLimits = [{ kind: 'five_hour', percentUsed: 81, resetsAt: RESET }]
  await clock.advance(10 * MIN)
  await $.turn.complete(TURN)
  const full = clockOf(T0 + 10 * MIN + Math.round((19 / 21) * 10 * MIN))
  expect((await band($)).alt).toContain(`beside a sign saying limit 81% · full ~${full} · resets ${clockOf(Date.parse(RESET))}`)
  // Still past 80: no second sign for it.
  await clock.advance(3 * MIN)
  await $.turn.complete(TURN)
  ctx.rateLimits = [{ kind: 'five_hour', percentUsed: 85, resetsAt: RESET }]
  await clock.advance(3 * MIN)
  await $.turn.complete(TURN)
  expect((await band($)).alt).not.toContain('beside a sign saying limit 85%')
  ctx.rateLimits = [{ kind: 'five_hour', percentUsed: 96, resetsAt: RESET }]
  await clock.advance(MIN)
  await $.turn.complete(TURN)
  expect((await band($)).alt).toMatch(/beside a sign saying limit 96%/)
  expect(await hourglassOf($)).toContain('#E8577A')
  // A new window starts the marks afresh.
  const next = new Date(T0 + 8 * 3_600_000).toISOString()
  ctx.rateLimits = [{ kind: 'five_hour', percentUsed: 82, resetsAt: next }]
  await clock.advance(15 * MIN)
  await $.turn.complete(TURN)
  expect((await band($)).alt).toMatch(/beside a sign saying limit 82%/)
})

test('on API billing with a budget it counts the money, and says so in stats', { options: { budgetUsd: 10 } }, async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  const ctx: Ctx = { tokens: 100_000, usd: 2 }
  engine(on, ctx)
  await start($)
  expect(await hourglassOf($)).not.toBe(null)
  expect(String((await crab($, 'stats') as { text?: string }).text)).toMatch(/spent \$2\.00 of \$10/)
  ctx.usd = 8.4
  await clock.advance(10 * MIN)
  await $.turn.complete(TURN)
  expect((await band($)).alt).toMatch(/beside a sign saying budget 84%/)
})

test('/crab hourglass off takes it away with its signs; with signs off the marks are toasts', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  const ctx: Ctx = { tokens: 100_000, rateLimits: [{ kind: 'five_hour', percentUsed: 50, resetsAt: RESET }] }
  const { toasts } = engine(on, ctx)
  await start($)
  expect(await said($, 'hourglass off')).toBe('No hourglass, and no usage signs.')
  ctx.rateLimits = [{ kind: 'five_hour', percentUsed: 85, resetsAt: RESET }]
  await clock.advance(MIN)
  await $.turn.complete(TURN)
  expect(await hourglassOf($)).toBe(null)
  expect((await band($)).alt).not.toMatch(/limit 85%/)
  await said($, 'hourglass on')
  await said($, 'signs off')
  ctx.rateLimits = [{ kind: 'five_hour', percentUsed: 96, resetsAt: RESET }]
  await clock.advance(MIN)
  await $.turn.complete(TURN)
  expect(toasts.some(t => /^Usage limit at 96%/.test(t))).toBe(true)
})

test('the reading follows the five-hour window, keeps half an hour of pace, and starts afresh on a new one', () => {
  const a = nextUsage(null, [{ kind: 'seven_day', percentUsed: 30 }, { kind: 'five_hour', percentUsed: 12, resetsAt: RESET }], undefined, 0, T0)
  expect(a?.kind).toBe('limit')
  expect(a?.percent).toBe(12)
  expect(a?.resetsAt).toBe(Date.parse(RESET))
  const b = nextUsage(a, [{ kind: 'five_hour', percentUsed: 20, resetsAt: RESET }], undefined, 0, T0 + 40 * MIN)
  // The first sample is older than the half hour: only the new one is kept.
  expect(b?.samples).toEqual([[T0 + 40 * MIN, 20]])
  const c = nextUsage({ ...b!, signed: 80 }, [{ kind: 'five_hour', percentUsed: 3, resetsAt: new Date(T0 + 9 * 3_600_000).toISOString() }], undefined, 0, T0 + 41 * MIN)
  expect(c?.signed).toBe(0)
  expect(nextUsage(null, [], 5, 0, T0)).toBe(null)
  expect(nextUsage(null, [], 5, 20, T0)?.percent).toBe(25)
})

test('the forecast needs a real rise over five minutes, and gives way to a reset that comes first', () => {
  expect(usageForecast([[T0, 50]], null, T0)).toBe(null)
  expect(usageForecast([[T0, 50], [T0 + 2 * MIN, 60]], null, T0 + 2 * MIN)).toBe(null)
  expect(usageForecast([[T0, 50], [T0 + 10 * MIN, 60]], null, T0 + 10 * MIN)).toBe(T0 + 50 * MIN)
  expect(usageForecast([[T0, 50], [T0 + 10 * MIN, 60]], T0 + 30 * MIN, T0 + 10 * MIN)).toBe(null)
  expect(usageForecast([[T0, 60], [T0 + 10 * MIN, 60]], null, T0 + 10 * MIN)).toBe(null)
  expect(usageMark({ kind: 'limit', percent: 97, resetsAt: null, samples: [], signed: 0 })).toBe(95)
  expect(usageMark({ kind: 'limit', percent: 97, resetsAt: null, samples: [], signed: 95 })).toBe(null)
  expect(usageMark({ kind: 'limit', percent: 79, resetsAt: null, samples: [], signed: 0 })).toBe(null)
})

test('the hourglass moves its sand from top to bottom, and stops trickling when empty or full', () => {
  const cells = (svg: string, y: number) => (svg.match(new RegExp(`y="${y}" width="1" height="1" fill="#(E8C27A|E8577A)"`, 'g')) ?? []).length
  const fresh = hourglassSvg(0)
  const half = hourglassSvg(0.5)
  const gone = hourglassSvg(1)
  // GROUND is 35: the bulbs sit at 20..22 (top) and 24..26 (bottom).
  expect(cells(fresh, 21) + cells(fresh, 20) + cells(fresh, 22)).toBe(7)
  expect(cells(fresh, 26)).toBe(0)
  expect(cells(gone, 26)).toBe(3)
  expect(cells(gone, 20)).toBe(0)
  expect(half).toMatch(/class="trk"/)
  expect(fresh).not.toMatch(/class="trk"/)
  expect(gone).not.toMatch(/class="trk"/)
  expect(hourglassSvg(0.97)).toContain('#E8577A')
})

test('the terminal draws the hourglass on the home shell: sand on top while most is left, below once most is gone', () => {
  const seg = { id: 1, seed: 7, startAt: T0, startP: 0.5, startFace: 1, mode: 'idle', width: 82, castle: 0, shells: 0, food: 60, fun: 60, energy: 60, timeOfDay: 'day' } as const
  const px = (usage?: number) => {
    const w = decodeCells(beachCells({ columns: 82, rows: 3, now: T0, seg, costume: 'plain', timeOfDay: 'day', sky: skyFor(T0), bubble: null, beach: usage === undefined ? {} : { usage } } as never))
    // Column 1, rows 0 and 1 (pixels 0..3): what is drawn there.
    return [0, 1].flatMap(r => [w[(r * 82 + 1) * 3 + 1], w[(r * 82 + 1) * 3 + 2]])
  }
  const SAND = 0xE8C27A
  const GLASS = 0xCFE8F2
  expect(px()).not.toContain(SAND)
  const fresh = px(0.1)
  const gone = px(0.9)
  expect(fresh).toContain(SAND)
  expect(fresh).toContain(GLASS)
  expect(gone).toContain(SAND)
  expect(JSON.stringify(fresh)).not.toBe(JSON.stringify(gone))
  expect(px(0.97)).toContain(0xE8577A)
})
