// What the crab writes down while it watches: the state of the work, free to keep.
// Before a compaction it goes to the summarizer as a short note, the bottle.

import type { Logbook } from '../types'

const MAX_FILES = 30
const MAX_COMMITS = 3
const MAX_TITLE = 60
export const NOTE_MAX = 600
const NOTE_HEAD = "Keep these facts in the summary. They are a log of this session's work, taken as it happened:"

export const EMPTY_LOG: Logbook = { files: [], test: null, build: null, commits: [] }

const clean = (s: string): string => s.replace(/[\u0000-\u001f\u007f]/g, ' ').trim()

/** Newest last, so the cap drops the oldest. */
export const logFile = (log: Logbook, path: string): Logbook => {
  const file = clean(path)
  return file ? { ...log, files: [...log.files.filter(f => f !== file), file].slice(-MAX_FILES) } : log
}

export const logCheck = (log: Logbook, which: 'test' | 'build', isOk: boolean): Logbook =>
  which === 'test' ? { ...log, test: isOk ? 'passed' : 'failed' } : { ...log, build: isOk ? 'passed' : 'failed' }

/** A commit's subject line from its command: a heredoc's first line, or `-m "…"`. */
export const commitTitle = (command: string): string => {
  const title = /<<-?\s*['"]?\w+['"]?\s*\n\s*(.+)/.exec(command)?.[1] ?? /\s-[a-zA-Z]*m\s*(["'])(.+?)\1/.exec(command)?.[2] ?? ''
  return clean(title).slice(0, MAX_TITLE) || 'a commit'
}

/** A commit settles the files: what's left is what changed after it. */
export const logCommit = (log: Logbook, title: string): Logbook =>
  ({ ...log, files: [], commits: [...log.commits, title].slice(-MAX_COMMITS) })

const shortPath = (path: string): string => path.split('/').filter(Boolean).slice(-2).join('/')

// Newest first, as many as fit.
const fileList = (files: readonly string[], room: number): string => {
  const shown: string[] = []
  for (const file of [...files].reverse().map(shortPath)) {
    if (shown.join(', ').length + file.length + 2 > room) break
    shown.push(file)
  }
  const more = files.length - shown.length
  if (!shown.length) return `${more} files`
  return more ? `${shown.join(', ')}, and ${more} more` : shown.join(', ')
}

const logLines = (log: Logbook, room: number): string[] => {
  const facts = [
    log.test ? `Last test run: ${log.test}.` : '',
    log.build ? `Last build: ${log.build}.` : '',
    log.commits.length ? `Recent commits: ${log.commits.join('; ')}.` : '',
  ].filter(Boolean)
  const used = facts.join('\n').length
  return log.files.length ? [`Files changed since the last commit: ${fileList(log.files, room - used)}.`, ...facts] : facts
}

/** What the summarizer gets; empty when there's nothing to keep. */
export const logNote = (log: Logbook): string => {
  const lines = logLines(log, NOTE_MAX - NOTE_HEAD.length - 60)
  return lines.length ? `${NOTE_HEAD}\n${lines.join('\n')}`.slice(0, NOTE_MAX) : ''
}

/** What /crab log shows you. */
export const logText = (log: Logbook): string => logLines(log, 2000).join('\n')

const KEEP_MAX = 240

/**
 * A ready /compact for the prompt box, telling the summary what to keep: the files changed since the last
 * commit, the last commit, and a test or build left failing. With nothing logged, a plain /compact.
 */
export const compactKeep = (log: Logbook): string => {
  const parts = [
    log.files.length ? `the work on ${fileList(log.files.slice(-5), 110)}` : '',
    log.commits.length ? `the last commit "${log.commits[log.commits.length - 1]}"` : '',
    log.test === 'failed' ? 'the tests are failing' : '',
    log.build === 'failed' ? 'the build is failing' : '',
  ].filter(Boolean)
  return parts.length ? `/compact Keep ${parts.join('; ')}`.slice(0, KEEP_MAX) : '/compact'
}
