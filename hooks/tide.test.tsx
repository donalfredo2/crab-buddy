// The tide: the sea on the beach should always stand where the session's context is,
// whatever moved it: a reply, a long turn, a compaction, /clear, a model with another window,
// a nap, the tank or the terminal.
import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import type { On } from 'claude-code'

import { CRAB_W, shoreFrac, tideOf } from './life'
import { decodeCells } from './terminal'

const at = (hour: number, minute = 0) => new Date(2026, 9, 29, hour, minute).getTime()
const T0 = at(12)
const BAND = {
  plugin: 'crab-buddy', component: 'AbovePrompt', requestId: 'above-prompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const
const TURN = { answer: 'hi', durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answer' } as const

/** What the engine reports: the tokens in the live window (null: no reply measured yet), its size, and where it compacts. */
type Ctx = { tokens: number | null; window: number; full: number; counted?: number; isOnPlan?: boolean }

function engine(on: On, ctx: Ctx): string[] {
  const blits: string[] = []
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
        window: ctx.window,
        ...(ctx.tokens === null ? {} : { tokens: ctx.tokens, percent: (100 * ctx.tokens) / ctx.window }),
        ...((e as { breakdown?: string }).breakdown ? { breakdown: { autoCompactThreshold: ctx.full, isAutoCompactEnabled: true, totalTokens: ctx.counted ?? ctx.tokens ?? 0 } } : {}),
      },
      rateLimits: ctx.isOnPlan ? [{ kind: 'five_hour', percentUsed: 18 }] : [],
    },
  }) as never)
  on('settings.read', () => ({ value: { idleCompaction: undefined } }) as never)
  on('ui.toast', () => ({ value: undefined }))
  on('audio.play', () => ({ value: undefined }))
  on('ui.blit', (_, e) => {
    blits.push((e as { cells: string }).cells)
    return { value: {} } as never
  })
  on('ui.panes', () => ({ value: [] }) as never)
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('ui.close', () => ({ value: undefined }) as never)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  return blits
}

type Tester = Parameters<TestBody>[0]
const start = ($: Tester) => $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
const measure = ($: Tester, ctx: Ctx) => $.session.measure({ context: { window: ctx.window }, rateLimits: [], changed: ['context'] } as never)
const crab = ($: Tester, args: string) => $.command.run({ command: 'crab', args, origin: { kind: 'user' }, presentation: { isFullscreen: false, columns: 100 } } as never)

/** The sea's edge as drawn, and the strip's width. */
async function sea($: Tester, surface: 'desktop' | 'vscode' = 'desktop'): Promise<{ x: number; width: number }> {
  const ui = await $.ui.mount({ ...BAND, surface, props: { ...BAND.props } })
  const source = String((await ui.find({ type: 'Svg' }))?.props.source ?? '')
  await ui.unmount()
  return { x: Number(/class="sea" d="M(-?[\d.]+)/.exec(source)?.[1]), width: Number(/viewBox="0 -?\d+ (\d+) /.exec(source)?.[1]) }
}
/** Where the crab stands now, by the plan the strip is playing. */
async function crabX($: Tester): Promise<number> {
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: { ...BAND.props } })
  const source = String((await ui.find({ type: 'Svg' }))?.props.source ?? '')
  await ui.unmount()
  return Number(/class="mv" transform="translate\((-?[\d.]+),0\)"/.exec(source)?.[1])
}
/** The terminal's sea: how many of the bottom row's cells are water. */
const SEA_BG = 0x4FA3CC
const waterCells = (cells: string, columns: number): number => {
  const w = decodeCells(cells)
  const rows = w.length / 3 / columns
  let n = 0
  for (let x = 0; x < columns; x++) if (w[((rows - 1) * columns + x) * 3 + 2] === SEA_BG) n++
  return n
}
/** Where the sea should be for these tokens: the plan's own formula, drawn on this strip. */
const wantX = (width: number, tokens: number | null, full: number, now: number) =>
  Math.round(width * shoreFrac(tokens === null ? null : tideOf(tokens, full, null), new Date(now).getHours() + new Date(now).getMinutes() / 60))
async function expectSeaAt($: Tester, tokens: number | null, full: number, now: number) {
  const s = await sea($)
  expect(Math.abs(s.x - wantX(s.width, tokens, full, now))).toBeLessThanOrEqual(1)
}

test('a fresh session shows an empty beach until the first reply measures the context', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  const ctx: Ctx = { tokens: null, window: 1_000_000, full: 967_000 }
  engine(on, ctx)
  await start($)
  await expectSeaAt($, null, ctx.full, T0)
  ctx.tokens = 300_000
  await $.turn.complete(TURN)
  await expectSeaAt($, 300_000, ctx.full, T0)
})

test('after every reply the sea stands where the context is, up and down', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  const ctx: Ctx = { tokens: 50_000, window: 1_000_000, full: 967_000 }
  engine(on, ctx)
  await start($)
  for (const tokens of [120_000, 400_000, 700_000, 950_000, 200_000, 60_000]) {
    await clock.advance(30_000)
    ctx.tokens = tokens
    await $.turn.complete(TURN)
    await expectSeaAt($, tokens, ctx.full, clock.now())
  }
})

test('during a long turn each measurement moves the sea at once, not a segment later', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  const ctx: Ctx = { tokens: 100_000, window: 1_000_000, full: 967_000 }
  engine(on, ctx)
  await start($)
  await $.turn.start({ text: 'refactor everything', turnId: 't1' } as never)
  for (const tokens of [250_000, 500_000, 800_000]) {
    await clock.advance(20_000)
    ctx.tokens = tokens
    await measure($, ctx)
    await expectSeaAt($, tokens, ctx.full, clock.now())
  }
})

test('while it naps the sea still follows the context', async ($, on) => {
  const clock = mock.clock(on, { now: at(23, 30) })
  mock.store(on)
  const ctx: Ctx = { tokens: 100_000, window: 1_000_000, full: 967_000 }
  engine(on, ctx)
  await start($)
  await clock.advance(60_000)
  ctx.tokens = 600_000
  await measure($, ctx)
  await expectSeaAt($, 600_000, ctx.full, clock.now())
})

test('a smaller window with the same tokens brings the sea up the beach', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  const ctx: Ctx = { tokens: 150_000, window: 1_000_000, full: 967_000 }
  engine(on, ctx)
  await start($)
  await expectSeaAt($, 150_000, 967_000, T0)
  // /model to one with a 200k window: the same conversation is now most of it.
  await clock.advance(10_000)
  ctx.window = 200_000
  ctx.full = 167_000
  await measure($, ctx)
  await expectSeaAt($, 150_000, 167_000, clock.now())
  // And back.
  await clock.advance(10_000)
  ctx.window = 1_000_000
  ctx.full = 967_000
  await measure($, ctx)
  await expectSeaAt($, 150_000, 967_000, clock.now())
})

test('/clear takes the sea all the way back, and the next reply sets it again', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  const ctx: Ctx = { tokens: 800_000, window: 1_000_000, full: 967_000 }
  engine(on, ctx)
  await start($)
  await expectSeaAt($, 800_000, ctx.full, T0)
  ctx.tokens = null
  await $.session.end({ reason: 'clear', sessionId: 's1', resume: { id: 's1' } } as never)
  await clock.advance(1500)
  await expectSeaAt($, null, ctx.full, clock.now())
  ctx.tokens = 30_000
  await $.turn.complete(TURN)
  await expectSeaAt($, 30_000, ctx.full, clock.now())
})

test('/clear empties the sea even if the engine still reports the old size until the next reply', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  const ctx: Ctx = { tokens: 800_000, window: 1_000_000, full: 967_000 }
  engine(on, ctx)
  await start($)
  await $.session.end({ reason: 'clear', sessionId: 's1', resume: { id: 's1' } } as never)
  await clock.advance(1500)
  await expectSeaAt($, null, ctx.full, clock.now())
})

test('an automatic compaction takes the sea back to what is left, and it rises from there', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  const ctx: Ctx = { tokens: 960_000, window: 1_000_000, full: 967_000, counted: 60_000 }
  engine(on, ctx)
  await start($)
  ctx.tokens = null
  await $.session.compact({ trigger: 'auto', messages: [{ role: 'user', text: 'hi', toolUses: [], toolResults: [] }] } as never)
  await clock.advance(300)
  await expectSeaAt($, 60_000, ctx.full, clock.now())
  ctx.tokens = 90_000
  await $.turn.complete(TURN)
  await expectSeaAt($, 90_000, ctx.full, clock.now())
})

test('past the line where it compacts the sea stays at the top, never off the beach', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  const ctx: Ctx = { tokens: 1_200_000, window: 1_000_000, full: 967_000 }
  engine(on, ctx)
  await start($)
  const s = await sea($)
  expect(s.x).toBe(wantX(s.width, 967_000, 967_000, T0))
  expect(s.x).toBeGreaterThan(0)
})

test('/crab stats names the same context the sea shows', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  const ctx: Ctx = { tokens: 100_000, window: 1_000_000, full: 967_000 }
  engine(on, ctx)
  await start($)
  await $.turn.start({ text: 'go', turnId: 't1' } as never)
  await clock.advance(20_000)
  ctx.tokens = 450_000
  await measure($, ctx)
  expect(String((await crab($, 'stats') as { text?: string }).text)).toMatch(/context 450k/)
  await expectSeaAt($, 450_000, ctx.full, clock.now())
})

test('VS Code shows the same sea as the desktop', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  const ctx: Ctx = { tokens: 100_000, window: 1_000_000, full: 967_000 }
  engine(on, ctx)
  await start($)
  await clock.advance(20_000)
  ctx.tokens = 700_000
  await measure($, ctx)
  const desk = await sea($)
  const code = await sea($, 'vscode')
  expect(Math.abs(desk.x / desk.width - code.x / code.width)).toBeLessThan(0.01)
  await expectSeaAt($, 700_000, ctx.full, clock.now())
})

test('a measurement while it holds a pose moves the sea once the pose is done', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  const ctx: Ctx = { tokens: 100_000, window: 1_000_000, full: 967_000 }
  engine(on, ctx)
  await start($)
  // You send a message: it stops and turns to you with a "!".
  await $.prompt.submit({ text: 'go on', isMeta: false } as never)
  ctx.tokens = 700_000
  await measure($, ctx)
  await clock.advance(2000)
  await expectSeaAt($, 700_000, ctx.full, clock.now())
})

test('a measurement that moves nothing visible leaves the crab to its plan', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  const ctx: Ctx = { tokens: 100_000, window: 1_000_000, full: 967_000 }
  engine(on, ctx)
  await start($)
  await clock.advance(5000)
  const before = await crabX($)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: { ...BAND.props } })
  const first = String((await ui.find({ type: 'Svg' }))?.props.source)
  await ui.unmount()
  // A few hundred tokens more: the sea stays on the same pixel, so the same drawing.
  ctx.tokens = 100_300
  await measure($, ctx)
  const ui2 = await $.ui.mount({ ...BAND, surface: 'desktop', props: { ...BAND.props } })
  expect(String((await ui2.find({ type: 'Svg' }))?.props.source)).toBe(first)
  await ui2.unmount()
  expect(await crabX($)).toBe(before)
})

test('when the sea comes up fast the crab is never left standing in it', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  const ctx: Ctx = { tokens: 20_000, window: 1_000_000, full: 967_000 }
  engine(on, ctx)
  await start($)
  await $.turn.start({ text: 'go', turnId: 't1' } as never)
  ctx.tokens = 960_000
  for (let i = 0; i < 40; i++) {
    await clock.advance(3000)
    if (i === 1) await measure($, ctx)
    if (i < 2) continue
    const s = await sea($)
    expect(await crabX($) + CRAB_W).toBeLessThanOrEqual(s.x + 4)
  }
})

test('the terminal beach follows the context too, without waiting for a reply', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  const ctx: Ctx = { tokens: 50_000, window: 1_000_000, full: 967_000 }
  const blits = engine(on, ctx)
  await start($)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const columns = Number((await ui.find({ type: 'Raster' }))?.props.columns)
  await $.turn.start({ text: 'go', turnId: 't1' } as never)
  await clock.advance(1000)
  const low = waterCells(blits[blits.length - 1] ?? '', columns)
  ctx.tokens = 900_000
  await measure($, ctx)
  await clock.advance(1000)
  const high = waterCells(blits[blits.length - 1] ?? '', columns)
  // Most of the run up the beach, in cells.
  expect(high - low).toBeGreaterThan(columns * 0.3)
  await ui.unmount()
})
