// Going in circles: the tests red three times running, or the same command failing again and again in one turn.
// That is the moment a person should step in, and nothing else shows it. Kept conservative on purpose: many edits
// to one file are ordinary work and are not counted. Pure, so it is easy to test.

import type { Circles } from '../types'
import { oneLine } from './text'

export const NO_CIRCLES: Circles = { red: 0, signedRed: 0, fails: {} }
/** Red runs in a row before the sign goes up, and how many more before it goes up again. */
export const RED_RUNS = 3
/** The same command failing this often in one turn. */
export const SAME_FAILS = 3
/** The most failing commands remembered in a turn: the newest win. */
export const MAX_FAILS = 20

/** A command's fingerprint: what is kept of it, never the command itself. FNV-1a, in base 36. */
export const hashOf = (text: string): string => {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return (h >>> 0).toString(36)
}

type Step = { next: Circles; sign: string | null }

/** After a test or build run. Green ends the streak; the third red in a row is a sign, then every third after. */
export const afterCheck = (c: Circles, isOk: boolean): Step => {
  if (isOk) return { next: c.red || c.signedRed ? { ...c, red: 0, signedRed: 0 } : c, sign: null }
  const red = c.red + 1
  if (red >= RED_RUNS && red - c.signedRed >= RED_RUNS) return { next: { ...c, red, signedRed: red }, sign: `${red} red runs` }
  return { next: { ...c, red }, sign: null }
}

/** After any other shell command that failed: the same one, for the third time this turn, is a sign. Once. */
export const afterFail = (c: Circles, command: string): Step => {
  const key = hashOf(oneLine(command))
  const count = (c.fails[key] ?? 0) + 1
  const { [key]: _, ...rest } = c.fails
  const kept = Object.entries(rest).slice(-(MAX_FAILS - 1))
  return { next: { ...c, fails: { ...Object.fromEntries(kept), [key]: count } }, sign: count === SAME_FAILS ? `same error ×${count}` : null }
}

/** A new turn: the failing commands are forgotten, the red streak is not (the tests are still red). */
export const newTurn = (c: Circles): Circles => (Object.keys(c.fails).length ? { ...c, fails: {} } : c)

/** What the toast says where signs are off. */
export const circlesToast = (sign: string): string =>
  sign.includes('red runs')
    ? `${sign} in a row. Time to step in? /crab circles off stops this note.`
    : 'The same command has failed three times this turn. Time to step in? /crab circles off stops this note.'
