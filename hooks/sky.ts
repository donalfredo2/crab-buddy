// The sky over the beach: seasons, holidays, the moon's real phase and the
// weather. Pure functions of the date and a weather code, so they are easy to test.

import type { Weather } from '../types'

export type { Weather }
export type Season = 'spring' | 'summer' | 'autumn' | 'winter'
export type Holiday = 'halloween' | 'christmas' | 'newyear' | null

/** What the sky is doing; `windy` bends the seaweed and hurries the clouds. */
export type Sky = { season: Season; holiday: Holiday; moon: number; weather: Weather; isWindy: boolean }

export const season = (d: Date): Season => {
  const m = d.getMonth()
  return m >= 2 && m <= 4 ? 'spring' : m >= 5 && m <= 7 ? 'summer' : m >= 8 && m <= 10 ? 'autumn' : 'winter'
}

export const holiday = (d: Date): Holiday => {
  const m = d.getMonth()
  const day = d.getDate()
  if (m === 9 && day === 31) return 'halloween'
  if (m === 11 && day >= 24 && day <= 26) return 'christmas'
  if ((m === 11 && day === 31) || (m === 0 && day === 1)) return 'newyear'
  return null
}

const SYNODIC_DAYS = 29.530588853
// A known new moon: 06-01-2000, 18:14 UTC.
const NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14)

/** Where the moon is in its cycle: 0 new, 0.25 first quarter, 0.5 full, 0.75 last quarter. */
export const moonPhase = (ms: number): number => {
  const days = (ms - NEW_MOON_MS) / 86_400_000
  return (((days / SYNODIC_DAYS) % 1) + 1) % 1
}

/** How much of the moon is lit, 0 to 1. */
export const moonLit = (phase: number): number => (1 - Math.cos(2 * Math.PI * phase)) / 2

/** WMO weather codes, as Open-Meteo reports them, to what the strip shows. */
export const weatherOf = (code: number): Weather => {
  if (code >= 95) return 'storm'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow'
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain'
  if (code === 45 || code === 48) return 'fog'
  if (code === 2 || code === 3) return 'cloudy'
  return 'clear'
}

export const WINDY_KMH = 30

export const skyFor = (ms: number, weather: Weather = 'clear', isWindy = false): Sky => {
  const d = new Date(ms)
  return { season: season(d), holiday: holiday(d), moon: moonPhase(ms), weather, isWindy }
}
