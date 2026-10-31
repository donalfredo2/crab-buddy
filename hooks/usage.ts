// The hourglass: how much of the usage limit (a subscription's five-hour window) or of the budget
// (API billing) is gone, and when it would run out at this pace. Pure, so it is easy to test.

import type { Usage } from '../types'

/** How far back the pace is read from. */
const PACE_MS = 30 * 60_000
const MAX_SAMPLES = 60
/** The marks a sign goes up at, once each per window. */
export const USAGE_MARKS = [80, 95] as const

type Limit = { kind: string; percentUsed: number; resetsAt?: string }

/**
 * The next reading from what the engine measured: the five-hour window on a subscription (else the
 * fullest), or the money spent against `budget` on API billing. Null when neither applies.
 * A new window (another reset time, or a drop) starts the samples and the signs afresh.
 */
export const nextUsage = (prev: Usage, limits: readonly Limit[], usd: number | undefined, budget: number, now: number): Usage => {
  const limit = limits.find(l => l.kind === 'five_hour') ?? [...limits].sort((a, b) => b.percentUsed - a.percentUsed)[0]
  let next: { kind: 'limit' | 'budget'; percent: number; resetsAt: number | null; usd?: number; budget?: number }
  if (limit) {
    const reset = limit.resetsAt ? Date.parse(limit.resetsAt) : NaN
    next = { kind: 'limit', percent: Math.max(0, limit.percentUsed), resetsAt: Number.isFinite(reset) ? reset : null }
  } else if (budget > 0 && typeof usd === 'number') {
    next = { kind: 'budget', percent: Math.max(0, (100 * usd) / budget), resetsAt: null, usd, budget }
  } else {
    return null
  }
  const isNewWindow = !prev || prev.kind !== next.kind || prev.resetsAt !== next.resetsAt || next.percent < prev.percent - 5
  const kept = isNewWindow ? [] : prev.samples.filter(([t]) => now - t <= PACE_MS)
  const last = kept[kept.length - 1]
  const samples: [number, number][] = last && last[1] === next.percent ? kept : [...kept, [now, next.percent]]
  return { ...next, samples: samples.slice(-MAX_SAMPLES), signed: isNewWindow || !prev ? 0 : prev.signed }
}

/**
 * When it would reach 100% at the pace of the last half hour, ms; null with too little to go on,
 * no rise, or a reset that comes first.
 */
export const usageForecast = (samples: readonly [number, number][], resetsAt: number | null, now: number): number | null => {
  const recent = samples.filter(([t]) => now - t <= PACE_MS)
  const first = recent[0]
  const last = recent[recent.length - 1]
  if (!first || !last || last[0] - first[0] < 5 * 60_000 || last[1] <= first[1]) return null
  if (last[1] >= 100) return last[0]
  const rate = (last[1] - first[1]) / (last[0] - first[0])
  const at = Math.round(last[0] + (100 - last[1]) / rate)
  if (resetsAt !== null && at >= resetsAt) return null
  return at - now > 24 * 3_600_000 ? null : at
}

/** The mark just passed and not yet signed in this window, or null. */
export const usageMark = (u: Usage): number | null => {
  if (!u) return null
  const passed = USAGE_MARKS.filter(m => u.percent >= m && m > u.signed)
  return passed.length ? (passed[passed.length - 1] ?? null) : null
}

/** A local clock time, 15:40. */
export const clockOf = (ms: number): string => {
  const d = new Date(ms)
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** A sign's words: "80% · full ~15:40 · resets 16:20", short enough for a plank. */
export const usageSign = (u: NonNullable<Usage>, now: number): string => {
  const full = usageForecast(u.samples, u.resetsAt, now)
  return [`${Math.floor(u.percent)}%`, full !== null ? `full ~${clockOf(full)}` : '', u.resetsAt !== null ? `resets ${clockOf(u.resetsAt)}` : ''].filter(Boolean).join(' · ')
}

/** /crab stats: "limit 62% (resets 16:20, full ~15:40 at this pace)" or "spent $3.10 of $10". */
export const usageStat = (u: NonNullable<Usage>, now: number): string => {
  const full = usageForecast(u.samples, u.resetsAt, now)
  const pace = full !== null ? `full ~${clockOf(full)} at this pace` : ''
  if (u.kind === 'budget') return `spent $${(u.usd ?? 0).toFixed(2)} of $${u.budget ?? 0}${pace ? ` (${pace})` : ''}`
  const notes = [u.resetsAt !== null ? `resets ${clockOf(u.resetsAt)}` : '', pace].filter(Boolean)
  return `limit ${Math.floor(u.percent)}%${notes.length ? ` (${notes.join(', ')})` : ''}`
}
