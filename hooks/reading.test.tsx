// One reading from the event, the poll and what was last seen: the pure merge. The wiring is tested
// through the real mod.
import { expect, test } from 'claude-code/testing'

import { LIMIT_KEEP_MS, keepLimits, mergeReading, stillKept } from './reading'
import type { Limit } from './reading'

const NOW = new Date(2026, 10, 26, 12).getTime()
const five = (percentUsed: number, inMin = 60): Limit => ({ kind: 'five_hour', percentUsed, resetsAt: new Date(NOW + inMin * 60_000).toISOString() })

test('the event wins, the poll fills gaps, the kept limits come last', () => {
  expect(mergeReading({ context: { tokens: 50_000, window: 200_000 }, rateLimits: [five(20)], cost: { usd: 1 } }, null, null, NOW))
    .toMatchObject({ tokens: 50_000, tokensFrom: 'event', window: 200_000, limitsFrom: 'event', usd: 1 })
  expect(mergeReading({ context: { window: 200_000 }, rateLimits: [] }, { context: { tokens: 40_000, window: 200_000 }, rateLimits: [five(30)], cost: { usd: 2 } }, null, NOW))
    .toMatchObject({ tokens: 40_000, tokensFrom: 'poll', limitsFrom: 'poll', usd: 2 })
  expect(mergeReading(undefined, { context: { window: 200_000 }, rateLimits: [] }, { limits: [five(40)], at: NOW - 60_000 }, NOW))
    .toMatchObject({ tokens: null, tokensFrom: 'none', limitsFrom: 'kept', limits: [five(40)] })
  expect(mergeReading(undefined, null, null, NOW)).toMatchObject({ tokens: null, window: null, limits: [], limitsFrom: 'none', usd: undefined })
})
test('a kept window goes once its reset has passed, or after five hours with no reset time', () => {
  expect(stillKept({ limits: [five(40, -1)], at: NOW - 3_600_000 }, NOW)).toBe(null)
  expect(stillKept({ limits: [five(40, -1), { ...five(10, 90), kind: 'seven_day' }], at: NOW }, NOW)?.limits.map(l => l.kind)).toEqual(['seven_day'])
  expect(stillKept({ limits: [{ kind: 'five_hour', percentUsed: 40 }], at: NOW - LIMIT_KEEP_MS + 1 }, NOW)).not.toBe(null)
  expect(stillKept({ limits: [{ kind: 'five_hour', percentUsed: 40 }], at: NOW - LIMIT_KEEP_MS }, NOW)).toBe(null)
})
test('a size that is not a finite number of zero or more is no size', () => {
  for (const tokens of [NaN, -1, Infinity, '5' as never]) expect(mergeReading({ context: { tokens } }, null, null, NOW).tokens).toBe(null)
})
test('what is kept is the newest list seen, never an empty one', () => {
  const r = mergeReading({ rateLimits: [five(50)] }, null, { limits: [five(40)], at: NOW - 1000 }, NOW)
  expect(keepLimits({ limits: [five(40)], at: NOW - 1000 }, r, NOW)).toEqual({ limits: [five(50)], at: NOW })
  const empty = mergeReading({ rateLimits: [] }, { rateLimits: [] }, { limits: [five(40)], at: NOW - 1000 }, NOW)
  expect(keepLimits({ limits: [five(40)], at: NOW - 1000 }, empty, NOW)).toEqual({ limits: [five(40)], at: NOW - 1000 })
})
test('an empty list the engine names as changed means the windows left', () => {
  const kept = { limits: [five(40)], at: NOW - 1000 }
  const left = mergeReading({ rateLimits: [], changed: ['rateLimits'] }, { rateLimits: [] }, kept, NOW)
  expect(left).toMatchObject({ limits: [], limitsFrom: 'none', hasLeft: true })
  expect(mergeReading({ rateLimits: [], changed: ['rateLimits'] }, null, kept, NOW)).toMatchObject({ limitsFrom: 'none', hasLeft: true })
  expect(mergeReading({ rateLimits: [], changed: ['rateLimits'] }, { rateLimits: [five(40)] }, kept, NOW)).toMatchObject({ limitsFrom: 'poll', hasLeft: false })
  expect(keepLimits(kept, left, NOW)).toBe(null)
  expect(mergeReading({ rateLimits: [], changed: ['context'] }, null, kept, NOW)).toMatchObject({ limitsFrom: 'kept', hasLeft: false })
})
