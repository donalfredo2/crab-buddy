// A bottle washed ashore: what the logbook held when you last worked in this folder, kept for the next session.
// A new session starts with an empty log and an empty head; this hands it the state of the work in a line.
// Kept by project folder, as the campfire is (cache.ts). Pure, so it is easy to test.

import type { Logbook } from '../types'
import { fileList } from './logbook'
import { cut, oneLine } from './text'

/** How long a kept log is still news. */
export const ASHORE_MS = 7 * 86_400_000
/** The most folders kept: the newest win. */
export const KEPT_LOGS = 12
const PROMPT_MAX = 300

/** A folder's log as it stood at `at`; `isShown` once its bottle has washed up, so it does so only once. */
export type KeptLog = { at: number; log: Logbook; isShown?: boolean }
export type KeptLogs = Record<string, KeptLog>

const isCheck = (v: unknown): boolean => v === null || v === 'passed' || v === 'failed'
const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every(s => typeof s === 'string')
const isLog = (v: unknown): v is Logbook => {
  if (!v || typeof v !== 'object') return false
  const l = v as Record<string, unknown>
  return isStrings(l.files) && isStrings(l.commits) && isCheck(l.test) && isCheck(l.build)
}
const isKept = (v: unknown): v is KeptLog => !!v && typeof v === 'object' && typeof (v as KeptLog).at === 'number' && isLog((v as KeptLog).log)

/** Whether a log holds anything at all. */
export const hasLog = (log: Logbook): boolean => log.files.length > 0 || log.commits.length > 0 || log.test !== null || log.build !== null

/** Worth a bottle: work left open. Files changed since the last commit, or a test or build left failing. */
export const isOpenWork = (log: Logbook): boolean => log.files.length > 0 || log.test === 'failed' || log.build === 'failed'

/** What the store holds, made safe and without logs too old to be news, newest first and at most KEPT_LOGS. */
export const keptLogs = (stored: unknown, now: number): KeptLogs => {
  if (!stored || typeof stored !== 'object') return {}
  const live = Object.entries(stored as Record<string, unknown>)
    .filter((e): e is [string, KeptLog] => isKept(e[1]) && now >= e[1].at && now - e[1].at < ASHORE_MS)
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, KEPT_LOGS)
  return Object.fromEntries(live)
}

/**
 * The kept logs with this folder's set to `log`. An empty log changes nothing: a session that has done nothing
 * yet does not wipe what the last one left.
 */
export const keepLog = (stored: unknown, folder: string, log: Logbook, now: number): KeptLogs => {
  const kept = keptLogs(stored, now)
  if (!folder || !hasLog(log)) return kept
  const { [folder]: _, ...rest } = kept
  return keptLogs({ [folder]: { at: now, log }, ...rest }, now)
}

/** The bottle for this folder: a kept log with work left open that has not washed up yet, or null. */
export const washedUp = (stored: unknown, folder: string, now: number): KeptLog | null => {
  const k = keptLogs(stored, now)[folder]
  return k && !k.isShown && isOpenWork(k.log) ? k : null
}

/** The kept logs with this folder's marked as washed up. */
export const markShown = (stored: unknown, folder: string, now: number): KeptLogs => {
  const kept = keptLogs(stored, now)
  const k = kept[folder]
  return k ? { ...kept, [folder]: { ...k, isShown: true } } : kept
}

/** "earlier today", "yesterday", "3 days ago": by the calendar where you are. */
export const agoWords = (at: number, now: number): string => {
  const day = (ms: number): number => {
    const d = new Date(ms)
    return Math.round(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86_400_000)
  }
  const days = day(now) - day(at)
  return days <= 0 ? 'earlier today' : days === 1 ? 'yesterday' : `${days} days ago`
}

// Paths and titles were written by whoever named the files and wrote the commits: one line, no angle brackets.
const plain = (text: string): string => oneLine(text).replace(/[<>]/g, '')

const facts = (log: Logbook): string[] => [
  log.files.length ? `files changed since the last commit: ${plain(fileList(log.files, 160))}` : '',
  log.test === 'failed' ? 'the tests were failing' : '',
  log.build === 'failed' ? 'the build was failing' : '',
  log.commits.length ? `last commit "${plain(log.commits[log.commits.length - 1] ?? '').replace(/"/g, "'")}"` : '',
].filter(Boolean)

/** What /crab last says. */
export const ashoreText = (k: KeptLog | null, now: number): string => {
  if (!k) return 'Nothing kept from last time in this folder.'
  const what = facts(k.log)
  return what.length ? `Last time here (${agoWords(k.at, now)}): ${what.join('; ')}.` : `Last time here (${agoWords(k.at, now)}): nothing left open.`
}

/** A ready first prompt for the box: Tab takes it, and you still press Enter. */
export const ashorePrompt = (k: KeptLog): string => {
  const open = [
    k.log.files.length ? `the work on ${plain(fileList(k.log.files.slice(-5), 110))}` : '',
    k.log.test === 'failed' ? 'the tests were failing' : '',
    k.log.build === 'failed' ? 'the build was failing' : '',
  ].filter(Boolean)
  return cut(`Pick up where we left off: ${open.join('; ')}. Check where it stands first.`, PROMPT_MAX)
}
