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
}

/** The engine beneath the plugin, with the network and the TZ variable under the test's control. */
function engine(on: On, zone: string | undefined): Net {
  const net: Net = { urls: [], isOnline: true, ip: null, code: 63 }
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
    let body: unknown
    if (/ipwho\.is/.test(url)) body = net.ip ? { success: true, ...net.ip } : { success: false, message: 'reserved range' }
    else if (/geocoding/.test(url)) {
      const name = decodeURIComponent(/name=([^&]+)/.exec(url)?.[1] ?? '')
      body = { results: [name === 'Berlin' ? { latitude: 52.52, longitude: 13.41 } : { latitude: 38.72, longitude: -9.14 }] }
    } else body = { current: { weather_code: net.code, wind_speed_10m: 4 } }
    return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify(body) } } as never
  })
  return net
}

type Tester = Parameters<TestBody>[0]
const start = ($: Tester) => $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
const crab = async ($: Tester, args: string) =>
  ((await $.command.run({ command: 'crab', args, origin: { kind: 'user' }, presentation: { isFullscreen: false, columns: 100 } } as never)) as { text: string }).text
async function sky($: Tester): Promise<string> {
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const source = String((await ui.find({ type: 'Svg' }))?.props.source ?? '')
  await ui.unmount()
  return source
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
