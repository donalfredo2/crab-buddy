// The pet's needs, as pure functions of the clock: easy to test, and the same
// numbers whichever session works them out.

import type { Needs } from '../types'

export const FLOOR = 10
const MIN = 60_000
const HOUR = 60 * MIN
/** A gap longer than this means no session was open: it does not count as time passing. */
const MAX_STEP = 5 * MIN
export const COOLDOWN = { feed: 5 * MIN, play: 5 * MIN, pet: MIN } as const
export type Care = keyof typeof COOLDOWN

export const freshNeeds = (now: number): Needs => ({
  food: 80,
  fun: 80,
  energy: 90,
  updatedAt: now,
  lastFed: 0,
  lastPlayed: 0,
  lastPetted: 0,
})

const clamp = (n: number): number => Math.max(FLOOR, Math.min(100, n))

/**
 * While Claude works, nothing sinks below this: working never makes it hungry, bored, sleepy or grumpy
 * (all start under 30). The work is yours; the crab shouldn't make you feel bad for doing it.
 */
export const WORK_FLOOR = 30

// A drop while working stops at the floor; a value already under it stays where it was rather than jumping up.
const held = (before: number, after: number): number => (after < before ? Math.max(after, Math.min(before, WORK_FLOOR)) : after)

/** Brings needs up to `now`: Food and Fun fade 5 an hour while open; Energy drains while working, down to WORK_FLOOR. */
export const tick = (n: Needs, now: number, opts: { isWorking: boolean; isLate: boolean }): Needs => {
  const step = Math.max(0, Math.min(MAX_STEP, now - n.updatedAt))
  const hours = step / HOUR
  const drain = opts.isWorking ? (step / (3 * MIN)) * (opts.isLate ? 2 : 1) : 0
  const next = { food: clamp(n.food - 5 * hours), fun: clamp(n.fun - 5 * hours), energy: clamp(n.energy - drain) }
  if (opts.isWorking) {
    next.food = held(n.food, next.food)
    next.fun = held(n.fun, next.fun)
    next.energy = held(n.energy, next.energy)
  }
  return { ...n, ...next, updatedAt: now }
}

/** Time away refills Energy: a 15-minute break +40, a night away (6 hours) all of it. */
export const rest = (n: Needs, awayMs: number): Needs =>
  awayMs >= 6 * HOUR ? { ...n, energy: 100 } : awayMs >= 15 * MIN ? { ...n, energy: clamp(n.energy + 40) } : n

export const gain = (n: Needs, what: Partial<Pick<Needs, 'food' | 'fun' | 'energy'>>): Needs => ({
  ...n,
  food: clamp(n.food + (what.food ?? 0)),
  fun: clamp(n.fun + (what.fun ?? 0)),
  energy: clamp(n.energy + (what.energy ?? 0)),
})

const LAST: Record<Care, 'lastFed' | 'lastPlayed' | 'lastPetted'> = { feed: 'lastFed', play: 'lastPlayed', pet: 'lastPetted' }

export const cooldownLeft = (n: Needs, care: Care, now: number): number => Math.max(0, n[LAST[care]] + COOLDOWN[care] - now)

/** A care action, or null while it is cooling down. */
export const care = (n: Needs, what: Care, now: number): Needs | null => {
  if (cooldownLeft(n, what, now) > 0) return null
  const effect = what === 'feed' ? { food: 15 } : what === 'play' ? { fun: 15, energy: -5 } : { fun: 5 }
  return { ...gain(n, effect), [LAST[what]]: now }
}

export type PetMood = 'happy' | 'ok' | 'grumpy'

export const petMood = (n: Needs): PetMood => {
  const low = Math.min(n.food, n.fun, n.energy)
  return low < 25 ? 'grumpy' : low < 55 ? 'ok' : 'happy'
}

export const isHungry = (n: Needs): boolean => n.food < 30
export const isSleepy = (n: Needs): boolean => n.energy < 30
