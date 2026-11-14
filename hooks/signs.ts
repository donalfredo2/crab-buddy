// News the crab holds up or plants in the sand, one sign at a time: pure, so the
// queue and its timing are easy to test.

import type { QueuedSign, ReactionMood, Segment, SignKind } from '../types'

const MAX_QUEUE = 3
/** A sign that waited this long is old news. */
const STALE_MS = 30_000

/** How the crab looks while it holds each sign up; the first two bring the plane and the fireworks. */
export const SIGN_MOOD: Record<Exclude<SignKind, 'coffee' | 'walk' | 'context' | 'compact' | 'limit' | 'budget' | 'cache' | 'circles' | 'cold'>, ReactionMood> = {
  done: 'wave', commit: 'party', merged: 'party', pushed: 'cheer', pr: 'cheer', mr: 'cheer', green: 'cool', fish: 'cheer', boot: 'daze', news: 'wave', spend: 'wave',
}
export type HeldKind = keyof typeof SIGN_MOOD

/** One waiting sign of each kind, newest last, so the cap drops the oldest. */
export const enqueue = (queue: readonly QueuedSign[], sign: QueuedSign): QueuedSign[] =>
  [...queue.filter(s => s.kind !== sign.kind), sign].slice(-MAX_QUEUE)

export const nextInQueue = (queue: readonly QueuedSign[], now: number): { next: QueuedSign | null; rest: QueuedSign[] } => {
  const fresh = queue.filter(s => now - s.at < STALE_MS)
  return { next: fresh[0] ?? null, rest: fresh.slice(1) }
}

/** The words the crab is holding up in this segment, while it holds them. */
export const heldSign = (seg: Segment | null, now: number): string | null =>
  seg?.hold?.sign && now < seg.startAt + seg.hold.ms ? seg.hold.sign : null

/** Coffee when the break is due; a long stretch past it earns a walk. */
export const breakKind = (streakStart: number, now: number, limitMs: number): 'coffee' | 'walk' =>
  now - streakStart >= 2 * limitMs ? 'walk' : 'coffee'

// One sign stands in the sand at a time. What matters most first: a context or a limit nearly full (each as
// urgent as the other, so the newer of them stands), Claude going in circles, then the hints about compacting and
// the cache.
const PLANT_RANK: Partial<Record<SignKind, number>> = { context: 0, limit: 0, budget: 0, circles: 1, cold: 2, compact: 3, cache: 4 }

/**
 * Whether a new sign may take the place of the one standing: its own kind again, or one that matters as much or
 * more. A sign from before kinds were kept, or of a kind with no rank, gives way to any.
 */
export const mayReplace = (kind: SignKind, standing: SignKind | undefined): boolean => {
  if (standing === undefined || standing === kind) return true
  const theirs = PLANT_RANK[standing]
  const mine = PLANT_RANK[kind]
  return theirs === undefined || (mine !== undefined && mine <= theirs)
}
