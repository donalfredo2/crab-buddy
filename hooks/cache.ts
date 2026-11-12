// The prompt cache as a campfire. Claude Code caches the conversation's prompt after each request, for five
// minutes or an hour; a request after that writes the whole conversation to the cache again, at 1.25 or 2 times
// the input price instead of a cheap read. The fire burns down over that time and goes out when it's likely cold.
// Pure, so it is easy to test.

import type { Cache, Fire, TtlWhy } from '../types'
import { fmtCount, fmtUsd } from './spend'
import { clockOf } from './usage'

export const TTL_5M = 5 * 60_000
export const TTL_1H = 60 * 60_000
/** Under this much context a cold cache costs little, so the crab doesn't nudge. */
export const NUDGE_TOKENS = 50_000
/** How long the cold fire's ashes stay on the beach. */
export const ASHES_MS = 15 * 60_000

type Limit = { kind: string; percentUsed: number }

/** A switch in the environment: set to anything but empty, 0 or false. */
const isOn = (v: unknown): boolean => typeof v === 'string' && v !== '' && v !== '0' && v.toLowerCase() !== 'false'
const ttlWord = (v: unknown): number | null => (v === '5m' ? TTL_5M : v === '1h' ? TTL_1H : null)

/**
 * The main conversation's cache lifetime, by Claude Code's own rule: FORCE_PROMPT_CACHING_5M, then
 * CLAUDE_CODE_PROMPT_CACHE_TTL, then the promptCacheTtl setting, then ENABLE_PROMPT_CACHING_1H; unset, an hour
 * on a subscription within its usage limits and five minutes on an API key, Bedrock, Vertex or Foundry, or past
 * the limit. A subscription shows as limit windows other than a gateway's spend limit.
 */
export const ttlOf = (i: { force5m?: unknown; env?: unknown; setting?: unknown; enable1h?: unknown; limits: readonly Limit[] }): { ms: number; why: TtlWhy } => {
  if (isOn(i.force5m)) return { ms: TTL_5M, why: 'env' }
  const fromEnv = ttlWord(i.env)
  if (fromEnv !== null) return { ms: fromEnv, why: 'env' }
  const fromSetting = ttlWord(i.setting)
  if (fromSetting !== null) return { ms: fromSetting, why: 'setting' }
  if (isOn(i.enable1h)) return { ms: TTL_1H, why: 'env' }
  const plan = i.limits.filter(l => l.kind !== 'spend_limit')
  if (!plan.length) return { ms: TTL_5M, why: 'api' }
  return plan.every(l => l.percentUsed < 100) ? { ms: TTL_1H, why: 'subscription' } : { ms: TTL_5M, why: 'overage' }
}

/** When it likely goes cold, ms since the epoch. */
export const coldAt = (c: NonNullable<Cache>): number => c.at + c.ttlMs

/**
 * The fire for this moment: blazing over the first half, burning down to a fifth, embers to the end,
 * then cold ashes for a while, then nothing. Null with no cache yet.
 */
export const fireOf = (c: Cache, now: number): Fire | null => {
  if (!c) return null
  const left = coldAt(c) - now
  if (left > c.ttlMs * 0.5) return 'blaze'
  if (left > c.ttlMs * 0.2) return 'fire'
  if (left > 0) return 'embers'
  return left > -ASHES_MS ? 'ashes' : null
}

/** How long before it goes cold the crab says so: a minute for the five-minute cache, ten for the hour's. */
export const leadMs = (ttlMs: number): number => (ttlMs <= TTL_5M ? 60_000 : 10 * 60_000)

/** When the nudge would come. */
export const nudgeAt = (c: NonNullable<Cache>): number => coldAt(c) - leadMs(c.ttlMs)

/**
 * Time to say it's cooling: once per pause, only with enough context to matter, and not while Claude works
 * (it keeps the cache warm), unless it's waiting for you, when the cache cools unseen.
 */
export const shouldNudge = (c: Cache, now: number, isWorking: boolean): boolean =>
  !!c && !c.nudged && !c.isCompacted && c.tokens >= NUDGE_TOKENS && !isWorking && now >= nudgeAt(c) && now < coldAt(c)

/** The next moment the picture or the nudge can change, or null when nothing more will. */
export const nextChangeAt = (c: Cache, now: number): number | null => {
  if (!c) return null
  const end = coldAt(c)
  const marks = [end - c.ttlMs * 0.5, end - c.ttlMs * 0.2, nudgeAt(c), end, end + ASHES_MS]
  const next = marks.filter(t => t > now).sort((a, b) => a - b)[0]
  return next ?? null
}

// First-party list prices for input tokens, USD per million (Claude API docs, as of 2026-11-03). Bedrock and
// Vertex price on their own. A model not listed gets tokens only, never a guess.
const INPUT_USD: Record<string, number> = {
  'fable-5.2': 8, 'mythos-5.2': 8, 'fable-5.1': 10, 'mythos-5.1': 10, 'fable-5': 10, 'mythos-5': 10,
  'opus-5.5': 4, 'opus-5': 5, 'opus-4.8': 5, 'opus-4.7': 5, 'opus-4.6': 5,
  'sonnet-5.5': 2, 'sonnet-5': 2, 'sonnet-4.6': 3,
  'haiku-4.5': 1,
}

/** "claude-opus-5-5", "us.anthropic.claude-opus-5-5[1m]" or "claude-opus-4-5-20251101" to "opus-5.5" and the like. */
export const familyOf = (model: string): string | null => {
  const m = /claude-(fable|mythos|opus|sonnet|haiku)-(\d)(?:-(\d{1,2}))?(?!\d)/.exec(model.toLowerCase())
  if (!m) return null
  return `${m[1]}-${m[2]}${m[3] ? `.${m[3]}` : ''}`
}

/** Input price per million for a prompt this size; Haiku 5.5 costs more past 100k. */
const inputUsd = (model: string, tokens: number): number | null => {
  const family = familyOf(model)
  if (family === 'haiku-5.5') return tokens > 100_000 ? 0.5 : 0.1
  return family ? (INPUT_USD[family] ?? null) : null
}

/** What writing `tokens` to the cache again costs at list prices: 1.25 times input for five minutes, 2 for an hour. */
export const rewriteUsd = (tokens: number, model: string, ttlMs: number): number | null => {
  const price = inputUsd(model, tokens)
  if (price === null || !(tokens > 0)) return null
  return (tokens / 1_000_000) * price * (ttlMs >= TTL_1H ? 2 : 1.25)
}

/** "~150k tokens (≈ $0.75)" or, on a subscription, "~150k tokens (≈ $0.75 at API prices)". */
export const rewriteText = (c: NonNullable<Cache>, isEstimate: boolean): string => {
  const usd = rewriteUsd(c.tokens, c.model, c.ttlMs)
  return `~${fmtCount(c.tokens)} tokens${usd === null ? '' : ` (≈ ${fmtUsd(usd)}${isEstimate ? ' at API prices' : ''})`}`
}

/** "in 1 min", "in 10 min": short enough for a plank. */
export const inWords = (ms: number): string => `in ${Math.max(1, Math.round(ms / 60_000))} min`

/** /crab stats: "cache warm ~3 min" or "cache cold since 15:40"; empty with no cache yet. */
export const cacheStat = (c: Cache, now: number): string => {
  if (!c) return ''
  const left = coldAt(c) - now
  if (c.isCompacted) return 'cache fresh after a compaction'
  return left > 0 ? `cache warm ~${Math.max(1, Math.round(left / 60_000))} min` : `cache cold since ${clockOf(coldAt(c))}`
}

const WHY: Record<TtlWhy, string> = {
  env: 'set by an environment variable (CLAUDE_CODE_PROMPT_CACHE_TTL and kin)',
  setting: 'set by promptCacheTtl in your Claude Code settings',
  subscription: 'a subscription within its usage limits gets an hour',
  overage: 'past a usage limit a subscription gets five minutes',
  api: 'API billing (a key, Bedrock, Vertex or Foundry) gets five minutes',
}

/** /crab cache: warm or cold, for how long and why, what letting it go cold costs, and how sure that is. */
export const cacheDetail = (c: Cache, now: number, isEstimate: boolean, isOff: boolean): string => {
  const lines: string[] = []
  if (!c) {
    lines.push('No prompt cache yet: it starts with the first reply.')
  } else {
    const left = coldAt(c) - now
    const life = c.ttlMs >= TTL_1H ? 'one-hour' : 'five-minute'
    if (c.isCompacted) lines.push('The conversation was just compacted: the next prompt writes the shorter conversation to the cache anew.')
    else if (left > 0) lines.push(`Prompt cache: likely warm for ~${Math.max(1, Math.round(left / 60_000))} more min (until ${clockOf(coldAt(c))}).`)
    else lines.push(`Prompt cache: likely cold since ${clockOf(coldAt(c))}.`)
    lines.push(`A ${life} cache: ${WHY[c.why]}.`)
    if (!c.isCompacted && c.tokens > 0) {
      lines.push(left > 0
        ? `Gone cold, the next prompt writes ${rewriteText(c, isEstimate)} to the cache again; warm, it reads them for a fraction of that.`
        : `The next prompt writes ${rewriteText(c, isEstimate)} to the cache again.`)
    }
    lines.push("Counted from Claude's last reply. The cache really counts from when that request started, and Claude Code sometimes keeps it warm on its own, so take the minutes as a guide.")
  }
  lines.push(`The fire and its sign: ${isOff ? 'off' : 'on'} (/crab cache on|off).`)
  return lines.join('\n')
}

// A fire kept across a restart of Claude Code, by project folder. The conversation it belongs to is told by its
// size: a session that comes back with nearly the same context is the same conversation, whose cache may still
// be warm; a new one in that folder starts far smaller and gets no fire until its first reply.
export type KeptFire = { at: number; ttlMs: number; why: TtlWhy; tokens: number; model: string }
export type KeptFires = Record<string, KeptFire>
/** How close the context must be, as a share of it, to count as the same conversation. */
export const SAME_SHARE = 0.03
/** The most folders kept: the newest win. */
export const KEPT_MAX = 12

const isWhy = (v: unknown): v is TtlWhy => v === 'env' || v === 'setting' || v === 'subscription' || v === 'overage' || v === 'api'
const isKept = (v: unknown): v is KeptFire => {
  if (!v || typeof v !== 'object') return false
  const k = v as Record<string, unknown>
  return typeof k.at === 'number' && typeof k.ttlMs === 'number' && k.ttlMs > 0 && isWhy(k.why) && typeof k.tokens === 'number' && typeof k.model === 'string'
}

/** What the store holds, made safe and without fires that are gone, newest first and at most KEPT_MAX. */
export const keptFires = (stored: unknown, now: number): KeptFires => {
  if (!stored || typeof stored !== 'object') return {}
  const live = Object.entries(stored as Record<string, unknown>)
    .filter((e): e is [string, KeptFire] => isKept(e[1]) && now < e[1].at + e[1].ttlMs + ASHES_MS)
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, KEPT_MAX)
  return Object.fromEntries(live)
}

/** The kept fires with this folder's set (or removed, with null). */
export const keepFire = (stored: unknown, folder: string, c: Cache, now: number): KeptFires => {
  const rest = keptFires(stored, now)
  delete rest[folder]
  if (!c) return rest
  return keptFires({ [folder]: { at: c.at, ttlMs: c.ttlMs, why: c.why, tokens: c.tokens, model: c.model }, ...rest }, now)
}

/** The fire to light again for this folder and context, or null: none kept, gone, or another conversation. */
export const relit = (stored: unknown, folder: string, tokens: number | null, now: number): NonNullable<Cache> | null => {
  const k = keptFires(stored, now)[folder]
  if (!k || tokens === null || k.tokens <= 0) return null
  if (Math.abs(tokens - k.tokens) > Math.max(2_000, k.tokens * SAME_SHARE)) return null
  const c: NonNullable<Cache> = { ...k, nudged: now >= nudgeAt({ ...k, nudged: false, fire: null }), fire: null }
  return { ...c, fire: fireOf(c, now) }
}
