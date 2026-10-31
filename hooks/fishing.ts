// Each running subagent is a rod on the shore. This works out what changed from the
// engine's list of agents: pure, so what counts as running or finished is easy to test.

import type { CatchKind, Rod } from '../types'
import { clip } from './text'

// A subagent's description is free text; a rod keeps a short line of it.
const DESCRIPTION_MAX = 60

type Agent = { id: string; status: string; type: string; teammateId?: string; description: string }

const RUNNING: ReadonlySet<string> = new Set(['pending', 'running', 'waiting'])
const LOST: ReadonlySet<string> = new Set(['failed', 'killed'])

/**
 * The rods out now, and what the ones gone from them caught. A teammate is left out:
 * it idles between turns for as long as it likes, which no fish should wait for. A
 * rod whose agent left the list came home: the engine drops finished agents after a while.
 */
export const reconcile = (rods: readonly Rod[], agents: readonly Agent[]): { rods: Rod[]; hauls: CatchKind[] } => {
  const own = agents.filter(a => a.type !== 'teammate' && !a.teammateId)
  const statusOf = new Map(own.map(a => [a.id, a.status]))
  return {
    rods: own.filter(a => RUNNING.has(a.status)).map(a => ({ id: a.id, description: clip(String(a.description ?? ''), DESCRIPTION_MAX) })),
    hauls: rods.filter(r => !RUNNING.has(statusOf.get(r.id) ?? '')).map(r => (LOST.has(statusOf.get(r.id) ?? '') ? 'boot' : 'fish')),
  }
}

export const sameRods = (a: readonly Rod[], b: readonly Rod[]): boolean =>
  a.length === b.length && a.every((r, i) => r.id === b[i]?.id && r.description === b[i]?.description)
