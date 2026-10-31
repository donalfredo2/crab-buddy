// Where the weather is for: the place in the settings, or, when the person asks for
// it with "auto" or "auto-ip", where they are now. Pure parts here; register.tsx
// does the fetching through $.

import { clip } from './text'

/** What the `weatherPlace` setting asks for. */
export type WeatherMode = { kind: 'off' } | { kind: 'place'; place: string } | { kind: 'auto'; isIp: boolean }

export const weatherMode = (raw: string): WeatherMode => {
  const v = raw.trim()
  if (!v) return { kind: 'off' }
  const lower = v.toLowerCase()
  if (lower === 'auto') return { kind: 'auto', isIp: false }
  if (lower === 'auto-ip') return { kind: 'auto', isIp: true }
  return { kind: 'place', place: v }
}

/**
 * Where "auto" found the person, kept in $.store and shared by every open session:
 * `asked` is the setting that found it, `key` the time zone it came from or the IP service.
 */
export type Located = { asked: 'auto' | 'auto-ip'; source: 'zone' | 'ip'; key: string; place: string; lat: number; lon: number; at: number }

export const isLocated = (v: unknown): v is Located => {
  const l = v as Located
  return !!v && typeof v === 'object' && (l.asked === 'auto' || l.asked === 'auto-ip') && (l.source === 'zone' || l.source === 'ip') && typeof l.key === 'string' &&
    typeof l.place === 'string' && typeof l.lat === 'number' && typeof l.lon === 'number' && typeof l.at === 'number'
}

/** How often "auto" looks again, for a laptop that travels. */
export const LOCATE_MS = 3 * 60 * 60_000

/** The free, keyless IP lookup "auto-ip" asks. It sees the person's IP address. */
export const IP_SERVICE = 'ipwho.is'
export const IP_URL = 'https://ipwho.is/?fields=success,city,latitude,longitude'

const ZONE = /^[A-Za-z]+(\/[A-Za-z0-9_+-]+)+$/
// Areas whose zones name a country or a rule, not a city.
const NOT_CITIES = new Set(['Etc', 'SystemV', 'US', 'Canada', 'Brazil', 'Mexico', 'Chile'])

/** An IANA time zone as given ("Europe/Berlin"), or null for "UTC", ":/etc/localtime" and the like. */
export const cleanZone = (tz: string | undefined): string | null => {
  const v = (tz ?? '').trim().replace(/^:/, '')
  return ZONE.test(v) && !NOT_CITIES.has(v.split('/')[0] ?? '') ? v : null
}

/** The city a time zone is named for: Europe/Berlin -> Berlin, America/Argentina/Buenos_Aires -> Buenos Aires. */
export const cityOfZone = (tz: string): string | null => {
  const zone = cleanZone(tz)
  if (!zone) return null
  const city = (zone.split('/').pop() ?? '').replace(/_/g, ' ').trim()
  return /^[A-Za-z][A-Za-z .'-]*$/.test(city) ? city : null
}

/** The city and coordinates in ipwho.is's answer, or null when it has none. */
export const parseIp = (data: unknown): { place: string; lat: number; lon: number } | null => {
  const d = data as { success?: boolean; city?: unknown; latitude?: unknown; longitude?: unknown }
  if (!d || typeof d !== 'object' || d.success === false) return null
  if (typeof d.latitude !== 'number' || typeof d.longitude !== 'number') return null
  const place = typeof d.city === 'string' ? clip(d.city, 80) : ''
  return { place: place || `${d.latitude.toFixed(1)}, ${d.longitude.toFixed(1)}`, lat: d.latitude, lon: d.longitude }
}

/**
 * Whether a stored location still answers for this setting, and is fresh enough.
 * One taken from the time zone holds only while the zone is the same.
 */
export const isLocatedFresh = (l: Located, isIp: boolean, zone: string | null, now: number): boolean =>
  now - l.at < LOCATE_MS && l.asked === (isIp ? 'auto-ip' : 'auto') && (l.source === 'ip' || l.key === zone)

/** How the weather's place was found, in words for /crab weather. */
export const howFound = (l: Located): string =>
  l.source === 'ip' ? `found by IP lookup (${IP_SERVICE})` : `your time zone's city (${l.key})`
