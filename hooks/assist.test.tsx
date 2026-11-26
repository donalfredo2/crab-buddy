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
import { clockOf, noHourglass, nextUsage, usageForecast, usageMark } from './usage'

const MIN = 60_000
// The host's own timer: a turn of its event loop lets a settled call reach the plugin.
const hostTimer = (globalThis as unknown as { setTimeout: (f: () => void, ms: number) => void }).setTimeout
const at = (hour: number, minute = 0) => new Date(2026, 9, 29, hour, minute).getTime()
const T0 = at(12)
const BAND = {
  plugin: 'crab-buddy', component: 'AbovePrompt', requestId: 'above-prompt',
  props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 10, bodyColumns: 100, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const
const TURN = { answer: 'hi', durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answer' } as const
const RUN = { origin: { kind: 'user' }, presentation: { isFullscreen: false, columns: 100 } } as never

type Ctx = { tokens: number | null; rateLimits?: { kind: string; percentUsed: number; resetsAt?: string }[]; usd?: number; counted?: number; isBoxBusy?: boolean; sea?: object }

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
        ...((e as { breakdown?: string }).breakdown ? { breakdown: { autoCompactThreshold: 967_000, isAutoCompactEnabled: true, totalTokens: ctx.counted ?? ctx.tokens ?? 0, ...ctx.sea } } : {}),
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
  // Two minutes on, the flag says so; nothing else does unless /crab alert asked for it.
  expect(await flagOf($)).toBe('needs you: Bash · 2m')
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
  const base = { columns: 82, rows: 4, now: T0 + 1000, seg, costume: 'plain', timeOfDay: 'day', sky: skyFor(T0), bubble: null } as const
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
  expect(compactKeep({ ...EMPTY_LOG, commits: ['say "hi" back'] })).toBe(`/compact Keep the last commit "say 'hi' back"`)
})

// --- the hourglass

test('noHourglass names why there is no hourglass, in order', () => {
  const base = { isOff: false, hasLimits: false, budgetUsd: 0, hasCost: false }
  expect(noHourglass({ ...base, isOff: true, hasLimits: true })).toBe('switched off (/crab hourglass on)')
  expect(noHourglass({ ...base, hasLimits: true })).toBeNull()
  expect(noHourglass({ ...base, budgetUsd: 10, hasCost: true })).toBeNull()
  expect(noHourglass({ ...base, hasCost: true })).toBe('no usage limit reported, as on API billing (budgetUsd sets a budget to count down)')
  expect(noHourglass(base)).toBe('no usage limit reported yet')
  expect(noHourglass({ ...base, budgetUsd: 10 })).toBe('no usage limit reported yet')
})

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

test('the hourglass is big and dark enough to see', () => {
  const g = hourglassSvg(0.4)
  const xs = [...g.matchAll(/x="([\d.]+)"/g)].map(m => Number(m[1])), ys = [...g.matchAll(/y="([\d.]+)"/g)].map(m => Number(m[1]))
  expect(Math.max(...xs) - Math.min(...xs) + 1).toBeGreaterThanOrEqual(9)
  expect(Math.max(...ys) - Math.min(...ys) + 1).toBeGreaterThanOrEqual(12)
  expect(g).toContain('class="hgo"')            // the outline, themed in CSS
  expect(Math.min(...xs)).toBeGreaterThanOrEqual(0)
  expect(Math.max(...xs)).toBeLessThan(26)       // left of TRACK_MIN: it never stands in the crab's track
})

test('the hourglass moves its sand from top to bottom, and stops trickling when empty or full', () => {
  const cells = (svg: string, y: number) => (svg.match(new RegExp(`y="${y}" width="1" height="1" fill="#(E8C27A|E8577A)"`, 'g')) ?? []).length
  // GROUND is 35: the frame is rows 15..27, the top bulb's sand on rows 17..20, the bottom bulb's on rows 25 and 26.
  const top = (svg: string) => [17, 18, 19, 20].reduce((n, y) => n + cells(svg, y), 0)
  const bottom = (svg: string) => cells(svg, 25) + cells(svg, 26)
  const fresh = hourglassSvg(0)
  const half = hourglassSvg(0.5)
  const gone = hourglassSvg(1)
  expect(top(fresh)).toBe(12)
  expect(bottom(fresh)).toBe(0)
  expect(bottom(gone)).toBe(12)
  expect(top(gone)).toBe(0)
  // More used: less on top and more below, always twelve in all.
  let prev = 13
  for (let u = 0; u <= 1.001; u += 0.05) {
    const g = hourglassSvg(u)
    expect(top(g) + bottom(g)).toBe(12)
    expect(top(g)).toBeLessThanOrEqual(prev)
    prev = top(g)
  }
  expect(top(half)).toBe(6)
  expect(hourglassSvg(-1)).toBe(fresh)
  expect(hourglassSvg(2)).toBe(gone)
  expect(half).toMatch(/class="trk"/)
  expect(fresh).not.toMatch(/class="trk"/)
  expect(gone).not.toMatch(/class="trk"/)
  expect(hourglassSvg(0.94)).not.toContain('#E8577A')
  expect(hourglassSvg(0.97)).toContain('#E8577A')
})

test('the terminal draws the hourglass on the home shell: sand on top while most is left, below once most is gone', () => {
  const seg = { id: 1, seed: 7, startAt: T0, startP: 0.5, startFace: 1, mode: 'idle', width: 82, castle: 0, shells: 0, food: 60, fun: 60, energy: 60, timeOfDay: 'day' } as const
  const px = (usage?: number) => {
    const w = decodeCells(beachCells({ columns: 82, rows: 4, now: T0, seg, costume: 'plain', timeOfDay: 'day', sky: skyFor(T0), bubble: null, beach: usage === undefined ? {} : { usage } } as never))
    // Column 1, rows 1 and 2 (pixels 2..5): what is drawn there.
    return [1, 2].flatMap(r => [w[(r * 82 + 1) * 3 + 1], w[(r * 82 + 1) * 3 + 2]])
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

// --- what it costs

const USED = { input_tokens: 100, output_tokens: 2_000, cache_read_input_tokens: 50_000, cache_creation_input_tokens: 5_000, model: 'model-a' }
const heldSign = async ($: Tester): Promise<string | null> => /holding up a sign saying ([^,]+)/.exec((await band($)).alt)?.[1] ?? null

test('stats and /crab cost say what the session cost, with its tokens, the helpers apart', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  const ctx: Ctx = { tokens: 100_000, usd: 0.4 }
  engine(on, ctx)
  await start($)
  await $.turn.complete({ ...TURN, usage: USED } as never)
  await $.turn.complete({ ...TURN, agentId: 'a1', usage: { ...USED, model: 'model-b' } } as never)
  expect(await said($, 'stats')).toContain('cost $0.40 · 4k out, 10k in, 100k cached')
  const cost = await said($, 'cost')
  expect(cost).toContain("This session: $0.40, Claude Code's own total")
  expect(cost).toContain('helpers (subagents): 2k out, 5k in, 50k cached')
  expect(cost).toContain('model-b: ')
})

test('on a subscription the dollars are an estimate at API prices', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on, { tokens: 100_000, usd: 3.2, rateLimits: [{ kind: 'five_hour', percentUsed: 10, resetsAt: RESET }] })
  await start($)
  expect(await said($, 'stats')).toContain('≈ $3.20 at API prices')
  expect(await said($, 'cost')).toContain('Your subscription covers it')
})

test('a sign at each dollar mark, once; none for what was spent before the crab looked', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  const ctx: Ctx = { tokens: 100_000, usd: 5.5 }
  engine(on, ctx)
  await start($)
  // $5 was passed before the first reading: no sign for it.
  expect(await heldSign($)).toBe(null)
  ctx.usd = 10.1
  await clock.advance(MIN)
  await $.session.measure({ context: { window: 1_000_000, tokens: 100_000 }, rateLimits: [], cost: { usd: 10.1 }, changed: ['cost'] } as never)
  expect(await heldSign($)).toMatch(/^\$10 (so far|this session)$/)
  // Still past $10 a while later: no second sign.
  await clock.advance(MIN)
  ctx.usd = 12
  await $.session.measure({ context: { window: 1_000_000, tokens: 100_000 }, rateLimits: [], cost: { usd: 12 }, changed: ['cost'] } as never)
  expect(await heldSign($)).toBe(null)
})

test('/crab cost off keeps the signs down and outlives the session; with signs off a mark is a toast', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  const ctx: Ctx = { tokens: 100_000, usd: 0.5 }
  const { toasts } = engine(on, ctx)
  await start($)
  expect(await said($, 'cost off')).toBe('No signs for money spent. /crab cost still tells you.')
  // A new session keeps the choice.
  await start($)
  expect(await said($, 'cost')).toContain(': off (/crab cost on|off)')
  ctx.usd = 5.2
  await clock.advance(MIN)
  await $.session.measure({ context: { window: 1_000_000, tokens: 100_000 }, rateLimits: [], cost: { usd: 5.2 }, changed: ['cost'] } as never)
  expect(await heldSign($)).toBe(null)
  expect(toasts.some(t => t.includes('so far this session'))).toBe(false)
  await said($, 'cost on')
  await said($, 'signs off')
  ctx.usd = 10.5
  await clock.advance(MIN)
  await $.session.measure({ context: { window: 1_000_000, tokens: 100_000 }, rateLimits: [], cost: { usd: 10.5 }, changed: ['cost'] } as never)
  expect(toasts).toContain('$10 so far this session. /crab cost has the details.')
})

test('with a budget hourglass the dollar marks stay down: its own signs count the same money', { options: { budgetUsd: 100 } }, async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  const ctx: Ctx = { tokens: 100_000, usd: 0.5 }
  engine(on, ctx)
  await start($)
  ctx.usd = 5.5
  await clock.advance(MIN)
  await $.session.measure({ context: { window: 1_000_000, tokens: 100_000 }, rateLimits: [], cost: { usd: 5.5 }, changed: ['cost'] } as never)
  expect(await heldSign($)).toBe(null)
  expect(await said($, 'stats')).toContain('spent $5.50 of $100')
  expect(await said($, 'stats')).not.toContain('cost $5.50')
})

test('/clear starts the count again', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  const ctx: Ctx = { tokens: 100_000, usd: 2 }
  engine(on, ctx)
  await start($)
  await $.turn.complete({ ...TURN, usage: USED } as never)
  expect(await said($, 'stats')).toContain('2k out')
  ctx.usd = undefined
  await $.session.end({ reason: 'clear', sessionId: 's1', resume: { id: 's1' } } as never)
  await clock.advance(1500)
  expect(await said($, 'cost')).toContain('No tokens counted yet.')
})

// --- the campfire: how warm the prompt cache likely still is

const COOLING = /beside a sign saying (cache cools|fire out) in 1 min/
const SAID_ONCE = [{ role: 'user', text: 'hi', toolUses: [], toolResults: [] }]

test('a reply lights the campfire; it burns down, a sign says when it cools, and it goes out', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on, { tokens: 150_000 })
  await start($)
  expect((await band($)).alt).not.toContain('campfire')
  await $.turn.start({ text: 'go', turnId: 't1' })
  await $.turn.complete({ ...TURN, usage: { ...USED, model: 'claude-opus-5-5' } } as never)
  expect((await band($)).alt).toContain('by a blazing campfire')
  expect(await said($, 'stats')).toContain('cache warm ~5 min')
  await clock.advance(3 * MIN)
  expect((await band($)).alt).toContain('by a campfire burning down')
  await clock.advance(MIN)
  const cooling = (await band($)).alt
  expect(cooling).toContain('by glowing embers')
  expect(cooling).toMatch(COOLING)
  await clock.advance(MIN)
  expect((await band($)).alt).toContain('by a cold campfire')
  expect((await band($)).alt).not.toMatch(COOLING)
  expect(await said($, 'cache')).toContain('~150k tokens (≈ $0.75) to the cache again')
  // The ashes go after a while; the words stay.
  await clock.advance(20 * MIN)
  expect((await band($)).alt).not.toContain('campfire')
  expect(await said($, 'stats')).toMatch(/cache cold since \d+:05/)
})

test('a prompt in time feeds the fire again and takes the cooling sign down', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on, { tokens: 150_000 })
  await start($)
  await $.turn.complete({ ...TURN, usage: USED } as never)
  await clock.advance(4 * MIN)
  expect((await band($)).alt).toMatch(COOLING)
  await $.turn.start({ text: 'go on', turnId: 't2' })
  expect((await band($)).alt).not.toMatch(COOLING)
  expect((await band($)).alt).toContain('by a blazing campfire')
})

// Its end comes from two readings of the clock. On a real machine they are seldom the same millisecond, and the
// sign then outlasted the prompt that warmed the cache again. Here the crab's look at the sand between the two
// readings is held while the clock moves on by one millisecond.
test('the cooling sign comes down for a prompt in time, even when the clock ticks while it is planted', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  let isArmed = false
  let wasHeld = false
  let open: () => void = () => undefined
  const gate = new Promise<void>(resolve => {
    open = resolve
  })
  on('state.get', async (_, e, next) => {
    if (isArmed && (e as { key?: string }).key === 'plantedSign') {
      isArmed = false
      wasHeld = true
      await gate
    }
    return next(e)
  })
  mock.store(on)
  engine(on, { tokens: 150_000 })
  await start($)
  await $.turn.complete({ ...TURN, usage: USED } as never)
  isArmed = true
  await clock.advance(4 * MIN)
  await clock.advance(1)
  open()
  await clock.settle()
  expect(wasHeld).toBe(true)
  expect((await band($)).alt).toMatch(COOLING)
  await $.turn.start({ text: 'go on', turnId: 't2' })
  expect((await band($)).alt).not.toMatch(COOLING)
  expect((await band($)).alt).toContain('by a blazing campfire')
})

test('another sign in the sand is left standing when the fire is fed', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on, { tokens: 950_000 })
  await start($)
  // Near the top of the window: the high-tide warning goes up, for ten minutes.
  await $.turn.complete({ ...TURN, usage: USED } as never)
  const warned = (await band($)).alt
  expect(warned).toMatch(/beside a sign saying (high tide|the sea is rising)/)
  await clock.advance(4 * MIN)
  await $.turn.start({ text: 'go on', turnId: 't2' })
  expect((await band($)).alt).toMatch(/beside a sign saying (high tide|the sea is rising)/)
})

test('a small context gets the fire but no sign', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on, { tokens: 20_000 })
  await start($)
  await $.turn.complete({ ...TURN, usage: USED } as never)
  await clock.advance(4 * MIN)
  expect((await band($)).alt).toContain('by glowing embers')
  expect((await band($)).alt).not.toMatch(COOLING)
})

test('replies mid-turn keep the fire fed; waiting for your answer it cools, and the sign says so', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  const { answer } = engine(on, { tokens: 150_000 })
  await start($)
  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.advance(4 * MIN)
  await $.session.measure({ context: { window: 1_000_000, tokens: 150_000 }, rateLimits: [], changed: ['context'] } as never)
  expect((await band($)).alt).toContain('by a blazing campfire')
  // Claude at work past the nudge's moment: no sign, it's busy keeping the cache warm.
  await clock.advance(4 * MIN)
  expect((await band($)).alt).not.toMatch(COOLING)
  await $.session.measure({ context: { window: 1_000_000, tokens: 150_000 }, rateLimits: [], changed: ['context'] } as never)
  const pending = call($, 'Bash', 'c1')
  await tick()
  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'git push' } })
  await clock.advance(4 * MIN)
  expect((await band($)).alt).toMatch(COOLING)
  await answer('c1')
  await pending
})

test('/crab cache off keeps the fire and the sign away, across sessions; with signs off the nudge is a toast', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  const { toasts } = engine(on, { tokens: 150_000 })
  await start($)
  expect(await said($, 'cache off')).toBe('No campfire and no cooling sign. /crab cache still tells you.')
  await start($)
  await $.turn.complete({ ...TURN, usage: USED } as never)
  expect((await band($)).alt).not.toContain('campfire')
  await clock.advance(4 * MIN)
  expect((await band($)).alt).not.toMatch(COOLING)
  expect(toasts.some(t => t.includes('Prompt cache cools'))).toBe(false)
  expect(await said($, 'cache')).toContain(': off (/crab cache on|off)')
  await said($, 'cache on')
  await said($, 'signs off')
  await $.turn.complete({ ...TURN, usage: USED } as never)
  await clock.advance(4 * MIN)
  expect(toasts).toContain('Prompt cache cools in 1 min: a prompt after that writes ~150k tokens to the cache again. /crab cache has the details.')
})

test('a subscription keeps it warm for the hour; a compaction puts the fire out, and /clear clears it', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on, { tokens: 150_000, rateLimits: [{ kind: 'five_hour', percentUsed: 30 }] })
  await start($)
  await $.turn.complete({ ...TURN, usage: USED } as never)
  expect(await said($, 'cache')).toContain('A one-hour cache: a subscription within its usage limits')
  await clock.advance(29 * MIN)
  expect((await band($)).alt).toContain('by a blazing campfire')
  await $.session.compact({ trigger: 'manual', messages: SAID_ONCE } as never)
  expect((await band($)).alt).toContain('by a cold campfire')
  expect(await said($, 'stats')).toContain('cache fresh after a compaction')
  await $.session.end({ reason: 'clear', sessionId: 's1', resume: { id: 's1' } } as never)
  expect((await band($)).alt).not.toContain('campfire')
  expect(await said($, 'cache')).toContain('No prompt cache yet')
})

test('CLAUDE_CODE_PROMPT_CACHE_TTL decides before the plan does', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on, { tokens: 150_000, rateLimits: [{ kind: 'five_hour', percentUsed: 30 }] })
  on('env.get', (_, e, next) => ((e as { name: string }).name === 'CLAUDE_CODE_PROMPT_CACHE_TTL' ? ({ value: '5m' } as never) : next(e)))
  await start($)
  await $.turn.complete({ ...TURN, usage: USED } as never)
  expect(await said($, 'cache')).toContain('A five-minute cache: set by an environment variable')
})

test('a context that grew between turns lights the fire, where a surface reports no turns', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  const ctx: Ctx = { tokens: 150_000 }
  engine(on, ctx)
  await start($)
  expect((await band($)).alt).not.toContain('campfire')
  await clock.advance(MIN)
  ctx.tokens = 160_000
  await $.session.measure({ context: { window: 1_000_000, tokens: 160_000 }, rateLimits: [], changed: ['context'] } as never)
  expect((await band($)).alt).toContain('by a blazing campfire')
})

test('the same size again, or a smaller one, lights nothing between turns', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  const ctx: Ctx = { tokens: 150_000 }
  engine(on, ctx)
  await start($)
  await clock.advance(MIN)
  await $.session.measure({ context: { window: 1_000_000, tokens: 150_000 }, rateLimits: [], changed: ['context'] } as never)
  ctx.tokens = 90_000
  await $.session.measure({ context: { window: 1_000_000, tokens: 90_000 }, rateLimits: [], changed: ['context'] } as never)
  expect((await band($)).alt).not.toContain('campfire')
})

test('a fire kept from before a restart burns on for the same conversation, not for a new one', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  const kept = { '/repo': { at: T0 - 3 * MIN, ttlMs: 5 * MIN, why: 'api', tokens: 150_000, model: 'claude-opus-5-5' } }
  mock.store(on, { keptFires: kept })
  const ctx: Ctx = { tokens: 151_000 }
  engine(on, ctx)
  await start($)
  expect((await band($)).alt).toContain('by a campfire burning down')
  await clock.advance(2 * MIN)
  expect((await band($)).alt).toContain('by a cold campfire')
})

test('a new conversation in the same folder gets no kept fire', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on, { keptFires: { '/repo': { at: T0 - MIN, ttlMs: 5 * MIN, why: 'api', tokens: 150_000, model: 'm' } } })
  engine(on, { tokens: 20_000 })
  await start($)
  expect((await band($)).alt).not.toContain('campfire')
})

test('every reply keeps the fire for a restart', async ($, on) => {
  mock.clock(on, { now: T0 })
  const held = new Map<string, unknown>()
  on('store.get', async (_, e) => ({ value: held.get(e.key) }))
  on('store.set', async (_, e) => {
    held.set(e.key, e.value)
    return { value: undefined }
  })
  engine(on, { tokens: 150_000 })
  await start($)
  await $.turn.complete({ ...TURN, usage: USED } as never)
  const kept = held.get('keptFires') as Record<string, { at: number; tokens: number }>
  expect(kept['/repo']?.at).toBe(T0)
  expect(kept['/repo']?.tokens).toBe(150_000)
})

// --- 0.29: the wait counted, the alert, the cold tip, the bottle ashore, /crab sea and /crab what

/** A Bash call the dialog asks about. `done` settles once the test answers it (not returned bare: an async function would wait for it). */
const ask = async ($: Tester, id: string): Promise<{ done: Promise<unknown> }> => {
  const done = call($, 'Bash', id)
  await tick()
  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: {} })
  return { done }
}

test('the waits of a day add up in /crab stats, and under a minute nothing is said', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  const { answer } = engine(on)
  await start($)
  const first = await ask($, 'c1')
  await clock.advance(40_000)
  await answer('c1')
  await first.done
  expect(await said($, 'stats')).not.toContain('waited')
  const second = await ask($, 'c2')
  await clock.advance(3 * MIN)
  expect(await flagOf($)).toBe('needs you: Bash · 3m')
  await answer('c2')
  await second.done
  const third = await ask($, 'c3')
  await clock.advance(2 * MIN)
  await answer('c3')
  await third.done
  expect(await said($, 'stats')).toContain(' · waited 6m for you (3 times) · ')
})

test('/crab alert adds a chirp, a notification or both once Claude has waited a minute, and only once', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  const { sounds, notified, answer } = engine(on)
  await start($)
  expect(await said($, 'alert')).toMatch(/^No alert: the red flag alone/)
  expect(await said($, 'alert loud')).toMatch(/^Use \/crab alert off, chirp, notify or both\./)
  expect(await said($, 'alert both')).toBe('After a minute of Claude waiting for you: a chirp and a notification. /crab alert off stops it.')
  const waiting = await ask($, 'c1')
  await clock.advance(59_000)
  expect(sounds.length + notified.length).toBe(0)
  await clock.advance(2000)
  expect(sounds.length).toBe(1)
  expect(notified).toEqual(['Claude has waited a minute: needs you: Bash.'])
  await clock.advance(5 * MIN)
  expect(sounds.length).toBe(1)
  expect(notified.length).toBe(1)
  await answer('c1')
  await waiting.done
})

test('no alert for an answer that came in time, and each kind of alert alone', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on, { waitAlert: 'notify' })
  const { sounds, notified, answer } = engine(on)
  await start($)
  expect(await said($, 'alert')).toMatch(/a notification\./)
  const quick = await ask($, 'c1')
  await clock.advance(30_000)
  await answer('c1')
  await quick.done
  await clock.advance(2 * MIN)
  expect(notified).toEqual([])
  const slow = await ask($, 'c2')
  await clock.advance(61_000)
  expect(notified.length).toBe(1)
  expect(sounds).toEqual([])
  await answer('c2')
  await slow.done
  await said($, 'alert chirp')
  const third = await ask($, 'c3')
  await clock.advance(61_000)
  expect(notified.length).toBe(1)
  expect(sounds.length).toBe(1)
  await answer('c3')
  await third.done
})

const COLD = /beside a sign saying (cold: \/compact first|fire out: \/compact\?)/

test('a fire gone cold on a big context plants a sign and offers the ready /compact, once', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  const { suggested } = engine(on, { tokens: 150_000 })
  await start($)
  await $.turn.complete({ ...TURN, usage: USED } as never)
  await clock.advance(4 * MIN + 59_000)
  expect((await band($)).alt).not.toMatch(COLD)
  expect(suggested).toEqual([])
  await clock.advance(2000)
  expect((await band($)).alt).toMatch(COLD)
  expect(suggested).toEqual(['/compact'])
  expect(await said($, 'cache')).toContain('Cold is a good moment for /compact')
  await clock.advance(5 * MIN)
  expect(suggested.length).toBe(1)
  // A prompt lights the fire again: the sign is old news.
  await $.turn.start({ text: 'go on', turnId: 't2' })
  expect((await band($)).alt).not.toMatch(COLD)
})

test('no cold tip on a small context, none in the box with tips off, and none at all with the fire off', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  const ctx: Ctx = { tokens: 60_000 }
  const { suggested } = engine(on, ctx)
  await start($)
  await $.turn.complete({ ...TURN, usage: USED } as never)
  await clock.advance(6 * MIN)
  expect((await band($)).alt).not.toMatch(COLD)
  expect(suggested).toEqual([])
  expect(await said($, 'cache')).not.toContain('good moment for /compact')
  // Big now, tips off: the sign alone.
  ctx.tokens = 150_000
  await said($, 'tips off')
  await $.turn.start({ text: 'go', turnId: 't2' })
  await $.turn.complete({ ...TURN, usage: USED } as never)
  await clock.advance(6 * MIN)
  expect((await band($)).alt).toMatch(COLD)
  expect(suggested).toEqual([])
  // The fire switched off: nothing.
  await said($, 'tips on')
  await said($, 'cache off')
  await $.turn.start({ text: 'go', turnId: 't3' })
  await $.turn.complete({ ...TURN, usage: USED } as never)
  await clock.advance(6 * MIN)
  expect((await band($)).alt).not.toMatch(COLD)
  expect(suggested).toEqual([])
})

const LEFT_OPEN = { files: ['/repo/src/a.ts', '/repo/src/b.ts'], test: 'failed', build: null, commits: ['Fix the tide'] }
const BOTTLE = '#6FB98F'

test('work left open in this folder washes up as a bottle at the next start, with a ready first prompt, once', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on, { firstMet: T0 - 86_400_000, seenVersion: '0.0.0', keptLogs: { '/repo': { at: T0 - 86_400_000, log: LEFT_OPEN } } })
  const { suggested } = engine(on)
  await start($)
  const drawn = await band($)
  expect(drawn.source).toContain(BOTTLE)
  expect(drawn.source).toContain('/crab last')
  expect(suggested).toEqual(['Pick up where we left off: the work on src/b.ts, src/a.ts; the tests were failing. Check where it stands first.'])
  expect(await said($, 'last')).toBe('Last time here (yesterday): files changed since the last commit: src/b.ts, src/a.ts; the tests were failing; last commit "Fix the tide".')
  expect(await said($, 'what')).toContain('The bottle at the waterline')
  // The bottle goes after a while, and it washes up once: a second start says nothing.
  await clock.advance(6 * MIN)
  expect((await band($)).source).not.toContain(BOTTLE)
  await start($)
  expect(suggested.length).toBe(1)
  expect((await band($)).source).not.toContain(BOTTLE)
})

test('no bottle from another folder, from more than a week ago, with nothing left open, or with the log off', async ($, on) => {
  mock.clock(on, { now: T0 })
  const WEEK = 7 * 86_400_000
  mock.store(on, {
    isLogOff: false,
    keptLogs: {
      '/elsewhere': { at: T0 - 1000, log: LEFT_OPEN },
      '/repo': { at: T0 - WEEK - 1000, log: LEFT_OPEN },
    },
  })
  const { suggested } = engine(on)
  await start($)
  expect(suggested).toEqual([])
  expect((await band($)).source).not.toContain(BOTTLE)
  expect(await said($, 'last')).toBe('Nothing kept from last time in this folder.')
})

test('the log is kept at each turn\'s end, washes up after /clear, and /crab log off forgets it', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  const { suggested, answer } = engine(on)
  await start($)
  expect(await said($, 'last')).toBe('Nothing kept from last time in this folder.')
  const edit = call($, 'Edit', 'e1', { file_path: '/repo/src/tide.ts' })
  await tick()
  await answer('e1')
  await edit
  await $.turn.complete({ ...TURN, usage: USED } as never)
  expect(await said($, 'last')).toBe('Last time here (earlier today): files changed since the last commit: src/tide.ts.')
  // /clear starts a new conversation: what the old one left open is offered to the new one.
  await $.session.end({ reason: 'clear', sessionId: 's1', resume: { id: 's1' } } as never)
  await clock.advance(1500)
  expect(suggested).toContain('Pick up where we left off: the work on src/tide.ts. Check where it stands first.')
  expect(await said($, 'log off')).toContain('nothing is kept for your next session here')
  expect(await said($, 'last')).toBe('Nothing kept from last time in this folder. Nothing is kept while the log is off (/crab log on).')
  // Off, a turn's end keeps nothing.
  const again = call($, 'Edit', 'e2', { file_path: '/repo/src/sea.ts' })
  await tick()
  await answer('e2')
  await again
  await $.turn.complete({ ...TURN, usage: USED } as never)
  expect(await said($, 'last')).toMatch(/^Nothing kept from last time/)
})

test('/crab sea lists what fills the context from the local count, and says so where there is none', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  const ctx: Ctx = {
    tokens: 246_000,
    sea: {
      totalTokens: 246_000, rawMaxTokens: 1_000_000,
      categories: [{ name: 'Messages', tokens: 212_000, kind: 'used' }, { name: 'MCP tools', tokens: 34_000, kind: 'used' }, { name: 'Free space', tokens: 754_000, kind: 'free' }],
      mcpTools: [{ serverName: 'linear', tokens: 34_000, isLoaded: true }], memoryFiles: [],
    },
  }
  engine(on, ctx)
  await start($)
  const text = await said($, 'sea')
  expect(text).toContain('The sea: 246k of a 1000k window (25%).')
  expect(text).toMatch(/Messages\s+212k\s+86%/)
  expect(text).toContain('Biggest connected tools: linear 34k.')
  expect(await said($, 'help')).toContain('/crab sea')
})

test('/crab what explains the beach as it is: the far sea at first, then the flag, the fire and the wait', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  const ctx: Ctx = { tokens: null }
  const { answer } = engine(on, ctx)
  await start($)
  const fresh = await said($, 'what')
  expect(fresh).toMatch(/^On Crabby's beach right now:\n- The sea: your context, /)
  for (const absent of ['campfire', 'red flag', 'The hourglass on the home shell', 'fishing rod']) expect(fresh).not.toContain(absent)
  expect(fresh).toContain('No hourglass: no usage limit reported yet.')
  ctx.tokens = 310_000
  await $.turn.complete({ ...TURN, usage: USED } as never)
  const waiting = await ask($, 'c1')
  await clock.advance(2 * MIN)
  const busy = await said($, 'what')
  expect(busy).toContain('The sea: your context, 310k of the 967k where Claude compacts.')
  expect(busy).toContain('The campfire, blazing: the prompt cache is warm (cache warm ~3 min). /crab cache says more.')
  expect(busy).toContain('The block by the sandcastle')
  expect(busy).toContain('The red flag: Claude is waiting for you (needs you: Bash), for 2m now.')
  await answer('c1')
  await waiting.done
})
