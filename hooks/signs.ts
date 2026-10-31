// News the crab holds up or plants in the sand, one sign at a time: pure, so the
// queue and its timing are easy to test.

import type { QueuedSign, ReactionMood, Segment, SignKind } from '../types'

const MAX_QUEUE = 3
/** A sign that waited this long is old news. */
const STALE_MS = 30_000

/** How the crab looks while it holds each sign up; the first two bring the plane and the fireworks. */
export const SIGN_MOOD: Record<Exclude<SignKind, 'coffee' | 'walk' | 'context' | 'compact' | 'limit' | 'budget'>, ReactionMood> = {
  done: 'wave', commit: 'party', merged: 'party', pushed: 'cheer', pr: 'cheer', mr: 'cheer', green: 'cool', fish: 'cheer', boot: 'daze',
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
