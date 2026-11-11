// The prompt cache as a campfire: the pure parts. The wiring (the fire on the beach, the cooling sign,
// /crab cache) is tested through the real mod in assist.test.tsx.
import { expect, test } from 'claude-code/testing'

import type { Cache } from '../types'
import { ASHES_MS, NUDGE_TOKENS, TTL_1H, TTL_5M, cacheDetail, cacheStat, familyOf, fireOf, inWords, nextChangeAt, rewriteText, rewriteUsd, shouldNudge, ttlOf } from './cache'

const MIN = 60_000
const T0 = new Date(2026, 10, 11, 12).getTime()
const warm = (o: Partial<NonNullable<Cache>> = {}): NonNullable<Cache> => ({ at: T0, ttlMs: TTL_5M, why: 'api', tokens: 150_000, model: 'claude-opus-5-5', nudged: false, fire: 'blaze', ...o })
/** Dollars to whole thousandths of a cent, so float noise doesn't count. */
const cents = (usd: number | null): number | null => (usd === null ? null : Math.round(usd * 100_000))
const PLAN = [{ kind: 'five_hour', percentUsed: 40 }, { kind: 'seven_day', percentUsed: 20 }]

test("the lifetime follows Claude Code's own rule, env first, then the setting, then the plan", () => {
  expect(ttlOf({ limits: [] })).toEqual({ ms: TTL_5M, why: 'api' })
  expect(ttlOf({ limits: PLAN })).toEqual({ ms: TTL_1H, why: 'subscription' })
  // Past a limit a subscription gets five minutes; a gateway's spend limit is no subscription.
  expect(ttlOf({ limits: [{ kind: 'five_hour', percentUsed: 100 }] })).toEqual({ ms: TTL_5M, why: 'overage' })
  expect(ttlOf({ limits: [{ kind: 'spend_limit', percentUsed: 10 }] })).toEqual({ ms: TTL_5M, why: 'api' })
  expect(ttlOf({ setting: '1h', limits: [] })).toEqual({ ms: TTL_1H, why: 'setting' })
  expect(ttlOf({ env: '5m', setting: '1h', limits: PLAN })).toEqual({ ms: TTL_5M, why: 'env' })
  expect(ttlOf({ force5m: '1', env: '1h', limits: PLAN })).toEqual({ ms: TTL_5M, why: 'env' })
  expect(ttlOf({ enable1h: 'true', limits: [] })).toEqual({ ms: TTL_1H, why: 'env' })
  // Nonsense is ignored, whatever reads it back.
  expect(ttlOf({ setting: { promptCacheTtl: '1h' }, env: '2h', force5m: 'false', enable1h: '0', limits: [] })).toEqual({ ms: TTL_5M, why: 'api' })
})

test('the fire blazes, burns down, glows, goes out and is gone', () => {
  const c = warm()
  expect(fireOf(null, T0)).toBe(null)
  expect(fireOf(c, T0)).toBe('blaze')
  expect(fireOf(c, T0 + 2 * MIN)).toBe('blaze')
  expect(fireOf(c, T0 + 3 * MIN)).toBe('fire')
  expect(fireOf(c, T0 + 4.5 * MIN)).toBe('embers')
  expect(fireOf(c, T0 + 5 * MIN)).toBe('ashes')
  expect(fireOf(c, T0 + 5 * MIN + ASHES_MS - 1)).toBe('ashes')
  expect(fireOf(c, T0 + 5 * MIN + ASHES_MS)).toBe(null)
  // The hour's fire takes its time.
  expect(fireOf(warm({ ttlMs: TTL_1H }), T0 + 20 * MIN)).toBe('blaze')
  expect(fireOf(warm({ ttlMs: TTL_1H }), T0 + 55 * MIN)).toBe('embers')
})

test('a nudge once per pause, only with enough context, not while Claude works, and only before it goes cold', () => {
  const c = warm()
  expect(shouldNudge(c, T0 + 3 * MIN, false)).toBe(false)
  expect(shouldNudge(c, T0 + 4 * MIN, false)).toBe(true)
  expect(shouldNudge(c, T0 + 4 * MIN, true)).toBe(false)
  expect(shouldNudge({ ...c, nudged: true }, T0 + 4 * MIN, false)).toBe(false)
  expect(shouldNudge({ ...c, tokens: NUDGE_TOKENS - 1 }, T0 + 4 * MIN, false)).toBe(false)
  expect(shouldNudge(c, T0 + 5 * MIN, false)).toBe(false)
  // Ten minutes ahead for the hour's cache, before Claude Code's own idle compaction at about 54.
  expect(shouldNudge(warm({ ttlMs: TTL_1H }), T0 + 49 * MIN, false)).toBe(false)
  expect(shouldNudge(warm({ ttlMs: TTL_1H }), T0 + 50 * MIN, false)).toBe(true)
})

test('the next change is the next stage, the nudge, cold, or the ashes going; then nothing', () => {
  const c = warm()
  expect(nextChangeAt(c, T0)).toBe(T0 + 2.5 * MIN)
  expect(nextChangeAt(c, T0 + 2.5 * MIN)).toBe(T0 + 4 * MIN)
  expect(nextChangeAt(c, T0 + 4 * MIN)).toBe(T0 + 5 * MIN)
  expect(nextChangeAt(c, T0 + 5 * MIN)).toBe(T0 + 5 * MIN + ASHES_MS)
  expect(nextChangeAt(c, T0 + 5 * MIN + ASHES_MS)).toBe(null)
  expect(nextChangeAt(null, T0)).toBe(null)
})

test('models are read by family, wherever they are served and however they are suffixed', () => {
  expect(familyOf('claude-opus-5-5')).toBe('opus-5.5')
  expect(familyOf('us.anthropic.claude-opus-5-5[1m]')).toBe('opus-5.5')
  expect(familyOf('claude-opus-5')).toBe('opus-5')
  expect(familyOf('claude-opus-4-5-20251101')).toBe('opus-4.5')
  expect(familyOf('claude-sonnet-4-20250514')).toBe('sonnet-4')
  expect(familyOf('claude-fable-5-2')).toBe('fable-5.2')
  expect(familyOf('gpt-something')).toBe(null)
})

test('a cold restart costs 1.25 times input for the five-minute cache, twice for the hour; unknown models get tokens only', () => {
  // 150k on Opus 5.5 at $4: $0.60 of input, $0.75 written for five minutes, $1.20 for an hour.
  expect(cents(rewriteUsd(150_000, 'claude-opus-5-5', TTL_5M))).toBe(cents(0.75))
  expect(cents(rewriteUsd(150_000, 'claude-opus-5-5', TTL_1H))).toBe(cents(1.2))
  // Haiku 5.5 costs more past 100k.
  expect(cents(rewriteUsd(80_000, 'claude-haiku-5-5', TTL_5M))).toBe(cents(0.01))
  expect(cents(rewriteUsd(200_000, 'claude-haiku-5-5', TTL_5M))).toBe(cents(0.125))
  expect(rewriteUsd(150_000, 'some-other-model', TTL_5M)).toBe(null)
  expect(rewriteUsd(0, 'claude-opus-5-5', TTL_5M)).toBe(null)
  expect(rewriteText(warm(), false)).toBe('~150k tokens (≈ $0.75)')
  expect(rewriteText(warm(), true)).toBe('~150k tokens (≈ $0.75 at API prices)')
  expect(rewriteText(warm({ model: '' }), false)).toBe('~150k tokens')
})

test('the words: a plank, the stats and the detail', () => {
  expect(inWords(60_000)).toBe('in 1 min')
  expect(inWords(10 * MIN)).toBe('in 10 min')
  expect(inWords(5_000)).toBe('in 1 min')
  expect(cacheStat(null, T0)).toBe('')
  expect(cacheStat(warm(), T0 + 2 * MIN)).toBe('cache warm ~3 min')
  expect(cacheStat(warm(), T0 + 6 * MIN)).toMatch(/^cache cold since \d+:05$/)
  expect(cacheStat(warm({ isCompacted: true }), T0)).toBe('cache fresh after a compaction')
  expect(cacheDetail(null, T0, false, false)).toContain('No prompt cache yet')
  const now = cacheDetail(warm(), T0 + MIN, false, false)
  expect(now).toContain('likely warm for ~4 more min')
  expect(now).toContain('A five-minute cache: API billing')
  expect(now).toContain('~150k tokens (≈ $0.75)')
  expect(now).toContain('(/crab cache on|off)')
  expect(cacheDetail(warm({ ttlMs: TTL_1H, why: 'subscription' }), T0, true, true)).toContain('A one-hour cache: a subscription')
  expect(cacheDetail(warm(), T0, false, true)).toContain(': off (/crab cache on|off)')
  expect(cacheDetail(warm(), T0 + 6 * MIN, false, false)).toContain('likely cold since')
})

test('every cooling sign fits on a plank', () => {
  for (const words of [`cache cools ${inWords(10 * MIN)}`, `fire out ${inWords(10 * MIN)}`]) expect(words.length).toBeLessThanOrEqual(22)
})
