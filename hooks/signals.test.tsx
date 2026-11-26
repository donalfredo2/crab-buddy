// The signals go by whichever source has the figures: the measurement the engine pushes, the poll, or the
// limit windows seen earlier. On surfaces where the poll answers empty or throws, the event alone must still
// raise the sea, stand the hourglass and count the money.
import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import type { On } from 'claude-code'

const at = (hour: number, minute = 0) => new Date(2026, 9, 29, hour, minute).getTime()
const T0 = at(12)
const BAND = {
  plugin: 'crab-buddy', component: 'AbovePrompt', requestId: 'above-prompt',
  props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 10, bodyColumns: 100, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const

const PLAN = [{ kind: 'five_hour', percentUsed: 62, resetsAt: new Date(T0 + 3_600_000).toISOString() }]
const EVENT = { context: { tokens: 120_000, window: 200_000 }, rateLimits: PLAN, cost: { usd: 3.1 } }

/** What the poll answers: everything ('full'), a window and nothing else ('empty'), or an error ('throws'). */
type Fake = { poll: 'full' | 'empty' | 'throws'; window?: number }

/** The engine beneath the plugin; returns the toasts it was asked to show. */
function engine(on: On, fake: Fake): string[] {
  const toasts: string[] = []
  const window = fake.window ?? 200_000
  on('command.register', () => ({ value: { command: 'crab' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.end', (_, e) => ({ sessionId: e.sessionId }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('command.run', () => ({ text: '' }))
  on('prompt.submit', (_, e) => ({ text: e.text }) as never)
  on('session.compact', (_, e) => ({ messages: e.messages }) as never)
  on('session.usage', (_, e) => {
    if (fake.poll === 'throws') throw new Error('no usage on this surface')
    if (fake.poll === 'empty') return { value: { startedAt: T0, context: { window }, rateLimits: [] } } as never
    const isSummary = !!(e as { breakdown?: string }).breakdown
    return {
      value: {
        startedAt: T0,
        context: { window, tokens: 50_000, percent: 25, ...(isSummary ? { breakdown: { autoCompactThreshold: window, isAutoCompactEnabled: true, totalTokens: 50_000 } } : {}) },
        rateLimits: PLAN,
        cost: { usd: 1 },
      },
    } as never
  })
  on('settings.read', () => ({ value: { idleCompaction: undefined } }) as never)
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('audio.play', () => ({ value: undefined }))
  on('ui.blit', () => ({ value: {} }) as never)
  on('ui.panes', () => ({ value: [] }) as never)
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('ui.close', () => ({ value: undefined }) as never)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  return toasts
}

type Tester = Parameters<TestBody>[0]
const start = ($: Tester) => $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
const measure = ($: Tester, figures: object, changed = ['context']) => $.session.measure({ ...figures, changed } as never)
const crab = ($: Tester, args: string) => $.command.run({ command: 'crab', args, origin: { kind: 'user' }, presentation: { isFullscreen: false, columns: 100 } } as never) as Promise<{ text: string }>
/** The strip's picture as drawn now. Unmounted after: the engine allows one strip per surface at a time. */
async function band($: Tester): Promise<string> {
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: { ...BAND.props } })
  const source = String((await ui.find({ type: 'Svg' }))?.props.source ?? '')
  await ui.unmount()
  return source
}
/** The sea's left edge as drawn: further left, more water. */
const seaX = (source: string) => Number(/class="sea" d="M(-?[\d.]+)/.exec(source)?.[1])

test('with a poll that throws, the event alone raises the sea and stands the hourglass', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on, { poll: 'throws' })
  await start($)
  const before = seaX(await band($))
  await measure($, EVENT)
  expect(seaX(await band($))).toBeLessThan(before)
  expect(await band($)).toContain('class="hourglass"')
})

test('with an empty poll, the event alone does the same', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on, { poll: 'empty' })
  await start($)
  const before = seaX(await band($))
  await measure($, EVENT)
  expect(seaX(await band($))).toBeLessThan(before)
  expect(await band($)).toContain('class="hourglass"')
})

test('one reading with no limits leaves the hourglass standing', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on, { poll: 'empty' })
  await start($)
  await measure($, EVENT)
  await measure($, { context: { tokens: 130_000, window: 200_000 }, rateLimits: [] })
  expect(await band($)).toContain('class="hourglass"')
  expect((await crab($, 'debug')).text).toContain('limits known from: kept')
})

test('limits the engine says have left take the hourglass away', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on, { poll: 'empty' })
  await start($)
  await measure($, EVENT)
  await measure($, { context: { tokens: 130_000, window: 200_000 }, rateLimits: [] }, ['context', 'rateLimits'])
  expect(await band($)).not.toContain('class="hourglass"')
})

test('limits that leave for a reading and come back raise the 80% sign once', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  const toasts = engine(on, { poll: 'empty' })
  await start($)
  // With signs off a mark is a toast, which the test can count.
  await crab($, 'signs off')
  const at82 = [{ ...PLAN[0], percentUsed: 82 }]
  await measure($, { ...EVENT, rateLimits: at82 })
  await measure($, { ...EVENT, rateLimits: [] })
  await measure($, { ...EVENT, rateLimits: at82 })
  expect(toasts.filter(t => t.startsWith('Usage limit at 82%'))).toHaveLength(1)
})

test('on API billing a cost that only the event carries fills the budget hourglass', { options: { budgetUsd: 10 } }, async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on, { poll: 'empty' })
  await start($)
  await measure($, { context: { tokens: 10_000, window: 200_000 }, rateLimits: [], cost: { usd: 4 } })
  expect((await crab($, 'stats')).text).toContain('spent $4.00 of $10')
})
