// One crab across your open sessions. Each session writes only its own file in a shared
// folder, and all of them work out who has the crab the same way: pure, so no session
// has to be in charge and nothing has to be locked.

import { clip } from './text'

export type BeachRecord = {
  slot: string
  /** Whose slot this is: two sessions starting together can pick the same one. */
  token: string
  /** Its last sign of life; 0 once it has closed. */
  at: number
  repo: string
  /** When you last spoke here. */
  personAt: number
  /** When a long task last finished here, or Claude here started waiting for you. */
  doneAt: number
  /** It was waiting for you, not done: its note says so. */
  isNeeds?: boolean
  canHold: boolean
}

/** A beach silent this long has gone. */
export const FRESH_MS = 30_000
/** A file this old is free for a new session to take over. */
const STALE_MS = 60_000
/** It stays with you this long after your last message, whatever finishes elsewhere. */
export const ACTIVE_MS = 60_000

const able = (beaches: readonly BeachRecord[], now: number): BeachRecord[] =>
  beaches.filter(b => b.canHold && now - b.at < FRESH_MS).sort((a, b) => (a.slot < b.slot ? -1 : a.slot > b.slot ? 1 : 0))

const latest = (beaches: readonly BeachRecord[], time: (b: BeachRecord) => number): BeachRecord | null =>
  beaches.reduce<BeachRecord | null>((best, b) => (!best || time(b) > time(best) ? b : best), null)

/** Who has the crab: where you last spoke, unless a task finished elsewhere since and you've gone quiet. */
export const holderOf = (beaches: readonly BeachRecord[], now: number): BeachRecord | null => {
  const open = able(beaches, now)
  const person = latest(open, b => b.personAt)
  const done = latest(open, b => b.doneAt)
  if (!person || !done) return null
  return done.doneAt > person.personAt && now - person.personAt >= ACTIVE_MS ? done : person
}

/** A beach whose task finished while you were busy here: the crab says so instead of leaving you. */
export const finishedElsewhere = (beaches: readonly BeachRecord[], holder: BeachRecord, now: number): BeachRecord | null =>
  latest(able(beaches, now).filter(b => b.slot !== holder.slot && b.doneAt > holder.personAt && b.doneAt > holder.doneAt), b => b.doneAt)

/** Where a new session settles: the oldest file nobody has touched lately, else a new one. */
export const pickSlot = (files: readonly { name: string; mtimeMs: number }[], now: number): string => {
  const free = files.filter(f => f.name.endsWith('.json') && now - f.mtimeMs >= STALE_MS).sort((a, b) => a.mtimeMs - b.mtimeMs)
  return free[0]?.name ?? `${now.toString(36)}.json`
}

/** A file's record, or null for one caught half written. */
export const parseBeach = (text: string, slot: string): BeachRecord | null => {
  try {
    const b = JSON.parse(text) as Partial<BeachRecord>
    if (typeof b.at !== 'number' || typeof b.token !== 'string') return null
    return { slot, token: b.token, at: b.at, repo: clip(String(b.repo ?? ''), 40), personAt: Number(b.personAt) || 0, doneAt: Number(b.doneAt) || 0, ...(b.isNeeds === true ? { isNeeds: true } : {}), canHold: b.canHold === true }
  } catch {
    return null
  }
}

/** What the crab says about a window that wants it while it stays with you. */
export const wantsNote = (b: BeachRecord): string => `${b.repo.slice(0, 16) || 'other'} ${b.isNeeds ? 'needs you' : 'is done'}`

/** Where the crab is, in the words of a sign. */
export const whereCrabIs = (holderRepo: string, myRepo: string): string =>
  holderRepo && holderRepo !== myRepo ? `at ${holderRepo.slice(0, 18)}` : 'in another window'
