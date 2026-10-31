// The real weather: where it is for, fetching it, and what /crab weather says about it. The network and the
// store live here; the atom the beach draws from stays in register.tsx, which hands `show` in to set it.

import type { EngineInterface } from 'claude-code'

import type { WeatherNow } from '../types'
import { IP_SERVICE, IP_URL, cityOfZone, cleanZone, howFound, isLocated, isLocatedFresh, parseIp, weatherMode } from './locate'
import type { Located } from './locate'
import { WINDY_KMH, weatherOf } from './sky'
import { KEY, MIN, cfg } from './state'

type Geo = { place: string; lat: number; lon: number }
type StoredWeather = { place: string; at: number; code: number; wind: number }
const isGeo = (v: unknown): v is Geo => !!v && typeof v === 'object' && typeof (v as Geo).lat === 'number' && typeof (v as Geo).lon === 'number' && typeof (v as Geo).place === 'string'
const isStoredWeather = (v: unknown): v is StoredWeather =>
  !!v && typeof v === 'object' && typeof (v as StoredWeather).at === 'number' && typeof (v as StoredWeather).code === 'number' && typeof (v as StoredWeather).place === 'string' && Number.isFinite((v as StoredWeather).wind)
const WEATHER_MS = 60 * MIN
/** A request that hasn't answered by then has failed, so one hung request can't stop the weather. */
const FETCH_TIMEOUT_MS = 10_000
/** After a failure, that service is left alone this long, by every open session. */
const BACKOFF_MS = 15 * MIN
let isFetching = false

export const toWeatherNow = (w: StoredWeather): WeatherNow => ({ kind: weatherOf(w.code), isWindy: (w.wind ?? 0) >= WINDY_KMH, at: w.at })

function withTimeout<T>($: EngineInterface, work: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = $.clock.after(ms, () => reject(new Error('timed out')))
    work.then(
      v => {
        timer.cancel()
        resolve(v)
      },
      (err: unknown) => {
        timer.cancel()
        reject(err)
      },
    )
  })
}

/** When each service last failed, by host: shared in $.store, so one failure quiets every session. */
async function failures($: EngineInterface): Promise<Record<string, number>> {
  const v = await $.store.get(KEY.failed)
  return v && typeof v === 'object' ? (v as Record<string, number>) : {}
}

/**
 * JSON from one of the weather services, or a throw. A request that times out, an HTTP error, an answer that
 * isn't JSON, or one `isUseful` turns down, all count as a failure, and that host is then left alone for a while.
 */
async function getJson($: EngineInterface, url: string, isUseful: (data: unknown) => boolean = () => true): Promise<unknown> {
  const host = new URL(url).host
  const now = await $.clock.now()
  const failed = await failures($)
  const lastFail = failed[host]
  if (typeof lastFail === 'number' && now - lastFail >= 0 && now - lastFail < BACKOFF_MS) throw new Error(`${host} is resting`)
  try {
    const res = await withTimeout($, $.http.fetch(url), FETCH_TIMEOUT_MS)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = JSON.parse(res.text) as unknown
    if (!isUseful(data)) throw new Error('no useful answer')
    if (lastFail !== undefined) {
      const { [host]: _, ...rest } = await failures($)
      await $.store.set(KEY.failed, rest)
    }
    return data
  } catch (err) {
    await $.store.set(KEY.failed, { ...(await failures($)), [host]: now })
    throw err
  }
}

const isLatLon = (lat: unknown, lon: unknown): boolean =>
  typeof lat === 'number' && typeof lon === 'number' && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180

type GeoAnswer = { results?: { latitude?: unknown; longitude?: unknown }[] } | null
const geoHit = (data: unknown): { latitude: number; longitude: number } | null => {
  const hit = (data as GeoAnswer)?.results?.[0]
  return hit && isLatLon(hit.latitude, hit.longitude) ? (hit as { latitude: number; longitude: number }) : null
}

type ForecastAnswer = { current?: { weather_code?: unknown; wind_speed_10m?: unknown } } | null
const hasCode = (data: unknown): boolean => typeof (data as ForecastAnswer)?.current?.weather_code === 'number'

/** Coordinates for a city name, from Open-Meteo's geocoder, cached in $.store by name. */
async function geocode($: EngineInterface, place: string): Promise<Geo | null> {
  const cached = await $.store.get(KEY.geo)
  if (isGeo(cached) && cached.place === place) return cached
  const hit = geoHit(await getJson($, `https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(place)}`, d => geoHit(d) !== null))
  if (!hit) return null
  const geo: Geo = { place, lat: hit.latitude, lon: hit.longitude }
  await $.store.set(KEY.geo, geo)
  return geo
}

/** The system's time zone: TZ when it names one, else the one dates here are local to. */
async function systemZone($: EngineInterface): Promise<string | null> {
  const tz = cleanZone(await $.env.get('TZ').catch(() => undefined))
  if (tz) return tz
  try {
    return cleanZone(Intl.DateTimeFormat().resolvedOptions().timeZone)
  } catch {
    return null
  }
}

const round2 = (n: number): number => Math.round(n * 100) / 100

/**
 * Where the person is, for "auto" (the time zone's city) and "auto-ip" (an IP lookup,
 * falling back to the time zone). Looked up again every few hours or when the zone
 * changes, kept in $.store for every session; offline, the last place found stands.
 */
async function locate($: EngineInterface, isIp: boolean, now: number): Promise<Located | null> {
  const zone = await systemZone($)
  const stored = await $.store.get(KEY.located)
  const last = isLocated(stored) && stored.asked === (isIp ? 'auto-ip' : 'auto') ? stored : null
  if (last && isLocatedFresh(last, isIp, zone, now)) return last
  const asked = isIp ? 'auto-ip' : 'auto'
  let found: Located | null = null
  if (isIp) {
    const hit = parseIp(await getJson($, IP_URL, d => parseIp(d) !== null).catch(() => null))
    // About a kilometre is plenty for the weather, and all that's kept.
    if (hit) found = { asked, source: 'ip', key: IP_SERVICE, place: hit.place, lat: round2(hit.lat), lon: round2(hit.lon), at: now }
  }
  const city = zone ? cityOfZone(zone) : null
  if (!found && zone && city) {
    const geo = await geocode($, city).catch(() => null)
    if (geo) found = { asked, source: 'zone', key: zone, place: city, lat: geo.lat, lon: geo.lon, at: now }
  }
  if (!found) return last
  await $.store.set(KEY.located, found)
  return found
}

/** The weatherPlace this session last checked the store against: it looks once per setting, not every minute. */
let checkedPlace: string | null = null

/**
 * When weatherPlace changes, or is emptied, what was found and fetched for the old one is dropped from $.store,
 * so turning the weather off, or moving from "auto-ip" to a city, leaves no location behind. Once per session and
 * setting: two sessions set differently (a project's own settings) then can't wipe each other's every minute.
 */
async function forgetOtherPlaces($: EngineInterface, asked: string): Promise<void> {
  if (checkedPlace === asked) return
  checkedPlace = asked
  const before = await $.store.get(KEY.asked)
  if (before === asked) return
  // Before this version nothing was recorded: keep what a set place had, but an empty one still forgets.
  if (before !== undefined || asked === '') for (const key of [KEY.weather, KEY.geo, KEY.located, KEY.failed]) await $.store.set(key, null)
  await $.store.set(KEY.asked, asked)
}

/**
 * The real weather, at most once an hour, kept in $.store so every open session
 * shares it. For a place in the settings only its name and coordinates go out, to
 * Open-Meteo; "auto" sends the time zone's city instead, and "auto-ip" first asks
 * ipwho.is where the IP is. Empty, or offline: clear skies, no errors.
 */
export async function refreshWeather($: EngineInterface, show: (now: WeatherNow | null) => Promise<void>): Promise<void> {
  const mode = weatherMode(cfg.place)
  await forgetOtherPlaces($, cfg.place)
  if (mode.kind === 'off') {
    await show(null)
    return
  }
  const now = await $.clock.now()
  if (isFetching) return
  isFetching = true
  try {
    let geo: Geo | null = null
    let place = mode.kind === 'place' ? mode.place : ''
    if (mode.kind === 'auto') {
      const here = await locate($, mode.isIp, now)
      if (!here) return
      geo = { place: here.place, lat: here.lat, lon: here.lon }
      place = `${here.place}@${here.lat.toFixed(2)},${here.lon.toFixed(2)}`
    }
    const stored = await $.store.get(KEY.weather)
    if (isStoredWeather(stored) && stored.place === place) {
      await show(toWeatherNow(stored))
      if (now - stored.at < WEATHER_MS) return
    }
    geo ??= await geocode($, place)
    if (!geo) return
    const { lat, lon } = geo
    const data = (await getJson($, `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(2)}&longitude=${lon.toFixed(2)}&current=weather_code,wind_speed_10m`, hasCode)) as ForecastAnswer
    const code = data?.current?.weather_code
    if (typeof code !== 'number') return
    const wind = data?.current?.wind_speed_10m
    const w: StoredWeather = { place, at: now, code, wind: typeof wind === 'number' && Number.isFinite(wind) ? wind : 0 }
    await $.store.set(KEY.weather, w)
    await show(toWeatherNow(w))
  } catch {
    // Offline or the service is down: keep what we had.
  } finally {
    isFetching = false
  }
}

/** What /crab weather says: which place the weather is for, how it was found, and what it is. */
export async function weatherText($: EngineInterface, w: WeatherNow | null): Promise<string> {
  const mode = weatherMode(cfg.place)
  if (mode.kind === 'off') return 'No weather: weatherPlace is empty, so nothing is fetched. Set it to a city, to "auto" (your time zone\'s city) or to "auto-ip" (an IP lookup, which shows your IP address to ipwho.is) with /plugin configure crab-buddy@crab-buddy.'
  const now = await $.clock.now()
  const sky = w ? `${w.kind}${w.isWindy ? ', windy' : ''}, checked ${Math.max(0, Math.round((now - w.at) / MIN))} min ago` : 'not fetched yet'
  if (mode.kind === 'place') return `Weather for ${mode.place} (set in weatherPlace): ${sky}.`
  const here = await $.store.get(KEY.located)
  if (!isLocated(here) || here.asked !== (mode.isIp ? 'auto-ip' : 'auto')) return `Weather from where you are (weatherPlace "${mode.isIp ? 'auto-ip' : 'auto'}"): no place found yet${mode.isIp ? '' : ' (is the time zone set?)'}.`
  const ago = Math.max(0, Math.round((now - here.at) / MIN))
  return `Weather for ${here.place}, ${howFound(here)} ${ago < 60 ? `${ago} min` : `${Math.round(ago / 60)} h`} ago: ${sky}.`
}

// The shared folder, beside the rest of Claude Code's own.
