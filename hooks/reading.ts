// One reading of the figures the signals draw from. They reach the plugin from three places: the
// engine's `session.measure` event, the `$.session.usage()` poll, and the limit windows seen earlier.
// This merges them, pure, so the sea, the hourglass and the campfire all read the same thing.

export type Limit = { kind: string; percentUsed: number; resetsAt?: string }
export type Figures = { context?: { tokens?: number; window?: number }; rateLimits?: readonly Limit[]; cost?: { usd?: number }; changed?: readonly string[] }
export type KeptLimits = { limits: readonly Limit[]; at: number } | null
export type Source = 'event' | 'poll' | 'kept' | 'none'
export type Reading = {
  tokens: number | null; tokensFrom: 'event' | 'poll' | 'none'
  window: number | null
  limits: readonly Limit[]; limitsFrom: Source
  /** The event named `rateLimits` as changed and carried none, and the poll has none either: the windows left. Nothing kept is used, and nothing stays kept. A poll that still has windows wins (limitsFrom 'poll', hasLeft false). */
  hasLeft: boolean
  usd: number | undefined
}

/** How long a window with no reset time is kept after it was seen. */
export const LIMIT_KEEP_MS = 5 * 3_600_000

const isSize = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0
const isWindow = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0
const listOf = (f: Figures | null | undefined): readonly Limit[] => (Array.isArray(f?.rateLimits) ? f.rateLimits : [])

/** The kept windows still running at `now`; null when none is. */
export const stillKept = (kept: KeptLimits, now: number): KeptLimits => {
  if (!kept) return null
  const limits = kept.limits.filter(l => {
    const reset = l.resetsAt ? Date.parse(l.resetsAt) : NaN
    return Number.isFinite(reset) ? reset > now : now - kept.at < LIMIT_KEEP_MS
  })
  return limits.length ? { limits, at: kept.at } : null
}

/** What to keep after this reading: null when `r.hasLeft`, else the newest non-empty list, else what `stillKept` leaves. */
export const keepLimits = (kept: KeptLimits, r: Reading, now: number): KeptLimits => {
  if (r.hasLeft) return null
  if (r.limitsFrom === 'event' || r.limitsFrom === 'poll') return { limits: r.limits, at: now }
  return stillKept(kept, now)
}

/**
 * One reading from the event (it wins), the poll (it fills what the event lacks) and the windows kept
 * from earlier (last, and only while they still run). `window` follows `tokens`: the event's only
 * when the event also has a size.
 */
export const mergeReading = (sent: Figures | undefined, polled: Figures | null, kept: KeptLimits, now: number): Reading => {
  const eventTokens = sent?.context?.tokens
  const pollTokens = polled?.context?.tokens
  const tokens = isSize(eventTokens) ? eventTokens : isSize(pollTokens) ? pollTokens : null
  const tokensFrom = isSize(eventTokens) ? 'event' : isSize(pollTokens) ? 'poll' : 'none'
  const eventWindow = isSize(eventTokens) && isWindow(sent?.context?.window) ? sent.context.window : null
  const pollWindow = isWindow(polled?.context?.window) ? polled.context.window : null
  const window = eventWindow ?? pollWindow

  const fromEvent = listOf(sent)
  const fromPoll = listOf(polled)
  const hasLeft = !fromEvent.length && !fromPoll.length && Array.isArray(sent?.rateLimits) && !!sent.changed?.includes('rateLimits')
  let limits: readonly Limit[] = []
  let limitsFrom: Source = 'none'
  if (fromEvent.length) [limits, limitsFrom] = [fromEvent, 'event']
  else if (fromPoll.length) [limits, limitsFrom] = [fromPoll, 'poll']
  else if (!hasLeft) {
    const still = stillKept(kept, now)
    if (still) [limits, limitsFrom] = [still.limits, 'kept']
  }

  const eventUsd = sent?.cost?.usd
  const pollUsd = polled?.cost?.usd
  const usd = typeof eventUsd === 'number' && Number.isFinite(eventUsd) ? eventUsd : typeof pollUsd === 'number' && Number.isFinite(pollUsd) ? pollUsd : undefined
  return { tokens, tokensFrom, window, limits, limitsFrom, hasLeft, usd }
}
