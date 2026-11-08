// What the session costs, in dollars and tokens: the pure parts. The wiring (stats, /crab cost, the signs) is
// tested through the real mod in assist.test.tsx.
import { expect, test } from 'claude-code/testing'

import { EMPTY_SPEND, addTurn, fmtCount, fmtUsd, markOf, measureSpend, nextMilestone, spendDetail, spendSign, spendStat } from './spend'
import type { TurnTokens } from './spend'

const T0 = new Date(2026, 10, 8, 12).getTime()
const turn = (o: Partial<TurnTokens> = {}): TurnTokens => ({ input_tokens: 100, output_tokens: 2_000, cache_read_input_tokens: 50_000, cache_creation_input_tokens: 5_000, model: 'model-a', ...o })

test('turns add up, the helpers apart from the main loop and each model on its own', () => {
  let s = addTurn(EMPTY_SPEND, turn(), false, T0)
  s = addTurn(s, turn(), false, T0 + 1000)
  s = addTurn(s, turn({ model: 'model-b', output_tokens: 500 }), true, T0 + 2000)
  expect(s.main).toEqual({ fresh: 200, out: 4_000, cacheRead: 100_000, cacheWrite: 10_000 })
  expect(s.helpers).toEqual({ fresh: 100, out: 500, cacheRead: 50_000, cacheWrite: 5_000 })
  expect(s.byModel['model-a']?.out).toBe(4_000)
  expect(s.byModel['model-b']?.out).toBe(500)
  // The first turn counted is where the tally starts.
  expect(s.since).toBe(T0)
})

test('nonsense counts add nothing', () => {
  const s = addTurn(EMPTY_SPEND, turn({ input_tokens: Number.NaN, output_tokens: -5 }), false, T0)
  expect(s.main.fresh).toBe(0)
  expect(s.main.out).toBe(0)
})

test('milestones: the highest passed, once, and every 100 past the last', () => {
  expect(nextMilestone(0.99, 0)).toBe(null)
  expect(nextMilestone(1, 0)).toBe(1)
  expect(nextMilestone(4.99, 1)).toBe(null)
  // A jump past several gives one sign, the highest.
  expect(nextMilestone(12, 0)).toBe(10)
  expect(nextMilestone(12, 10)).toBe(null)
  expect(nextMilestone(150, 50)).toBe(100)
  expect(nextMilestone(150, 100)).toBe(null)
  expect(nextMilestone(230, 100)).toBe(200)
  expect(markOf(Number.NaN)).toBe(0)
})

test('the first reading counts what was already spent as signed, so a resumed session holds up nothing for it', () => {
  const first = measureSpend(EMPTY_SPEND, [], 30)
  expect(first.usd).toBe(30)
  expect(first.signed).toBe(25)
  expect(nextMilestone(first.usd ?? 0, first.signed)).toBe(null)
  const later = measureSpend(first, [], 51)
  expect(nextMilestone(later.usd ?? 0, later.signed)).toBe(50)
})

test('a subscription makes the dollars an estimate for the rest of the session; a gateway spend limit does not', () => {
  expect(measureSpend(EMPTY_SPEND, [{ kind: 'spend_limit' }], 2).isEstimate).toBe(false)
  const sub = measureSpend(EMPTY_SPEND, [{ kind: 'five_hour' }], 2)
  expect(sub.isEstimate).toBe(true)
  // The limits can be missing from a reading; it stays an estimate.
  expect(measureSpend(sub, [], 3).isEstimate).toBe(true)
  // No cost reported: nothing changes.
  expect(measureSpend(sub, [{ kind: 'five_hour' }], undefined)).toBe(sub)
})

test('numbers read short', () => {
  expect(fmtUsd(0.4215)).toBe('$0.42')
  expect(fmtUsd(4.2)).toBe('$4.20')
  expect(fmtUsd(120.4)).toBe('$120')
  expect(fmtCount(950)).toBe('950')
  expect(fmtCount(38_400)).toBe('38k')
  expect(fmtCount(999_999)).toBe('1M')
  expect(fmtCount(2_140_000)).toBe('2.1M')
  expect(spendSign(5, false)).toBe('$5')
  expect(spendSign(5, true)).toBe('≈$5')
})

test('stats: dollars and tokens, cached apart; an estimate says so; a budget already said the dollars', () => {
  const s = { ...addTurn(EMPTY_SPEND, turn(), false, T0), usd: 4.2 }
  expect(spendStat(s, false)).toBe('cost $4.20 · 2k out, 5k in, 50k cached')
  expect(spendStat({ ...s, isEstimate: true }, false)).toBe('≈ $4.20 at API prices · 2k out, 5k in, 50k cached')
  expect(spendStat(s, true)).toBe('2k out, 5k in, 50k cached')
  expect(spendStat(EMPTY_SPEND, false)).toBe('')
})

test('/crab cost: the total, the split, the helpers, the models, and a late start', () => {
  let s = addTurn(EMPTY_SPEND, turn(), false, T0 + 10 * 60_000)
  s = { ...addTurn(s, turn({ model: 'model-b' }), true, T0 + 11 * 60_000), usd: 1.5 }
  const text = spendDetail(s, T0, false)
  expect(text).toContain("This session: $1.50, Claude Code's own total")
  expect(text).toContain('Tokens: 4k out, 200 in, 10k written to the cache, 100k read from it.')
  expect(text).toContain('helpers (subagents): 2k out, 5k in, 50k cached')
  expect(text).toContain('model-a: ')
  expect(text).toContain('model-b: ')
  expect(text).toMatch(/Tokens counted since \d+:\d\d/)
  expect(text).toContain('(/crab cost on|off)')
  const sub = spendDetail({ ...s, isEstimate: true }, T0 + 10 * 60_000, true)
  expect(sub).toContain('≈ $1.50 at API prices. Your subscription covers it')
  expect(sub).not.toContain('counted since')
  expect(sub).toContain(': off (')
  expect(spendDetail(EMPTY_SPEND, T0, false)).toContain('No cost reported yet')
})
