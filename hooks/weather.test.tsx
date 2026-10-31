// The weather: for the place in the settings, or, when asked with "auto" / "auto-ip",
// for where the person is now. Nothing goes out unless the setting asks for it.
import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import type { On } from 'claude-code'

import { LOCATE_MS, cityOfZone, cleanZone, parseIp, weatherMode } from './locate'

const MIN = 60_000
const T0 = new Date(2026, 9, 29, 12).getTime()
const BAND = {
  plugin: 'crab-buddy', component: 'AbovePrompt', requestId: 'above-prompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const

type Net = {
  urls: string[]
  isOnline: boolean
  /** What ipwho.is answers, or null for a failed lookup. */
  ip: { city: string; latitude: number; longitude: number } | null
  /** The weather code the forecast answers. */
  code: number
  /** Requests never answer. */
  isHung: boolean
  /** The geocoder knows no such place. */
  isUnknownPlace: boolean
}

/** The engine beneath the plugin, with the network and the TZ variable under the test's control. */
function engine(on: On, zone: string | undefined): Net {
  const net: Net = { urls: [], isOnline: true, ip: null, code: 63, isHung: false, isUnknownPlace: false }
  on('command.register', () => ({ value: { command: 'crab' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('command.run', () => ({ text: '' }))
  on('prompt.submit', (_, e) => ({ text: e.text }) as never)
  on('session.usage', () => ({ value: { startedAt: T0, context: { window: 1_000_000 }, rateLimits: [] } }) as never)
  on('settings.read', () => ({ value: { idleCompaction: undefined } }) as never)
  on('ui.toast', () => ({ value: undefined }))
  on('audio.play', () => ({ value: undefined }))
  on('ui.blit', () => ({ value: { deny: 'not mounted' } }) as never)
  on('ui.panes', () => ({ value: [] }) as never)
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('ui.close', () => ({ value: undefined }) as never)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  on('env.get', (_, e, next) => ((e as { name: string }).name === 'TZ' ? ({ value: zone } as never) : next(e)))
  on('http.fetch', (_, e) => {
    const url = (e as { url: string }).url
    net.urls.push(url)
    if (!net.isOnline) throw new Error('offline')
    if (net.isHung) return new Promise(() => undefined) as never
    let body: unknown
    if (/ipwho\.is/.test(url)) body = net.ip ? { success: true, ...net.ip } : { success: false, message: 'reserved range' }
    else if (/geocoding/.test(url)) {
      const name = decodeURIComponent(/name=([^&]+)/.exec(url)?.[1] ?? '')
      body = net.isUnknownPlace ? {} : { results: [name === 'Berlin' ? { latitude: 52.52, longitude: 13.41 } : { latitude: 38.72, longitude: -9.14 }] }
    } else body = { current: { weather_code: net.code, wind_speed_10m: 4 } }
    return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify(body) } } as never
  })
  return net
}

type Tester = Parameters<TestBody>[0]
// The host's own timer: a turn of its event loop lets a settled call reach the plugin.
const hostTimer = (globalThis as unknown as { setTimeout: (f: () => void, ms: number) => void }).setTimeout
const tick = () => new Promise<void>(r => hostTimer(r, 0))
/** The session starts without waiting for the weather, which is fetched in the background: wait for it here. */
async function start($: Tester): Promise<void> {
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  for (let i = 0; i < 5; i++) await tick()
}
const crab = async ($: Tester, args: string) =>
  ((await $.command.run({ command: 'crab', args, origin: { kind: 'user' }, presentation: { isFullscreen: false, columns: 100 } } as never)) as { text: string }).text
async function sky($: Tester): Promise<string> {
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const source = String((await ui.find({ type: 'Svg' }))?.props.source ?? '')
  await ui.unmount()
  return source
}
/** $.store in memory, like mock.store, but the test can look inside: which keys were written, and to what. */
function memoryStore(on: On, entries: Readonly<Record<string, unknown>> = {}): { held: Map<string, unknown>; written: Map<string, unknown> } {
  const held = new Map<string, unknown>(Object.entries(entries))
  const written = new Map<string, unknown>()
  on('store.get', (_, e) => ({ value: held.get((e as { key: string }).key) }) as never)
  on('store.set', (_, e) => {
    const { key, value } = e as { key: string; value: unknown }
    held.set(key, value)
    written.set(key, value)
    return { value: undefined } as never
  })
  on('store.delete', (_, e) => {
    held.delete((e as { key: string }).key)
    return { value: undefined } as never
  })
  on('store.keys', () => ({ value: [...held.keys()] }) as never)
  return { held, written }
}
const count = (net: Net, re: RegExp) => net.urls.filter(u => re.test(u)).length
const forecasts = (net: Net) => net.urls.filter(u => /forecast/.test(u))

// --- pure parts

test('the setting reads as off, a place, or auto', () => {
  expect(weatherMode('')).toEqual({ kind: 'off' })
  expect(weatherMode('  ')).toEqual({ kind: 'off' })
  expect(weatherMode('Lisbon')).toEqual({ kind: 'place', place: 'Lisbon' })
  expect(weatherMode('auto')).toEqual({ kind: 'auto', isIp: false })
  expect(weatherMode('Auto')).toEqual({ kind: 'auto', isIp: false })
  expect(weatherMode('auto-ip')).toEqual({ kind: 'auto', isIp: true })
})

test('a time zone names its city, and a zone that is no city names none', () => {
  expect(cityOfZone('Europe/Berlin')).toBe('Berlin')
  expect(cityOfZone('America/New_York')).toBe('New York')
  expect(cityOfZone('America/Argentina/Buenos_Aires')).toBe('Buenos Aires')
  expect(cityOfZone(':Europe/Lisbon')).toBe('Lisbon')
  for (const tz of ['UTC', 'Etc/GMT+2', 'US/Eastern', ':/etc/localtime', '', 'Europe/Berlin; rm -rf']) expect(cityOfZone(tz)).toBe(null)
  expect(cleanZone(undefined)).toBe(null)
})

test("an IP lookup's answer gives a city and coordinates, or nothing", () => {
  expect(parseIp({ success: true, city: 'Augsburg', latitude: 48.37, longitude: 10.9 })).toEqual({ place: 'Augsburg', lat: 48.37, lon: 10.9 })
  expect(parseIp({ success: true, city: '', latitude: 48.37, longitude: 10.9 })?.place).toBe('48.4, 10.9')
  expect(parseIp({ success: false })).toBe(null)
  expect(parseIp({ success: true, city: 'X' })).toBe(null)
  expect(parseIp(null)).toBe(null)
  expect(parseIp({ success: true, city: 'X', latitude: 91, longitude: 0 })).toBe(null)
  expect(parseIp({ success: true, city: 'X', latitude: 0, longitude: -181 })).toBe(null)
  expect(parseIp({ success: true, city: 'X', latitude: Number.NaN, longitude: 0 })).toBe(null)
})

// --- the privacy default

test('left empty, nothing is fetched, even with a time zone to go on', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  const net = engine(on, 'Europe/Berlin')
  await start($)
  await clock.advance(4 * 60 * MIN)
  expect(net.urls).toEqual([])
  expect(await sky($)).not.toMatch(/class="rain"/)
  expect(await crab($, 'weather')).toMatch(/nothing is fetched/)
})

test('"auto" never asks the IP service, only Open-Meteo with the city name', { options: { weatherPlace: 'auto' } }, async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  const net = engine(on, 'Europe/Berlin')
  net.ip = { city: 'Augsburg', latitude: 48.37, longitude: 10.9 }
  await start($)
  await clock.advance(5 * 60 * MIN)
  expect(count(net, /ipwho/)).toBe(0)
  expect(count(net, /forecast/)).toBeGreaterThan(0)
  expect(net.urls.every(u => /^https:\/\/(api|geocoding-api)\.open-meteo\.com\//.test(u))).toBe(true)
})

// --- an explicit place wins

test('a place in the settings wins over the time zone and the IP', { options: { weatherPlace: 'Lisbon' } }, async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on, { weatherLocated: { asked: 'auto-ip', source: 'ip', key: 'ipwho.is', place: 'Augsburg', lat: 48.37, lon: 10.9, at: T0 } })
  const net = engine(on, 'Europe/Berlin')
  net.ip = { city: 'Augsburg', latitude: 48.37, longitude: 10.9 }
  await start($)
  await clock.advance(MIN)
  expect(count(net, /ipwho/)).toBe(0)
  expect(net.urls.filter(u => /geocoding/.test(u))).toEqual(['https://geocoding-api.open-meteo.com/v1/search?count=1&name=Lisbon'])
  expect(forecasts(net)).toEqual(['https://api.open-meteo.com/v1/forecast?latitude=38.72&longitude=-9.14&current=weather_code,wind_speed_10m'])
  expect(await crab($, 'weather')).toMatch(/^Weather for Lisbon \(set in weatherPlace\): rain/)
})

test('weather a place stored before this version still shows, without fetching again', { options: { weatherPlace: 'Lisbon' } }, async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on, { weather: { place: 'Lisbon', at: T0 - 10 * MIN, code: 71, wind: 0 } })
  const net = engine(on, 'Europe/Berlin')
  await start($)
  expect(net.urls).toEqual([])
  expect(await sky($)).toMatch(/class="flake"/)
})

// --- auto: the time zone's city

test('"auto" shows the weather of the time zone\'s city and says so', { options: { weatherPlace: 'auto' } }, async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  const net = engine(on, 'Europe/Berlin')
  await start($)
  expect(net.urls.filter(u => /geocoding/.test(u))).toEqual(['https://geocoding-api.open-meteo.com/v1/search?count=1&name=Berlin'])
  expect(forecasts(net)).toEqual(['https://api.open-meteo.com/v1/forecast?latitude=52.52&longitude=13.41&current=weather_code,wind_speed_10m'])
  expect(await sky($)).toMatch(/class="rain"/)
  expect(await crab($, 'weather')).toMatch(/^Weather for Berlin, your time zone's city \(Europe\/Berlin\) 0 min ago: rain/)
})

test('"auto" without a usable time zone fetches nothing and says why', { options: { weatherPlace: 'auto' } }, async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  const net = engine(on, 'Etc/UTC')
  await start($)
  await clock.advance(10 * MIN)
  expect(count(net, /ipwho|forecast/)).toBe(0)
  expect(await crab($, 'weather')).toMatch(/no place found yet \(is the time zone set\?\)/)
})

// --- auto-ip: the IP lookup, cached and looked at again

test('"auto-ip" finds the city by IP, and a session that opens later reuses it', { options: { weatherPlace: 'auto-ip' } }, async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  const net = engine(on, 'Europe/Berlin')
  net.ip = { city: 'Augsburg', latitude: 48.37, longitude: 10.9 }
  await start($)
  expect(net.urls[0]).toBe('https://ipwho.is/?fields=success,city,latitude,longitude')
  expect(count(net, /geocoding/)).toBe(0)
  expect(forecasts(net)).toEqual(['https://api.open-meteo.com/v1/forecast?latitude=48.37&longitude=10.90&current=weather_code,wind_speed_10m'])
  expect(await crab($, 'weather')).toMatch(/^Weather for Augsburg, found by IP lookup \(ipwho\.is\) 0 min ago: rain/)
  // Another window opening an hour later: the stored place and weather stand.
  await clock.advance(30 * MIN)
  await start($)
  expect(count(net, /ipwho/)).toBe(1)
})

test('the location is reused for three hours, then looked up again, and a move fetches the new weather at once', { options: { weatherPlace: 'auto-ip' } }, async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  const net = engine(on, 'Europe/Berlin')
  net.ip = { city: 'Augsburg', latitude: 48.37, longitude: 10.9 }
  await start($)
  await clock.advance(LOCATE_MS - 2 * MIN)
  expect(count(net, /ipwho/)).toBe(1)
  // The weather itself still comes hourly.
  expect(forecasts(net).length).toBe(3)
  net.ip = { city: 'Lisbon', latitude: 38.72, longitude: -9.14 }
  net.code = 0
  await clock.advance(3 * MIN)
  expect(count(net, /ipwho/)).toBe(2)
  expect(forecasts(net).at(-1)).toMatch(/latitude=38\.72&longitude=-9\.14/)
  expect(await sky($)).not.toMatch(/class="rain"/)
  expect(await crab($, 'weather')).toMatch(/^Weather for Lisbon, found by IP lookup/)
})

test('a failed IP lookup falls back to the time zone\'s city', { options: { weatherPlace: 'auto-ip' } }, async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  const net = engine(on, 'Europe/Berlin')
  net.ip = null
  await start($)
  expect(count(net, /ipwho/)).toBe(1)
  expect(forecasts(net)).toEqual(['https://api.open-meteo.com/v1/forecast?latitude=52.52&longitude=13.41&current=weather_code,wind_speed_10m'])
  expect(await crab($, 'weather')).toMatch(/^Weather for Berlin, your time zone's city/)
})

test('"auto" looks again when the time zone changes', { options: { weatherPlace: 'auto' } }, async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on, { weatherLocated: { asked: 'auto', source: 'zone', key: 'Europe/Lisbon', place: 'Lisbon', lat: 38.72, lon: -9.14, at: T0 - MIN } })
  const net = engine(on, 'Europe/Berlin')
  await start($)
  await clock.advance(MIN)
  expect(net.urls.filter(u => /geocoding/.test(u))).toEqual(['https://geocoding-api.open-meteo.com/v1/search?count=1&name=Berlin'])
  expect(await crab($, 'weather')).toMatch(/^Weather for Berlin/)
})

// --- offline

test('offline, auto keeps the last place and its weather', { options: { weatherPlace: 'auto-ip' } }, async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  const net = engine(on, 'Europe/Berlin')
  net.ip = { city: 'Augsburg', latitude: 48.37, longitude: 10.9 }
  await start($)
  expect(await sky($)).toMatch(/class="rain"/)
  net.isOnline = false
  await clock.advance(LOCATE_MS + 10 * MIN)
  expect(count(net, /ipwho/)).toBeGreaterThan(1)
  expect(await sky($)).toMatch(/class="rain"/)
  expect(await crab($, 'weather')).toMatch(/^Weather for Augsburg, found by IP lookup/)
})

test('offline from the start, auto shows clear skies and no error', { options: { weatherPlace: 'auto-ip' } }, async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  const net = engine(on, 'Europe/Berlin')
  net.isOnline = false
  await start($)
  await clock.advance(5 * MIN)
  expect(await sky($)).not.toMatch(/class="rain"/)
  expect(await crab($, 'weather')).toMatch(/no place found yet/)
})

// --- a service that hangs or fails

test('a request that never answers times out, and the weather comes once the service is back', { options: { weatherPlace: 'Lisbon' } }, async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  const net = engine(on, 'Europe/Berlin')
  net.isHung = true
  await start($)
  expect(count(net, /geocoding/)).toBe(1)
  await clock.advance(11_000)
  net.isHung = false
  // Left alone for a while after the failure, then asked again.
  await clock.advance(16 * MIN)
  expect(forecasts(net).length).toBe(1)
  expect(await sky($)).toMatch(/class="rain"/)
})

test('a failing service is left alone for 15 minutes instead of asked every minute', { options: { weatherPlace: 'Lisbon' } }, async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  const net = engine(on, 'Europe/Berlin')
  net.isOnline = false
  await start($)
  await clock.advance(10 * MIN)
  expect(count(net, /geocoding/)).toBe(1)
  net.isOnline = true
  await clock.advance(6 * MIN)
  expect(count(net, /geocoding/)).toBe(2)
  expect(await sky($)).toMatch(/class="rain"/)
})

test('a place the geocoder does not know is not asked about every minute', { options: { weatherPlace: 'Atlantis' } }, async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  const net = engine(on, 'Europe/Berlin')
  net.isUnknownPlace = true
  await start($)
  await clock.advance(29 * MIN)
  expect(count(net, /geocoding/)).toBe(2)
  expect(forecasts(net)).toEqual([])
})

// --- what is kept

test('a place found by IP is kept only to about a kilometre', { options: { weatherPlace: 'auto-ip' } }, async ($, on) => {
  mock.clock(on, { now: T0 })
  const kept = memoryStore(on).written
  const net = engine(on, 'Europe/Berlin')
  net.ip = { city: 'Augsburg', latitude: 48.367891, longitude: 10.898123 }
  await start($)
  expect(kept.get('weatherLocated')).toMatchObject({ place: 'Augsburg', lat: 48.37, lon: 10.9 })
})

const KEPT = { weatherAsked: 'auto-ip', weatherLocated: { asked: 'auto-ip', source: 'ip', key: 'ipwho.is', place: 'Augsburg', lat: 48.37, lon: 10.9, at: T0 - MIN }, weather: { place: 'Augsburg@48.37,10.90', at: T0 - MIN, code: 63, wind: 4 }, weatherGeo: { place: 'Augsburg', lat: 48.37, lon: 10.9 } }

test('emptying weatherPlace forgets the place and weather it had found', async ($, on) => {
  mock.clock(on, { now: T0 })
  const kept = memoryStore(on, KEPT).written
  const net = engine(on, 'Europe/Berlin')
  await start($)
  for (const key of ['weatherLocated', 'weather', 'weatherGeo']) expect(kept.get(key)).toBe(null)
  expect(net.urls).toEqual([])
})

test('switching from auto-ip to a city forgets the place found by IP', { options: { weatherPlace: 'Lisbon' } }, async ($, on) => {
  mock.clock(on, { now: T0 })
  const kept = memoryStore(on, KEPT).written
  engine(on, 'Europe/Berlin')
  await start($)
  expect(kept.get('weatherLocated')).toBe(null)
  expect(await crab($, 'weather')).toMatch(/^Weather for Lisbon \(set in weatherPlace\): rain/)
})

test('an install from before this version keeps its weather until the setting changes', { options: { weatherPlace: 'auto-ip' } }, async ($, on) => {
  mock.clock(on, { now: T0 })
  const { weatherAsked: _, ...older } = KEPT
  const kept = memoryStore(on, older).written
  const net = engine(on, 'Europe/Berlin')
  await start($)
  expect(count(net, /ipwho/)).toBe(0)
  expect(kept.has('weatherLocated')).toBe(false)
  expect(kept.get('weatherAsked')).toBe('auto-ip')
  expect(await crab($, 'weather')).toMatch(/^Weather for Augsburg, found by IP lookup/)
})

test('a session set differently elsewhere doesn\'t make this one forget and look again every minute', { options: { weatherPlace: 'auto-ip' } }, async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  const store = memoryStore(on, { ...KEPT, weatherAsked: 'Lisbon' })
  const net = engine(on, 'Europe/Berlin')
  net.ip = { city: 'Augsburg', latitude: 48.37, longitude: 10.9 }
  await start($)
  expect(count(net, /ipwho/)).toBe(1)
  // A window in another project, with weatherPlace "Lisbon", writes its own setting back.
  store.held.set('weatherAsked', 'Lisbon')
  await clock.advance(10 * MIN)
  expect(count(net, /ipwho/)).toBe(1)
  expect(store.held.get('weatherLocated')).toMatchObject({ place: 'Augsburg' })
})
