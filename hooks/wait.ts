// Claude waiting for you, counted. The red flag says that it waits; this says for how long, adds the day's
// waits up, and decides when a wait is worth a sound or a notification. Pure, so it is easy to test.

/** A wait this long gets the alert, where one was asked for with /crab alert. */
export const WAIT_ALERT_MS = 60_000
/** How many days of waits are kept. */
export const WAIT_DAYS = 14

/** What `/crab alert` takes: nothing (the default), the chirp, a native notification, or both. */
export const ALERTS = ['off', 'chirp', 'notify', 'both'] as const
export type AlertMode = (typeof ALERTS)[number]

/** What the store holds, made safe: anything else is off. */
export const alertOf = (stored: unknown): AlertMode => ((ALERTS as readonly unknown[]).includes(stored) ? (stored as AlertMode) : 'off')

export const alertText = (mode: AlertMode): string =>
  mode === 'off'
    ? 'No alert: the red flag alone says Claude is waiting. /crab alert chirp, notify or both adds one after a minute.'
    : `After a minute of Claude waiting for you: ${mode === 'chirp' ? 'a chirp' : mode === 'notify' ? 'a notification' : 'a chirp and a notification'}. /crab alert off stops it.`

/** "4m" once a minute has gone, "1h 5m" past the hour; nothing before that. */
export const waitedWords = (since: number, now: number): string => {
  const minutes = Math.floor((now - since) / 60_000)
  if (!(minutes >= 1)) return ''
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`
}

/** The flag's words with the wait after them: "needs you: Bash · 4m". */
export const flagWords = (what: string, since: number, now: number): string => {
  const waited = waitedWords(since, now)
  return waited ? `${what} · ${waited}` : what
}

/** One day's waits: all of them together, how many, the longest, and when the last ended. */
export type DayWait = { ms: number; count: number; longest: number; at: number }
/** The waits by day (dayKey), in $.store for every window together. */
export type Waited = Record<string, DayWait>

const isDayWait = (v: unknown): v is DayWait => {
  if (!v || typeof v !== 'object') return false
  const d = v as Record<string, unknown>
  return [d.ms, d.count, d.longest, d.at].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0)
}

/** What the store holds, made safe, the newest WAIT_DAYS days of it. */
export const waitedOf = (stored: unknown): Waited => {
  if (!stored || typeof stored !== 'object') return {}
  const days = Object.entries(stored as Record<string, unknown>)
    .filter((e): e is [string, DayWait] => isDayWait(e[1]))
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, WAIT_DAYS)
  return Object.fromEntries(days)
}

/** One more wait on `day`: `ms` long, counted up to `maxMs`, the longest the flag stays up. */
export const addWait = (stored: unknown, day: string, ms: number, maxMs: number, now: number): Waited => {
  const kept = waitedOf(stored)
  const waited = Math.max(0, Math.min(maxMs, ms))
  const before = kept[day] ?? { ms: 0, count: 0, longest: 0, at: now }
  return waitedOf({ ...kept, [day]: { ms: before.ms + waited, count: before.count + 1, longest: Math.max(before.longest, waited), at: now } })
}

const minutesWords = (ms: number): string => {
  const minutes = Math.round(ms / 60_000)
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`
}

/** /crab stats: "waited 37m for you (5 times)", once the day's waits come to a minute; empty before. */
export const waitStat = (stored: unknown, day: string): string => {
  const d = waitedOf(stored)[day]
  if (!d || d.ms < 60_000) return ''
  return `waited ${minutesWords(d.ms)} for you (${d.count} ${d.count === 1 ? 'time' : 'times'})`
}
