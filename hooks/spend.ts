// What the session costs: Claude Code's own dollar total, and the tokens the crab counts turn by turn
// (the main conversation and its subagents). Pure, so it is easy to test.

import type { Spend, Tokens } from '../types'
import { clockOf } from './usage'

/** A turn's counts as the engine reports them (TurnUsage). */
export type TurnTokens = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
  model: string
}

/** The dollar marks a sign goes up at, once each per session; past the last, every 100. */
export const SPEND_MARKS = [1, 5, 10, 25, 50, 100] as const

export const NO_TOKENS: Tokens = { fresh: 0, out: 0, cacheRead: 0, cacheWrite: 0 }
export const EMPTY_SPEND: Spend = { usd: null, isEstimate: false, main: NO_TOKENS, helpers: NO_TOKENS, byModel: {}, since: 0, signed: 0 }

const n = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : 0)

const plus = (a: Tokens, u: TurnTokens): Tokens => ({
  fresh: a.fresh + n(u.input_tokens),
  out: a.out + n(u.output_tokens),
  cacheRead: a.cacheRead + n(u.cache_read_input_tokens),
  cacheWrite: a.cacheWrite + n(u.cache_creation_input_tokens),
})

const sum = (a: Tokens, b: Tokens): Tokens => ({ fresh: a.fresh + b.fresh, out: a.out + b.out, cacheRead: a.cacheRead + b.cacheRead, cacheWrite: a.cacheWrite + b.cacheWrite })

const isEmpty = (t: Tokens): boolean => t.fresh + t.out + t.cacheRead + t.cacheWrite === 0

/** One turn's tokens added to the tally: the main loop's or a helper's, and its model's. The first sets `since`. */
export const addTurn = (prev: Spend, u: TurnTokens, isHelper: boolean, now: number): Spend => {
  const model = (u.model || 'unknown').slice(0, 60)
  return {
    ...prev,
    main: isHelper ? prev.main : plus(prev.main, u),
    helpers: isHelper ? plus(prev.helpers, u) : prev.helpers,
    byModel: { ...prev.byModel, [model]: plus(prev.byModel[model] ?? NO_TOKENS, u) },
    since: prev.since || now,
  }
}

/** The highest mark at or under `usd`: 0 under $1. */
export const markOf = (usd: number): number => {
  if (!(usd >= 1)) return 0
  if (usd >= 200) return Math.floor(usd / 100) * 100
  return [...SPEND_MARKS].reverse().find(m => usd >= m) ?? 0
}

/** The mark just passed and not yet signed this session, or null. Several passed at once give one sign, the highest. */
export const nextMilestone = (usd: number, signed: number): number | null => {
  const mark = markOf(usd)
  return mark > signed ? mark : null
}

/**
 * The next state from what the engine measured. A subscription's dollars are an estimate at API prices;
 * a gateway's spend limit is real money. Once an estimate, it stays one for the session, since the limits
 * only come with the first reply. The first reading marks what is already spent as signed, so a resumed
 * session, a reload or a fresh install mid-session holds up nothing for money spent before.
 */
export const measureSpend = (prev: Spend, limits: readonly { kind: string }[], usd: number | undefined): Spend => {
  const isEstimate = prev.isEstimate || limits.some(l => l.kind !== 'spend_limit')
  if (typeof usd !== 'number' || !Number.isFinite(usd)) return isEstimate === prev.isEstimate ? prev : { ...prev, isEstimate }
  return { ...prev, isEstimate, usd, signed: prev.usd === null ? Math.max(prev.signed, markOf(usd)) : prev.signed }
}

/** $0.42, $4.20, $120. */
export const fmtUsd = (usd: number): string => (usd >= 100 ? `$${Math.round(usd)}` : `$${usd.toFixed(2)}`)

/** A token count: 950, 38k, 2.1M. */
export const fmtCount = (x: number): string =>
  x < 1000 ? String(Math.round(x)) : x < 999_500 ? `${Math.round(x / 1000)}k` : `${(x / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`

/** "38k out, 120k in, 2.1M cached": new prompt tokens (cache writes too) apart from the cheap cache reads. */
export const tokensLine = (t: Tokens): string => `${fmtCount(t.out)} out, ${fmtCount(t.fresh + t.cacheWrite)} in, ${fmtCount(t.cacheRead)} cached`

/** The plank's words: "$5" or, at API prices on a subscription, "≈$5". */
export const spendSign = (mark: number, isEstimate: boolean): string => `${isEstimate ? '≈' : ''}$${mark}`

/** The dollars in a phrase: "$4.20" or "≈ $4.20 at API prices". */
const dollars = (usd: number, isEstimate: boolean): string => (isEstimate ? `≈ ${fmtUsd(usd)} at API prices` : fmtUsd(usd))

/**
 * /crab stats: "cost $4.20 · 38k out, 120k in, 2.1M cached". With a budget hourglass the stats already say
 * what was spent, so only the tokens. Empty when there is nothing to say.
 */
export const spendStat = (s: Spend, hasBudgetStat: boolean): string => {
  const total = sum(s.main, s.helpers)
  const parts = [s.usd !== null && !hasBudgetStat ? (s.isEstimate ? dollars(s.usd, true) : `cost ${fmtUsd(s.usd)}`) : '', isEmpty(total) ? '' : tokensLine(total)]
  return parts.filter(Boolean).join(' · ')
}

/** /crab cost: the total, the tokens, the helpers' share, each model, and what the figures do and don't count. */
export const spendDetail = (s: Spend, startedAt: number, isSignsOff: boolean): string => {
  const total = sum(s.main, s.helpers)
  const lines: string[] = []
  if (s.usd === null) lines.push('No cost reported yet: it comes with the first reply.')
  else if (s.isEstimate) lines.push(`This session: ${dollars(s.usd, true)}. Your subscription covers it; that's what it would cost on the API.`)
  else lines.push(`This session: ${fmtUsd(s.usd)}, Claude Code's own total, as /cost shows it.`)
  if (isEmpty(total)) {
    lines.push('No tokens counted yet.')
  } else {
    lines.push(`Tokens: ${fmtCount(total.out)} out, ${fmtCount(total.fresh)} in, ${fmtCount(total.cacheWrite)} written to the cache, ${fmtCount(total.cacheRead)} read from it.`)
    if (!isEmpty(s.helpers)) lines.push(`Of those, helpers (subagents): ${tokensLine(s.helpers)}.`)
    const models = Object.entries(s.byModel).sort(([, a], [, b]) => b.out + b.fresh - (a.out + a.fresh))
    if (models.length > 1) for (const [model, t] of models) lines.push(`  ${model}: ${tokensLine(t)}`)
    else if (models[0]) lines.push(`Model: ${models[0][0]}.`)
    if (s.since && startedAt && s.since - startedAt > 60_000) lines.push(`Tokens counted since ${clockOf(s.since)}; the dollars cover the whole session.`)
    lines.push("Tokens count the model's turns; the dollars also cover side calls, like a compaction's summary.")
  }
  lines.push(`Signs at $1, $5, $10, $25, $50, $100: ${isSignsOff ? 'off' : 'on'} (/crab cost on|off).`)
  return lines.join('\n')
}
