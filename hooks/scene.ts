// The strip the crab lives in: a strip of sand with its shell, seaweed, a tide
// pool, its castle and shell pile, day and night, and the crab living out its
// plan. Everything above the sand is transparent. All motion is CSS keyed to the
// wall clock, so a redraw picks up the segment where it was instead of starting over.

import type { Pose, Prop, Segment, TimeOfDay } from '../types'
import { CRAB_W, MAX_CASTLE, NO_CONTEXT_SHORE, ROOMY, hasDecor, isWalking, planOf, spots, whereAt, xOf } from './life'
import type { Plan } from './life'
import { moonLit } from './sky'
import type { Sky } from './sky'
import { CLAY, CRAB_CSS, crab, overlay, propSvg, umbrellaSvg } from './sprites'
import type { Costume, CrabLook } from './sprites'

export const SCENE_H = 40
const GROUND = 35
const SCALE = 0.86
const CRAB_Y = 13
const HOME_SHELL_X = 14
const PILE_MAX = 12
const PRINT_MS = 4000
const MAX_PRINTS = 150
// Wider than any slot: a surface draws an Svg with no width "up to the slot".
const FILL_W = 4096

export type SceneInput = {
  width: number
  costume: Costume
  look: CrabLook
  timeOfDay: TimeOfDay
  bubble: string | null
  /** Wall clock, ms: sets where along its plan the crab is. */
  now: number
  seg: Segment
  prop: Prop | null
  sky: Sky
  /** The work pile's blocks, one per tool used this turn. */
  work: readonly string[]
  /** Wall-clock hour with minutes as a fraction: where the setting sun is. */
  hour: number
  /** The drawing's height; past SCENE_H it is more sky above the same beach (the tank). */
  height?: number
  /** Take whatever width the surface's slot has, stretching `width` to it (the strip). */
  fill?: boolean
}

export const timeOfDay = (hour: number): TimeOfDay => (hour >= 22 || hour < 6 ? 'night' : hour < 9 ? 'morning' : hour >= 18 ? 'evening' : 'day')

const xml = (s: string): string => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)
const r1 = (n: number): string => String(Math.round(n * 10) / 10)

const SCENE_CSS = `
.sand{fill:#E9D8AE}.sand2{fill:#D9C493}.peb{fill:#BDB6A8}.bub{fill:#fff;stroke:#D9D6CF}.bubt{fill:#3A3936}.z{fill:#8a8a86}.sw{stroke:#4FA36B}
.cs{fill:#E2CC95}.cs2{fill:#CDB57C}.pool{fill:#9FD3E8}.hole{fill:#C9B27E}.fpd{fill:#CDB57C}
@media (prefers-color-scheme: dark){.sand{fill:#5E5442}.sand2{fill:#6E6250}.peb{fill:#6E675C}.bub{fill:#2A2927;stroke:#4A4844}.bubt{fill:#EDEBE6}.z{fill:#9a9a96}.sw{stroke:#3F8A58}
.cs{fill:#7A6B50}.cs2{fill:#655841}.pool{fill:#3E6A7A}.hole{fill:#4A4234}.fpd{fill:#4A4234}}
.sw{fill:none;stroke-width:1.6;stroke-linecap:round;transform-box:fill-box;transform-origin:50% 100%;animation:sway2 4.2s ease-in-out infinite}
.sw2{animation-duration:3.6s;animation-delay:-1.3s}.sw3{animation-duration:4.8s;animation-delay:-2.1s}
@keyframes sway2{50%{transform:rotate(9deg)}}
.tw{animation:blink 2.6s steps(1) infinite}.tw2{animation-delay:-.9s}.tw3{animation-delay:-1.7s}
.bubble{animation:pop .25s ease-out}
@keyframes pop{from{transform:scale(.6);opacity:0}}
.shim{animation:blink 3s steps(1) infinite}
.fp{opacity:0;animation:fpk ${PRINT_MS / 1000}s linear forwards}
@keyframes fpk{0%{opacity:.7}100%{opacity:0}}
.wing{transform-box:fill-box;transform-origin:50% 100%;animation:flap .25s steps(2) infinite}
@keyframes flap{50%{transform:scaleY(.3)}}
.flut{animation:flut .7s ease-in-out infinite}
@keyframes flut{50%{transform:translateY(-3px)}}
.flag{transform-box:fill-box;transform-origin:0 50%;animation:wave .6s steps(1) infinite}
`

const SHELL = ['...dpppd...', '..dpwpwpd..', '.dpwpwpwpd.', 'dpwpwpwpwpd', 'dpwpwpwpwpd', '.dpppppppd.', '...ddddd...']
const SHELL_COLORS: Record<string, string> = { p: '#F2B8A0', w: '#FBE3D6', d: '#D98E73' }
const PILE_COLORS = ['#F2B8A0', '#FBE3D6', '#F5D58A', '#C9D8F0', '#E8B4C8', '#D9C493']

// Pixel art, one rect per run of a colour along a row.
const pixels = (rows: string[], colors: Record<string, string>, x: number, y: number): string =>
  rows.map((row, dy) => {
    const out: string[] = []
    const cells = [...row]
    for (let dx = 0; dx < cells.length; ) {
      const c = cells[dx] ?? '.'
      let end = dx + 1
      while (end < cells.length && cells[end] === c) end++
      if (colors[c]) out.push(`<rect x="${x + dx}" y="${y + dy}" width="${end - dx}" height="1" fill="${colors[c]}"/>`)
      dx = end
    }
    return out.join('')
  }).join('')

// The collection: up to 12 little shells stacked left of its home.
const pileSpot = (i: number): { x: number; y: number } => {
  const rows = [4, 3, 3, 2]
  let row = 0
  let k = i
  while (row < rows.length - 1 && k >= (rows[row] ?? 0)) k -= rows[row++] ?? 0
  return { x: 1 + row * 1.5 + k * 3, y: GROUND - 2 - row * 2 }
}
const pileShell = (i: number): string => {
  const { x, y } = pileSpot(i)
  const c = PILE_COLORS[i % PILE_COLORS.length] ?? '#F2B8A0'
  return `<rect x="${x + 1}" y="${y}" width="1" height="1" fill="${c}"/><rect x="${x}" y="${y + 1}" width="3" height="1" fill="${c}"/><rect x="${x}" y="${y + 1}" width="1" height="1" fill="#D98E73"/>`
}

// The sandcastle, one more part per stage: mound, a tower, a second tower, a gate, a flag.
const castle = (cx: number, stage: number): string => {
  const parts: string[] = []
  if (stage >= 1) parts.push(`<rect class="cs" x="${cx - 6}" y="${GROUND - 2}" width="12" height="2"/><rect class="cs2" x="${cx - 6}" y="${GROUND - 1}" width="12" height="1"/>`)
  if (stage >= 2) parts.push(`<rect class="cs" x="${cx - 5}" y="${GROUND - 8}" width="4" height="6"/><rect class="cs" x="${cx - 5}" y="${GROUND - 9}" width="1" height="1"/><rect class="cs" x="${cx - 3}" y="${GROUND - 9}" width="1" height="1"/><rect class="cs2" x="${cx - 2}" y="${GROUND - 8}" width="1" height="6"/>`)
  if (stage >= 3) parts.push(`<rect class="cs" x="${cx + 1}" y="${GROUND - 7}" width="4" height="5"/><rect class="cs" x="${cx + 1}" y="${GROUND - 8}" width="1" height="1"/><rect class="cs" x="${cx + 3}" y="${GROUND - 8}" width="1" height="1"/><rect class="cs2" x="${cx + 4}" y="${GROUND - 7}" width="1" height="5"/>`)
  if (stage >= 4) parts.push(`<rect class="cs" x="${cx - 1}" y="${GROUND - 5}" width="2" height="3"/><rect x="${cx - 0.5}" y="${GROUND - 3.5}" width="1" height="1.5" fill="#8E7A52"/>`)
  if (stage >= 5) parts.push(`<rect x="${cx - 3.6}" y="${GROUND - 14}" width=".6" height="5" fill="#8E7A52"/><rect class="flag" x="${cx - 3}" y="${GROUND - 14}" width="3" height="2" fill="#E8577A"/>`)
  return parts.join('')
}

// --- the sky: ambient, infinite CSS keyed to the wall clock, so a redraw never restarts it.

/** A negative delay that puts an infinite animation where the wall clock says it is. */
const wall = (now: number, period: number, offset = 0): string => `animation-delay:-${(((now / 1000 + offset) % period) + period) % period}s`

const CLOUD = ['...wwww....', '.wwwwwwww..', 'wwwwwwwwwww', '.wwwwwwwww.']
const isWet = (sky: Sky): boolean => sky.weather === 'rain' || sky.weather === 'storm'
const isGrey = (sky: Sky): boolean => sky.weather !== 'clear' && sky.weather !== 'fog'
/** Spreads the strip's sky over a taller one: 0 goes to `top`, the sand stays put. */
const skyY = (top: number) => (y: number): number => y + top * (1 - y / GROUND)

/** A burst of fireworks: rays that grow and fade, `n` bursts staggered over a period. */
export const fireworks = (width: number, n: number, period: number, delay: (i: number) => string, sy = (y: number) => y): string => {
  const colors = ['#F5C542', '#E8577A', '#7F77DD', '#1D9E75', '#378ADD', '#F28C3A']
  return Array.from({ length: n }, (_, i) => {
    const cx = Math.round(width * (0.15 + ((i * 0.37) % 0.75)))
    const cy = Math.round(sy(7 + (i % 3) * 4))
    const c = colors[i % colors.length] ?? '#F5C542'
    const rays = Array.from({ length: 8 }, (_, k) => {
      const a = (k / 8) * 2 * Math.PI
      return `<rect x="${r1(cx + Math.cos(a) * 6 - 0.6)}" y="${r1(cy + Math.sin(a) * 6 - 0.6)}" width="1.2" height="1.2" fill="${c}"/>`
    }).join('')
    return `<g class="fw" style="transform-origin:${cx}px ${cy}px;animation-duration:${period}s;${delay(i)}">${rays}<rect x="${cx - 0.6}" y="${cy - 0.6}" width="1.2" height="1.2" fill="#fff"/></g>`
  }).join('')
}

const skyBack = (width: number, tod: TimeOfDay, sky: Sky, hour: number, now: number, top = 0): string => {
  const out: string[] = []
  const sy = (y: number): number => Math.round(skyY(top)(y))
  // A taller sky gets more stars and clouds, so it isn't emptier than the strip's.
  const extra = Math.round(-top / 14)
  const clearish = !isGrey(sky)
  if (tod === 'night') {
    if (clearish) {
      out.push([0.33, 0.52, 0.82, 0.12, 0.66].map((p, i) => `<g class="tw${i % 3 ? ` tw${(i % 3) + 1}` : ''}" fill="#F3E7B5"><rect x="${Math.round(width * p)}" y="${sy(3 + (i % 3) * 3)}" width="1" height="3"/><rect x="${Math.round(width * p) - 1}" y="${sy(3 + (i % 3) * 3) + 1}" width="3" height="1"/></g>`).join(''))
      out.push(Array.from({ length: extra }, (_, i) => `<rect class="tw${i % 3 ? ` tw${(i % 3) + 1}` : ''}" x="${Math.round(width * ((i * 0.618 + 0.07) % 1))}" y="${Math.round(top + 2 + ((i * 0.381 + 0.2) % 1) * (24 - top) * 0.8)}" width="1" height="1" fill="#F3E7B5"/>`).join(''))
      // A shooting star now and then.
      out.push(`<g class="shoot" style="${wall(now, 23)}"><rect x="${Math.round(width * 0.45)}" y="${sy(3)}" width="5" height=".8" fill="#F3E7B5" transform="rotate(20 ${Math.round(width * 0.45)} ${sy(3)})"/></g>`)
      out.push(`<g class="shoot shoot2" style="${wall(now, 37, 11)}"><rect x="${Math.round(width * 0.75)}" y="${sy(5)}" width="4" height=".8" fill="#F3E7B5" transform="rotate(20 ${Math.round(width * 0.75)} ${sy(5)})"/></g>`)
    }
    // The moon in its real phase: a lit disc with a shadow disc slid across it.
    const cx = width - 16
    const lit = moonLit(sky.moon)
    const shadow = cx + (sky.moon < 0.5 ? -1 : 1) * 10 * lit
    out.push(lit < 0.03
      ? `<circle cx="${cx}" cy="${sy(9)}" r="5" fill="none" stroke="#F3E7B5" stroke-width=".6" opacity=".45"/>`
      : `<mask id="moon"><rect y="${top}" width="${width}" height="${SCENE_H - top}" fill="#fff"/><circle cx="${r1(shadow)}" cy="${sy(9)}" r="5" fill="#000"/></mask><circle cx="${cx}" cy="${sy(9)}" r="5" fill="#F3E7B5" mask="url(#moon)" opacity="${clearish ? 1 : 0.5}"/>`)
  } else if (tod === 'morning' && clearish) {
    out.push(`<circle cx="${width - 16}" cy="${sy(12)}" r="8" fill="#F5C542" opacity=".18"/><circle cx="${width - 16}" cy="${sy(12)}" r="4.5" fill="#F5C542"/>`)
  } else if (tod === 'day' && clearish) {
    out.push(`<circle cx="${width - 18}" cy="${sy(7)}" r="6" fill="#F5C542" opacity=".15"/><circle cx="${width - 18}" cy="${sy(7)}" r="3.5" fill="#F5C542"/>`)
  } else if (tod === 'evening') {
    // Sunset: the sun sinks from 18:00 and is gone behind the sand by about 21:30.
    const f = Math.max(0, Math.min(1, (hour - 18) / 4))
    const cy = sy(10) + f * (40 - sy(10))
    out.push(`<ellipse cx="${width - 34}" cy="${GROUND}" rx="${Math.min(90, width / 4)}" ry="9" fill="#F5A25A" opacity="${r1(0.2 * (1 - f * 0.6))}"/>`)
    if (clearish) out.push(`<circle cx="${width - 34}" cy="${r1(cy)}" r="5" fill="#F28C3A"/>`)
  }
  // Clouds drift by day; heavier and greyer in bad weather.
  if (tod !== 'night' || isGrey(sky)) {
    const n = (isGrey(sky) ? 5 : 2) + Math.round(extra / 3)
    const period = sky.isWindy ? 70 : 200
    out.push(Array.from({ length: n }, (_, i) =>
      `<g class="cloud${isGrey(sky) ? ' grey' : ''}" style="${wall(now, period, (i * period) / n)};animation-duration:${period}s"><g transform="translate(0,${top ? Math.round(top + 2 + ((i * 0.381) % 1) * (20 - top) * 0.7) : 2 + (i % 3) * 4})">${CLOUD.flatMap((row, dy) => [...row].map((c, dx) => (c === 'w' ? `<rect x="${dx}" y="${dy}" width="1" height="1"/>` : ''))).join('')}</g></g>`).join(''))
  }
  if (sky.holiday === 'halloween' && (tod === 'evening' || tod === 'night')) {
    out.push(`<g class="bat" style="${wall(now, 14)}"><rect class="wing" x="-3" y="0" width="2.5" height="1.2" fill="#3A3936"/><rect class="wing" x=".5" y="0" width="2.5" height="1.2" fill="#3A3936"/><rect x="-.6" y="-.4" width="1.2" height="1.8" fill="#3A3936"/></g>`)
  }
  if (sky.holiday === 'newyear' && (hour >= 22 || hour < 2)) {
    out.push(fireworks(width, 5, 2.6, i => wall(now, 2.6, i * 0.53), sy))
  }
  return out.join('')
}

const holidayDecor = (width: number, tod: TimeOfDay, sky: Sky): string => {
  if (sky.holiday === 'halloween') {
    const pumpkin = (x: number, face: boolean) =>
      `<g shape-rendering="crispEdges"><rect x="${x + 2}" y="${GROUND - 6}" width="1" height="2" fill="#5E7A2E"/><rect x="${x}" y="${GROUND - 4}" width="6" height="4" fill="#E8822B"/><rect x="${x + 1}" y="${GROUND - 5}" width="4" height="1" fill="#E8822B"/><rect x="${x + 2}" y="${GROUND - 4}" width="1" height="4" fill="#C9661E"/>${face ? `<rect x="${x + 1}" y="${GROUND - 3}" width="1" height="1" fill="${tod === 'night' || tod === 'evening' ? '#FFE27A' : '#3A3936'}"/><rect x="${x + 4}" y="${GROUND - 3}" width="1" height="1" fill="${tod === 'night' || tod === 'evening' ? '#FFE27A' : '#3A3936'}"/><rect x="${x + 2}" y="${GROUND - 1.5}" width="2" height=".8" fill="${tod === 'night' || tod === 'evening' ? '#FFE27A' : '#3A3936'}"/>` : ''}</g>`
    return pumpkin(Math.round(width * 0.12), true) + pumpkin(Math.round(width * 0.565), false)
  }
  if (sky.holiday === 'christmas') {
    const x = Math.round(width * 0.12)
    return `<g shape-rendering="crispEdges">${['...g...', '..ggg..', '.ggggg.', '..ggg..', '.ggggg.', 'ggggggg', '...b...'].map((row, dy) => [...row].map((c, dx) => (c === 'g' ? `<rect x="${x + dx}" y="${GROUND - 9 + dy}" width="1" height="1" fill="#2E8A57"/>` : c === 'b' ? `<rect x="${x + dx}" y="${GROUND - 9 + dy}" width="1" height="2" fill="#7A4A26"/>` : '')).join('')).join('')}<rect x="${x + 3}" y="${GROUND - 10}" width="1" height="1" fill="#F5C542"/><rect class="tw" x="${x + 2}" y="${GROUND - 6}" width="1" height="1" fill="#E8577A"/><rect class="tw tw2" x="${x + 4}" y="${GROUND - 4}" width="1" height="1" fill="#F5C542"/></g>`
  }
  return ''
}

/** Weather and night life drawn in front of the crab. */
const skyFront = (width: number, tod: TimeOfDay, sky: Sky, now: number, top = 0): string => {
  const out: string[] = []
  const sy = (y: number): number => Math.round(skyY(top)(y))
  const slant = sky.isWindy ? -5 : -1
  if (isWet(sky)) {
    const n = Math.max(12, Math.round(width / 26))
    out.push(Array.from({ length: n }, (_, i) => `<rect class="rain" x="${(i * 97) % width}" y="${top}" width=".7" height="3" style="${wall(now, 0.7, i * 0.137)}"/>`).join(''))
    out.push(`<style>@keyframes rn{from{transform:translate(0,-5px)}to{transform:translate(${slant}px,${GROUND + 2 - top}px)}}</style>`)
  }
  if (sky.weather === 'storm') out.push(`<rect class="flash" x="0" y="${top}" width="${width}" height="${GROUND - top}" fill="#fff" style="${wall(now, 9)}"/>`)
  if (sky.weather === 'snow') {
    const n = Math.max(10, Math.round(width / 32))
    out.push(Array.from({ length: n }, (_, i) => `<rect class="flake" x="${(i * 83) % width}" y="${top}" width="1.2" height="1.2" style="${wall(now, 5, i * 0.61)}"/>`).join(''))
    out.push(`<style>@keyframes sn{0%{transform:translate(0,-3px)}50%{transform:translate(3px,${(GROUND - top) / 2}px)}100%{transform:translate(-1px,${GROUND + 1 - top}px)}}</style>`)
  }
  if (sky.weather === 'fog') {
    out.push(`<linearGradient id="fog" x1="0" x2="1"><stop offset="0" stop-color="#DCDCD6" stop-opacity="0"/><stop offset="1" stop-color="#DCDCD6" stop-opacity=".6"/></linearGradient><rect x="${Math.round(width * 0.55)}" y="${top}" width="${Math.round(width * 0.45)}" height="${GROUND + 1 - top}" fill="url(#fog)"/>`)
  }
  if (sky.season === 'autumn' && sky.weather !== 'snow') {
    const colors = ['#D9822B', '#C4572B', '#E0A93A', '#9C5A2B']
    const period = sky.isWindy ? 9 : 18
    out.push(colors.map((c, i) => `<g class="leaf" style="${wall(now, period, (i * period) / colors.length + 3)};animation-duration:${period}s"><rect class="spin" x="-1" y="-.5" width="2.2" height="1.2" fill="${c}"/></g>`).join(''))
    out.push(`<style>@keyframes leafx{0%{transform:translate(-10px,${sy(3)}px)}35%{transform:translate(${Math.round(width * 0.35)}px,${sy(14)}px)}70%{transform:translate(${Math.round(width * 0.7)}px,${sy(9)}px)}100%{transform:translate(${width + 10}px,${GROUND - 2}px)}}</style>`)
  }
  if (tod === 'night' && sky.season !== 'winter' && !isWet(sky) && sky.weather !== 'snow') {
    const n = Math.max(4, Math.round(width / 140))
    out.push(Array.from({ length: n }, (_, i) => {
      const x = Math.round(width * (0.08 + ((i * 0.29) % 0.8)))
      const y = 16 + ((i * 7) % 12)
      return `<g class="ff" style="${wall(now, 7, i * 1.3)}"><g class="ffb" style="${wall(now, 2.3, i * 0.7)}"><circle cx="${x}" cy="${y}" r="2.2" fill="#D8F27A" opacity=".22"/><rect x="${x - 0.6}" y="${y - 0.6}" width="1.2" height="1.2" fill="#E6FA8C"/></g></g>`
    }).join(''))
  }
  return out.join('')
}

const SKY_CSS = `
.crater{fill:#C9B27E}@media (prefers-color-scheme: dark){.crater{fill:#4A4234}}
.smoke{opacity:0;animation:rise 2.4s ease-out infinite}
.beam{opacity:.3;animation:beam 6s ease-in-out infinite}
@keyframes beam{0%,100%{transform:scaleX(1)}50%{transform:scaleX(-.6)}}
.palm{animation:sway 4s ease-in-out infinite}
.scloud{fill:#8E929A;opacity:.9}.srain{fill:#7EB6E0;animation:srn .45s linear infinite}
@keyframes srn{from{transform:translateY(0);opacity:1}to{transform:translateY(12px);opacity:0}}
.sbolt{opacity:0;animation:bolt 1.3s steps(1) infinite}
@keyframes bolt{0%,70%,100%{opacity:0}72%{opacity:1}80%{opacity:0}84%{opacity:1}88%{opacity:0}}
.prop{animation:blink .1s steps(1) infinite}
.sea{fill:#8FCFE6;opacity:.92}.sea2{fill:#6BB8D6;opacity:.6}.foam{fill:#fff;opacity:.9}.wet{fill:#CDB57C;opacity:.45}.wl{fill:#fff;opacity:.7;animation:wl 6s linear infinite}
@media (prefers-color-scheme: dark){.sea{fill:#3E6A7A}.sea2{fill:#2F5462}.foam{opacity:.6}.wet{fill:#4A4234}}
.tide{animation:lap 5s ease-in-out infinite}
@keyframes lap{50%{transform:translateX(-5px)}}
@keyframes wl{0%{transform:translateX(0);opacity:0}30%{opacity:.7}100%{transform:translateX(-14px);opacity:0}}
.cloud{fill:#fff;opacity:.85;animation:clx 200s linear infinite}.cloud.grey{fill:#C9CCD2}
@media (prefers-color-scheme: dark){.cloud{fill:#6A6863;opacity:.7}.cloud.grey{fill:#55534F}.snowl{fill:#C9CCD2}.flake{fill:#E6E8EE}}
.snowl{fill:#F7F7F4}.flake{fill:#fff;animation:sn 5s linear infinite}
.rain{fill:#7EB6E0;opacity:.75;animation:rn .7s linear infinite}
.flash{opacity:0;animation:fl 9s linear infinite}
@keyframes fl{0%,93%,100%{opacity:0}94%{opacity:.35}95%{opacity:0}96%{opacity:.22}97%{opacity:0}}
.shoot{opacity:0;animation:sh 23s linear infinite}.shoot2{animation-duration:37s}
@keyframes sh{0%,90%{opacity:0;transform:translate(0,0)}91%{opacity:1}95%{opacity:0;transform:translate(-36px,13px)}100%{opacity:0}}
.leaf{animation:leafx 18s linear infinite}.spin{transform-box:fill-box;transform-origin:center;animation:spin 1.3s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.ff{animation:ffd 7s ease-in-out infinite}.ffb{animation:blink 2.3s ease-in-out infinite}
@keyframes ffd{25%{transform:translate(6px,-3px)}50%{transform:translate(2px,-6px)}75%{transform:translate(-4px,-2px)}}
.pglow{opacity:.3;animation:pg 4s ease-in-out infinite}
@keyframes pg{50%{opacity:.12}}
.bat{animation:bat 14s linear infinite}
.fw{opacity:0;animation:fwk 2.6s ease-out infinite}
@keyframes fwk{0%{transform:scale(.1);opacity:0}8%{opacity:1}65%{transform:scale(1);opacity:.9}100%{transform:scale(1.15);opacity:0}}
.windy .sw{animation-name:sway3;animation-duration:1.8s}
@keyframes sway3{50%{transform:rotate(18deg)}}
`

// --- decor: the costume's own beach props, and what the shell collection unlocked.

const costumeBeach = (costume: Costume, width: number, sea: number, now: number): string => {
  if (width < ROOMY) return ''
  const a = Math.round(width * 0.16)
  const g = GROUND
  switch (costume) {
    case 'pirate': {
      const chest = pixels(['.bbbbbb.', 'bggggggb', 'bbbbbbbb', 'bbbybbbb', 'bbbbbbbb'], { b: '#7A4A26', g: '#F5C542', y: '#F5C542' }, a, g - 5) + `<rect class="spark" x="${a + 9}" y="${g - 7}" width="1" height="1" fill="#F5C542"/>`
      const wx = Math.round(width * 0.74)
      const wreck = wx + 14 < sea ? pixels(['..m.........', '..ms........', '..mss.......', '..msss......', '..m.........', 'hhhhhhhh....', '.hhhhhhhhh..', '..hhhhhhhhh.'], { h: '#6B4423', m: '#5A3519', s: '#E6E2D6' }, wx, g - 8) : ''
      return chest + wreck
    }
    case 'astronaut':
      return `<ellipse class="crater" cx="${a + 4}" cy="${g + 1.4}" rx="5" ry="1.2"/><ellipse class="crater" cx="${Math.round(width * 0.5)}" cy="${g + 1.6}" rx="4" ry="1"/><g><circle cx="${Math.round(width * 0.4)}" cy="9" r="4" fill="#378ADD"/><rect x="${Math.round(width * 0.4) - 2}" y="7" width="2" height="2" fill="#4FA36B"/><rect x="${Math.round(width * 0.4) + 1}" y="10" width="2" height="1" fill="#4FA36B"/></g>`
    case 'chef':
      return pixels(['.kkkkk.', 'krrrrrk', '.kkkkk.', '..k.k..', '.k...k.'], { k: '#3A3936', r: '#E8577A' }, a, g - 5) + [0, 1, 2].map(i => `<rect class="smoke" x="${a + 2 + i}" y="${g - 8}" width="1.5" height="1.5" fill="#B4B2A9" style="${wall(now, 2.4, i * 0.8)}"/>`).join('')
    case 'engineer': {
      const cone = (x: number) => pixels(['..o..', '.owo.', '.ooo.', 'oooooo'], { o: '#F28C3A', w: '#F4F3EE' }, x, g - 4)
      const crane = `<rect x="${a + 20}" y="${g - 16}" width="1" height="16" fill="#F5C542"/><rect x="${a + 14}" y="${g - 16}" width="13" height="1" fill="#F5C542"/><rect x="${a + 25}" y="${g - 15}" width=".5" height="6" fill="#8E929A"/><rect x="${a + 24}" y="${g - 9}" width="2" height="1" fill="#8E929A"/>`
      return cone(a) + cone(a + 7) + crane
    }
    case 'racer':
      return `<rect x="${a}" y="${g - 14}" width="1" height="14" fill="#8E929A"/><g class="flag">${pixels(['wkwkwk', 'kwkwkw', 'wkwkwk', 'kwkwkw'], { w: '#F8F6F1', k: '#1F1E1D' }, a + 1, g - 14)}</g>${pixels(['wkwkwkwkwkwk', 'kwkwkwkwkwkw'], { w: '#F8F6F1', k: '#1F1E1D' }, a + 6, g + 1)}`
    case 'detective':
      return `<circle cx="${a + 3}" cy="${g - 3}" r="2.5" fill="rgba(169,214,245,.7)" stroke="#3A3A3C" stroke-width="1"/><rect x="${a + 5}" y="${g - 1.5}" width="4" height="1.2" fill="#7A4A26"/>${[14, 22, 30].map((dx, i) => `<g opacity="${0.7 - i * 0.2}">${pixels(['.ww.', 'w..w', '..w.', '....', '..w.'], { w: '#7F77DD' }, a + dx, g - 6)}</g>`).join('')}`
    case 'surfer': {
      const board = pixels(['.w.', 'wbw', 'wbw', 'wbw', 'wbw', 'wbw', 'wbw', 'wbw', 'wbw', '.w.'], { w: '#F4F3EE', b: '#378ADD' }, a, g - 10)
      const wx = Math.round(width * 0.5)
      const ball = pixels(['.rwb.', 'rrwbb', 'yywww', 'yyggg', '.ygg.'], { r: '#D8433B', w: '#F4F3EE', b: '#378ADD', y: '#F5C542', g: '#4FA36B' }, wx, g - 5)
      return board + ball
    }
    case 'diver': {
      const fins = pixels(['kkkk.kkkk', '.kk...kk.'], { k: '#F28C3A' }, a, g - 2)
      const bx = Math.min(width - 8, sea + 10)
      const buoy = pixels(['..f..', '..f..', '.rwr.', '.wrw.', 'rrrrr'], { f: '#F5C542', r: '#D8433B', w: '#F4F3EE' }, bx, g - 4)
      return fins + buoy
    }
    case 'viking': {
      const shield = pixels(['.bbbb.', 'bbggbb', 'bggggb', 'bbggbb', '.bbbb.'], { b: '#7A4A26', g: '#F5C542' }, a, g - 5)
      const wx = Math.round(width * 0.74)
      const ship = wx + 18 < sea ? pixels(['........m.........', '.....rwrwrwrw.....', '.....rwrwrwrw.....', '.....rwrwrwrw.....', '........m.........', 'h.......m........h', 'hh..............hh', '.hhhhhhhhhhhhhhhh.', '..hhyhhyhhyhhyhh..', '...hhhhhhhhhhhh...'], { m: '#5A3519', r: '#D8433B', w: '#E6E2D6', h: '#6B4423', y: '#F5C542' }, wx, g - 10) : ''
      return shield + ship
    }
    case 'wizard': {
      const tower = pixels(['s.ss.ss.s', 'sssssssss', 'sssssssss', '.ssssss..', '.ssyyss..', '.ssyyss..', '.ssssss..', '.ssssss..', '.ssssss..', '.ssssss..', '.ssssss..', '.ssssss..', '.ssssss..', 'ssssssss.'], { s: '#8E929A', y: '#F5C542' }, a, g - 14)
      return tower + `<rect class="spark" x="${a + 11}" y="${g - 13}" width="1" height="1" fill="#F5C542"/><rect class="spark" x="${a + 14}" y="${g - 8}" width="1" height="1" fill="#CECBF6"/>`
    }
    case 'dj': {
      const box = (x: number) => pixels(['kkkkkkk', 'kgggggk', 'kgdddgk', 'kgdddgk', 'kgggggk', 'kkkkkkk', 'kgggggk', 'kgdddgk', 'kgdddgk', 'kkkkkkk'], { k: '#5F5E5A', g: '#888780', d: '#3A3936' }, x, g - 10)
      const deck = pixels(['kkkkkkkkkkk', 'kaaakkkaaak', 'kkkkkkkkkkk', '.k.......k.'], { k: '#5F5E5A', a: '#D85A30' }, a + 8, g - 4)
      return box(a) + deck + box(a + 20)
    }
    case 'oktoberfest': {
      const table = pixels(['bbbbbbbbbbbbbbbbbb', 'bbbbbbbbbbbbbbbbbb', '..d............d..', '..d............d..', '..d............d..'], { b: '#A0703F', d: '#6B4423' }, a, g - 5)
      const stein = pixels(['wwww', 'yyyy', 'yyyy'], { w: '#F4F3EE', y: '#F5B731' }, a + 3, g - 8)
      const pretzel = pixels(['.bb.bb.', 'b..b..b', '.bbbbb.', '..b.b..'], { b: '#A0703F' }, a + 10, g - 9)
      const px = Math.round(width * 0.5)
      const flags = ['#378ADD', '#F4F3EE', '#378ADD', '#F4F3EE', '#378ADD'].map((c, i) => `<rect x="${px + i * 5}" y="${g - 16 + (i % 2)}" width="3" height="4" fill="${c}"/>`).join('')
      return table + stein + pretzel + `<rect x="${px}" y="${g - 17}" width="25" height=".5" fill="#8E929A"/>` + flags
    }
    default:
      return ''
  }
}

const unlocked = (width: number, tod: TimeOfDay, shells: number, sea: number): string => {
  const at = spots(width)
  const g = GROUND
  const out: string[] = []
  if (hasDecor('lighthouse', shells, width)) {
    const x = at.lighthouse
    out.push(pixels(['..kkkk..', '.kkkkkk.', '.yyyyyy.', 'kkkkkkkk', '.rrrrrr.', '.wwwwww.', '.rrrrrr.', '.wwwwww.', '.rrrrrr.', '.wwwwww.', '.rrrrrr.', '.wwwwww.', '.rrrrrr.', '.wwwwww.', '.rrrrrr.', 'gggggggg'], { k: '#3A3936', y: '#F5D96A', r: '#D8433B', w: '#F4F3EE', g: '#8E929A' }, x - 4, g - 16))
    if (tod === 'night' || tod === 'evening') out.push(`<polygon class="beam" points="${x},${g - 14} ${x + 70},${g - 21} ${x + 70},${g - 7}" fill="#FFF3B0" style="transform-origin:${x}px ${g - 14}px"/>`)
  }
  if (hasDecor('palm', shells, width)) {
    const x = at.palm
    const trunk = [[0, -2], [0, -4], [1, -6], [1, -8], [2, -10], [2, -12], [3, -14]].map(([dx, dy]) => `<rect x="${x + (dx ?? 0)}" y="${g + (dy ?? 0)}" width="2" height="2" fill="#8A5A2B"/>`).join('')
    out.push(trunk + `<g class="palm" style="transform-origin:${x + 4}px ${g - 15}px">${pixels(['.gg....gg.', 'gggg..gggg', 'g..gggg..g', '...gggg...', '..g.gg.g..', '.g..gg..g.'], { g: '#3E9E5A' }, x - 1, g - 19)}</g><rect x="${x + 3}" y="${g - 15}" width="1.5" height="1.5" fill="#6B4423"/><rect x="${x + 5}" y="${g - 15}" width="1.5" height="1.5" fill="#6B4423"/>`)
  }
  if (hasDecor('chair', shells, width) && at.chair + 12 < sea) {
    const x = at.chair
    out.push(`<rect x="${x + 4}" y="${g - 17}" width="1" height="17" fill="#8E929A"/>${pixels(['....rrwrr....', '..rrwwrrwwr..', '.rrwwrrrwwrr.', 'rrwwrrrrrwwrr'], { r: '#E8577A', w: '#F4F3EE' }, x - 2, g - 20)}${pixels(['........bb', '.......bb.', '......bb..', 'bbbbbbbb..', 'b.....b...'], { b: '#378ADD' }, x - 3, g - 5)}`)
  }
  return out.join('')
}

// The sea at the right end: foam lapping at the shoreline, wavelets drifting in.
const sea = (width: number, x: number, now: number): string => {
  const waves = Array.from({ length: Math.max(1, Math.floor((width - x) / 36)) }, (_, i) =>
    `<rect class="wl" x="${x + 10 + i * 36 + (i % 2) * 9}" y="${GROUND + (i % 3)}" width="4" height=".7" style="${wall(now, 6, i * 1.7)}"/>`).join('')
  return `<g class="tide" style="${wall(now, 5)}"><rect class="wet" x="${x - 9}" y="${GROUND}" width="12" height="${SCENE_H - GROUND}"/><path class="sea" d="M${x} ${GROUND - 2.5} H${width + 6} V${SCENE_H} H${x - 2} Z"/><rect class="sea2" x="${x + 6}" y="${GROUND + 2}" width="${width - x}" height="${SCENE_H - GROUND - 2}"/><rect class="foam" x="${x - 3}" y="${GROUND - 3}" width="7" height="1.6" rx=".8"/><rect class="foam" x="${x - 1}" y="${GROUND}" width="3" height="1" rx=".5"/></g>${waves}`
}

/** The work pile: one block per tool Claude used this turn, coloured by the tool. */
const BLOCK: Record<string, string> = { scroll: '#E9D6A6', magnifier: '#9FC7E8', hammer: '#B07A45', keyboard: '#8E929A', binoculars: '#5A5853', whistle: '#F5C542', other: '#D9C493' }
const workPile = (x0: number, kinds: readonly string[]): string =>
  kinds.slice(0, 15).map((k, i) => {
    const rows = [5, 4, 3, 2, 1]
    let r = 0
    let j = i
    while (r < rows.length - 1 && j >= (rows[r] ?? 0)) j -= rows[r++] ?? 0
    return `<rect x="${r1(x0 + r * 1.6 + j * 3.2)}" y="${GROUND - 2 - r * 2}" width="3" height="2" fill="${BLOCK[k] ?? BLOCK.other}"/>`
  }).join('')

const habitat = (width: number, tod: TimeOfDay, sky: Sky, shore: number, now: number, costume: Costume, shells: number): string => {
  const at = spots(width, shore)
  const pebbles = [0.18, 0.53, 0.72, 0.96].map((p, i) => `<ellipse class="peb" cx="${Math.round(width * p)}" cy="${GROUND + 1.2}" rx="${1.6 + (i % 2)}" ry="1.1"/>`).join('')
  const weed = [0, 4, 8]
    .map((dx, i) => `<path class="sw${i ? ` sw${i + 1}` : ''}" d="M${at.seaweed + dx} ${GROUND} q-3 -${5 + i} 0 -${10 + i * 2} q3 -4 0 -${7 + i}"/>`)
    .join('')
  const glow = tod === 'night' ? `<ellipse class="pglow" cx="${at.pool}" cy="${GROUND + 2}" rx="17" ry="3.4" fill="#9FE3F0"/>` : ''
  const pool = !at.hasPool ? '' : `${glow}<ellipse class="pool" cx="${at.pool}" cy="${GROUND + 2}" rx="14" ry="2.2"/><rect class="shim" x="${at.pool - 6}" y="${GROUND + 1.4}" width="4" height=".6" fill="#fff" opacity=".7"/><rect class="shim tw2" x="${at.pool + 3}" y="${GROUND + 2.4}" width="3" height=".6" fill="#fff" opacity=".6"/>`
  const snowy = sky.season === 'winter' || sky.weather === 'snow'
  const snow = snowy ? `<rect class="snowl" x="0" y="${GROUND - 0.8}" width="${width}" height="2" rx="1"/>${Array.from({ length: Math.floor(width / 60) }, (_, i) => `<ellipse class="snowl" cx="${i * 60 + 23}" cy="${GROUND - 0.6}" rx="5" ry="1.4"/>`).join('')}` : ''
  return `<rect class="sand" x="0" y="${GROUND}" width="${width}" height="${SCENE_H - GROUND}" rx="2"/><rect class="sand2" x="0" y="${GROUND}" width="${width}" height="1"/>${snow}${pool}${pebbles}${weed}${sea(width, at.sea, now)}${holidayDecor(width, tod, sky)}${sky.holiday ? '' : costumeBeach(costume, width, at.sea, now)}${unlocked(width, tod, shells, at.sea)}`
}

const bubbleSvg = (text: string): { svg: string; width: number } => {
  const t = text.length > 34 ? `${text.slice(0, 33)}…` : text
  const width = Math.round(t.length * 4.7 + 10)
  return {
    width,
    svg: `<g class="bubble"><rect class="bub" x="-2" y="0.5" width="${width}" height="11" rx="4" stroke-width=".8"/><path class="bub" d="M7 11.2 l3 2.6 l1 -2.6" stroke-width=".8"/><rect x="6.6" y="10.4" width="5" height="1.4" class="bub" stroke="none"/><text class="bubt" x="${width / 2 - 2}" y="8.6" font-size="7.6" text-anchor="middle" font-family="-apple-system,'SF Pro Text',sans-serif" font-weight="600">${xml(t)}</text></g>`,
  }
}

const RIGHT = 'none'
const LEFT = `translate(${CRAB_W}px,0) scale(-1,1)`

/** Compiles one plan into keyframes; times are ms into the segment. */
const compile = (pl: Plan, width: number, elapsed: number, shore: number) => {
  const D = Math.max(1, pl.duration)
  const fine = (t: number) => `${(Math.max(0, Math.min(100, (t / D) * 100))).toFixed(3)}%`
  const x = (p: number) => xOf(p, width)
  const css: string[] = []
  const anim = (name: string, timing: string) => `animation:${name} ${(D / 1000).toFixed(2)}s ${timing} forwards;animation-delay:-${(elapsed / 1000).toFixed(2)}s`

  const moves = pl.beats.flatMap(b => [`${fine(b.t0)}{transform:translateX(${r1(x(b.p0))}px)}`, `${fine(b.t1)}{transform:translateX(${r1(x(b.p1))}px)}`])
  css.push(`@keyframes mv{${moves.join('')}}.mv{${anim('mv', 'linear')}}`)
  const faces = pl.beats.map(b => `${fine(b.t0)}{transform:${b.face === 1 ? RIGHT : LEFT}}`)
  css.push(`@keyframes fc{${faces.join('')}100%{transform:${pl.endFace === 1 ? RIGHT : LEFT}}}.fc{${anim('fc', 'steps(1,end)')}}`)

  const poses = [...new Set(pl.beats.map(b => b.pose))]
  poses.forEach((pose, i) => {
    const stops = pl.beats.map(b => `${fine(b.t0)}{opacity:${b.pose === pose ? 1 : 0}}`)
    css.push(`@keyframes l${i}{${stops.join('')}}.l${i}{${anim(`l${i}`, 'steps(1,end)')}}`)
  })

  // Marks: each its own keyframes, hidden outside its window.
  const markCss = (name: string, frames: [number, string][]) => {
    const body = frames.map(([t, v]) => `${fine(t)}{${v}}`).join('')
    css.push(`@keyframes ${name}{${body}}.${name}{${anim(name, 'linear')}}`)
  }
  const marks = pl.marks.map((m, i) => {
    const name = `m${i}`
    const hide = 'opacity:0'
    if (m.kind === 'hole') {
      const hx = x(m.p0) + (m.dir === 1 ? CRAB_W + 1 : -1)
      markCss(name, [[0, hide], [m.t0 - 1, hide], [m.t0, 'opacity:.9'], [m.t1, hide]])
      return `<ellipse class="hole ${name}" cx="${r1(hx)}" cy="${GROUND + 1.3}" rx="3" ry="1" opacity="0"/>`
    }
    if (m.kind === 'butterfly') {
      const a = x(m.p0) + m.dir * 30 + CRAB_W / 2
      const b = x(m.p1) + m.dir * 28 + CRAB_W / 2
      const flyEnd = Math.max(m.t0 + 1, m.t1 - 1600)
      markCss(name, [[0, `${hide};transform:translate(${r1(a)}px,12px)`], [m.t0 - 1, `${hide};transform:translate(${r1(a)}px,12px)`], [m.t0, `opacity:1;transform:translate(${r1(a)}px,12px)`], [flyEnd, `opacity:1;transform:translate(${r1(b)}px,10px)`], [m.t1, `opacity:0;transform:translate(${r1(b + m.dir * 30)}px,-8px)`]])
      return `<g class="${name}" opacity="0"><g class="flut"><rect x="-.5" y="-1" width="1" height="3" fill="#3A3936"/><rect class="wing" x="-3" y="-2" width="2.5" height="2.5" fill="#F5A3C7"/><rect class="wing" x=".5" y="-2" width="2.5" height="2.5" fill="#F7C9A3"/></g></g>`
    }
    if (m.kind === 'seagull') {
      markCss(name, [[0, `${hide};transform:translate(${width + 12}px,4px)`], [m.t0 - 1, `${hide};transform:translate(${width + 12}px,4px)`], [m.t0, `opacity:1;transform:translate(${width + 12}px,4px)`], [(m.t0 + m.t1) / 2, `opacity:1;transform:translate(${r1(x(m.p0) + CRAB_W / 2)}px,7px)`], [m.t1, `opacity:1;transform:translate(-20px,3px)`], [m.t1 + 1, hide]])
      return `<g class="${name}" opacity="0"><g fill="#8E929A"><rect class="wing" x="-5" y="-2" width="4" height="1.4"/><rect class="wing" x="1" y="-2" width="4" height="1.4"/><rect x="-1.5" y="-1" width="3" height="2" fill="#E6E8EE"/><rect x="-2.6" y="-.6" width="1.2" height=".8" fill="#F5C542"/></g></g>`
    }
    if (m.kind === 'fish') {
      const at = spots(width, shore)
      const cx = at.hasPool ? at.pool : Math.min(width - 6, at.sea + 16)
      const mid = (m.t0 + m.t1) / 2
      markCss(name, [[0, `${hide};transform:translate(${cx - 6}px,${GROUND + 1}px)`], [m.t0 - 1, `${hide};transform:translate(${cx - 6}px,${GROUND + 1}px)`], [m.t0, `opacity:1;transform:translate(${cx - 6}px,${GROUND + 1}px) rotate(-50deg)`], [mid, `opacity:1;transform:translate(${cx}px,${GROUND - 13}px) rotate(0deg)`], [m.t1, `opacity:1;transform:translate(${cx + 6}px,${GROUND + 1}px) rotate(60deg)`], [m.t1 + 1, hide]])
      return `<g class="${name}" opacity="0"><rect x="-3" y="-1" width="5" height="2" fill="#F28C3A"/><rect x="2" y="-1.5" width="1.5" height="3" fill="#F5B731"/><rect x="-2.2" y="-.6" width=".8" height=".8" fill="#1F1E1D"/></g>`
    }
    if (m.kind === 'fireworks') {
      markCss(name, [[0, hide], [m.t0, 'opacity:1'], [m.t1 - 400, 'opacity:1'], [m.t1, hide]])
      return `<g class="${name}" opacity="0">${fireworks(width, 6, 1.4, i => `animation-delay:-${(i * 0.23).toFixed(2)}s`)}</g>`
    }
    if (m.kind === 'storm') {
      const cx = x(m.p0) + CRAB_W / 2
      const drops = Array.from({ length: 7 }, (_, i) => `<rect class="srain" x="${r1(cx - 9 + i * 3)}" y="9" width=".7" height="2.5" style="animation-delay:-${(i * 0.11).toFixed(2)}s"/>`).join('')
      const cloud = CLOUD.flatMap((row, dy) => [...row].map((c, dx) => (c === 'w' ? `<rect x="${r1(cx - 11 + dx * 2)}" y="${1 + dy * 2}" width="2" height="2"/>` : ''))).join('')
      markCss(name, [[0, hide], [m.t0, 'opacity:1'], [m.t1 - 300, 'opacity:1'], [m.t1, hide]])
      return `<g class="${name}" opacity="0"><g class="scloud">${cloud}</g>${drops}<rect class="sbolt" x="${r1(cx + 3)}" y="9" width="1" height="4" fill="#F5C542"/></g>`
    }
    if (m.kind === 'plane') {
      const banner = `<g class="plane-body"><rect x="0" y="0" width="7" height="2" fill="#E6E8EE"/><rect x="5" y="-1" width="2" height="1" fill="#D85A30"/><rect x="2" y="-1.5" width="2" height="5" fill="#C9CCD2"/><rect class="prop" x="7" y="-.5" width=".8" height="3" fill="#3A3936"/></g><rect x="-6" y="1" width="6" height=".4" fill="#8E929A"/><g><rect x="-34" y="-2.5" width="28" height="7.5" rx="1" fill="#fff" stroke="#E8577A" stroke-width=".6"/><text x="-20" y="3.4" font-size="6" text-anchor="middle" font-family="-apple-system,'SF Pro Text',sans-serif" font-weight="700" fill="#E8577A">done!</text></g>`
      markCss(name, [[0, `${hide};transform:translate(-10px,6px)`], [m.t0, `opacity:1;transform:translate(-10px,6px)`], [m.t1, `opacity:1;transform:translate(${width + 40}px,4px)`], [m.t1 + 1, hide]])
      return `<g class="${name}" opacity="0">${banner}</g>`
    }
    if (m.kind === 'friend' && m.meet !== undefined && m.part !== undefined) {
      const fx = (p: number) => r1(x(p) - CRAB_W - 4)
      const arrive = m.t0 + 3000
      markCss(name, [[0, `${hide};transform:translateX(-34px)`], [m.t0 - 1, `${hide};transform:translateX(-34px)`], [m.t0, `opacity:1;transform:translateX(-34px)`], [arrive, `opacity:1;transform:translateX(${fx(m.p0)}px)`], [m.meet, `opacity:1;transform:translateX(${fx(m.p0)}px)`], [m.part, `opacity:1;transform:translateX(${fx(m.p1)}px)`], [m.t1, `opacity:1;transform:translateX(-34px)`], [m.t1 + 1, hide]])
      const play = m.variant === 'dance' ? 'dance' : m.variant === 'sky' ? 'skywatch' : 'chase'
      const blue = (pose: Pose) => crab('plain', pose).split(CLAY).join('#5B8FD9')
      const layer = (cls: string, pose: Pose) => `<g class="${cls}"><g transform="scale(${SCALE})" shape-rendering="crispEdges">${blue(pose)}</g></g>`
      const step = (on: [number, number][]) => on.map(([t, v]) => `${fine(t)}{opacity:${v}}`).join('')
      css.push(`@keyframes ${name}a{${step([[0, 1], [arrive, 0], [m.part, 1]])}}.${name}a{${anim(`${name}a`, 'steps(1,end)')}}`)
      css.push(`@keyframes ${name}b{${step([[0, 0], [arrive, 1], [m.meet, 0], [m.part, 0]])}}.${name}b{${anim(`${name}b`, 'steps(1,end)')}}`)
      css.push(`@keyframes ${name}c{${step([[0, 0], [m.meet, 1], [m.part, 0]])}}.${name}c{${anim(`${name}c`, 'steps(1,end)')}}`)
      css.push(`@keyframes ${name}f{${fine(0)}{transform:none}${fine(m.part)}{transform:${LEFT}}}.${name}f{${anim(`${name}f`, 'steps(1,end)')}}`)
      return `<g class="${name}" opacity="0"><g transform="translate(0,${CRAB_Y})"><g class="${name}f">${layer(`${name}a`, 'wander')}${layer(`${name}b`, 'wave')}${layer(`${name}c`, play)}</g></g></g>`
    }
    if (m.kind === 'neighbour') {
      const stay = x(m.p0) + CRAB_W + 4
      const out = width + 8
      const arrive = Math.min(m.t1, m.t0 + 2200)
      const leave = Math.max(arrive, m.t1 - 2300)
      markCss(name, [[0, `${hide};transform:translateX(${out}px)`], [m.t0 - 1, `${hide};transform:translateX(${out}px)`], [m.t0, `opacity:1;transform:translateX(${out}px)`], [arrive, `opacity:1;transform:translateX(${r1(stay)}px)`], [leave, `opacity:1;transform:translateX(${r1(stay)}px)`], [m.t1, `opacity:1;transform:translateX(${out}px)`], [m.t1 + 1, hide]])
      return `<g class="${name}" opacity="0"><g class="run stroll">${pixels(['..ddd...', '.dpwpd..', 'dpwpwpd.', 'dpppppde', '.lllll..'], { d: '#9C8B9E', p: '#C9B8CC', w: '#E6DCE8', e: '#1F1E1D', l: '#D97757' }, 0, GROUND - 5)}</g></g>`
    }
    if (m.kind === 'poof') {
      const cx = x(m.p0) + CRAB_W / 2
      const y = m.variant === 'muzzle' ? GROUND - 13 : GROUND - 6
      markCss(name, [[0, hide], [m.t0 - 1, hide], [m.t0, 'opacity:.95;transform:scale(.5)'], [m.t1, 'opacity:0;transform:scale(1.5)'], [m.t1 + 1, hide]])
      const puffs = [[-9, 2, 5], [-3, -3, 7], [5, 0, 6], [-5, 3, 6], [3, 4, 5]] as const
      return `<g class="${name}" opacity="0" style="transform-origin:${r1(cx)}px ${y}px">${puffs.map(([dx, dy, w]) => `<rect x="${r1(cx + dx)}" y="${y + dy}" width="${w}" height="${w - 1}" rx="1.5" fill="#E8E5DD"/>`).join('')}</g>`
    }
    if (m.kind === 'disco') {
      const cx = x(m.p0) + CRAB_W / 2
      const ball = pixels(['..s..', '..s..', '.wbw.', 'wyrbw', 'wbwyw', '.wrw.'], { s: '#8E929A', w: '#F4F3EE', b: '#378ADD', y: '#F5C542', r: '#E8577A' }, Math.round(cx) - 2, 0)
      const colors = ['#E8577A', '#F5C542', '#378ADD', '#1D9E75', '#7F77DD']
      const lights = Array.from({ length: 10 }, (_, i) => `<rect class="spark${i % 2 ? ' spark2' : ''}" x="${r1(Math.max(0, Math.min(width - 6, cx - 64 + i * 13)))}" y="${GROUND + (i % 3)}" width="6" height="1.4" fill="${colors[i % colors.length] ?? '#F5C542'}"/>`).join('')
      markCss(name, [[0, hide], [m.t0 - 1, hide], [m.t0, 'opacity:1;transform:translateY(-8px)'], [m.t0 + 900, 'opacity:1;transform:translateY(0)'], [m.t1 - 700, 'opacity:1;transform:translateY(0)'], [m.t1, 'opacity:0;transform:translateY(-8px)'], [m.t1 + 1, hide]])
      return `<g class="${name}" opacity="0" shape-rendering="crispEdges">${ball}${lights}</g>`
    }
    if (m.kind === 'cannon') {
      // The ball flies out from the muzzle in an arc and splashes in the sea.
      const from = x(m.p0) + 44
      const to = Math.max(from + 40, Math.min(width - 10, spots(width, shore).sea + 18))
      const at = (k: number) => `opacity:1;transform:translate(${r1(from + (to - from) * k)}px,${r1(GROUND - 13 - 32 * k * (1 - k) * 3 + 13 * k)}px)`
      const span = m.t1 - m.t0
      markCss(name, [[0, hide], [m.t0 - 1, hide], ...[0, 0.25, 0.5, 0.75, 1].map((k): [number, string] => [m.t0 + span * k, at(k)]), [m.t1 + 1, hide]])
      const splash = `${name}s`
      markCss(splash, [[0, hide], [m.t1 - 1, hide], [m.t1, `opacity:1;transform:translate(${r1(to)}px,${GROUND - 1}px) scaleY(.4)`], [m.t1 + 400, `opacity:1;transform:translate(${r1(to)}px,${GROUND - 1}px) scaleY(1)`], [m.t1 + 900, `opacity:0;transform:translate(${r1(to)}px,${GROUND - 1}px) scaleY(1.2)`], [m.t1 + 901, hide]])
      return `<g class="${name}" opacity="0" shape-rendering="crispEdges"><rect x="-1.5" y="-1.5" width="3" height="3" fill="#3A3936"/></g><g class="${splash}" opacity="0" shape-rendering="crispEdges">${pixels(['.w...w.', 'w..w..w', '.w.w.w.', '..www..'], { w: '#F4F3EE' }, -3, -4)}</g>`
    }
    return ''
  }).join('')

  // Up off the sand and down again, and whatever it holds is put away for the ride.
  const lifted = pl.beats.flatMap((b, i) => {
    const prev = pl.beats[i - 1]
    if (!b.y0 && !b.y1 && !prev?.y0 && !prev?.y1) return []
    return [`${fine(b.t0)}{transform:translateY(${r1(-(b.y0 ?? 0))}px)}`, `${fine(b.t1)}{transform:translateY(${r1(-(b.y1 ?? 0))}px)}`]
  })
  if (lifted.length) css.push(`@keyframes ly{${lifted.join('')}}.ly{${anim('ly', 'linear')}}`)
  const rides = pl.beats.some(b => b.pose === 'ride')
  if (rides) css.push(`@keyframes nr{${pl.beats.map(b => `${fine(b.t0)}{opacity:${b.pose === 'ride' ? 0 : 1}}`).join('')}}.nr{${anim('nr', 'steps(1,end)')}}`)

  return { css: css.join('\n'), poses, marks }
}

// Footprints: dots where it walked, each fading on its own. Only the ones still
// to come or still fading are drawn.
const footprints = (pl: Plan, width: number, elapsed: number): string => {
  const walks = pl.beats.filter(b => isWalking(b.pose) && b.p0 !== b.p1)
  const total = walks.reduce((s, b) => s + Math.abs(xOf(b.p1, width) - xOf(b.p0, width)), 0)
  const step = Math.max(7, total / MAX_PRINTS)
  const out: string[] = []
  for (const b of walks) {
    const x0 = xOf(b.p0, width)
    const d = Math.abs(xOf(b.p1, width) - x0)
    const dir = b.p1 > b.p0 ? 1 : -1
    for (let k = 1; k * step < d; k++) {
      const tp = b.t0 + ((k * step) / d) * (b.t1 - b.t0)
      if (tp + PRINT_MS < elapsed) continue
      const cx = x0 + dir * k * step + CRAB_W / 2
      const y = GROUND + (k % 2 ? 1.6 : 2.8)
      out.push(`<rect class="fp fpd" x="${r1(cx - 4)}" y="${y}" width="1.2" height=".9" style="animation-delay:${((tp - elapsed) / 1000).toFixed(2)}s"/><rect class="fp fpd" x="${r1(cx + 3)}" y="${y}" width="1.2" height=".9" style="animation-delay:${((tp - elapsed) / 1000).toFixed(2)}s"/>`)
    }
  }
  return out.join('')
}

export const sceneSvg = (s: SceneInput): string => {
  const width = Math.max(120, Math.round(s.width))
  const height = Math.max(SCENE_H, Math.round(s.height ?? SCENE_H))
  // The tank's extra sky sits above y 0, so the beach keeps its own coordinates.
  const top = SCENE_H - height
  const sy = (y: number): number => Math.round(skyY(top)(y))
  const pl = planOf(s.seg)
  const elapsed = Math.max(0, Math.min(pl.duration, s.now - s.seg.startAt))
  const here = whereAt(pl, elapsed)
  const shore = s.seg.shore ?? NO_CONTEXT_SHORE
  const { css, poses, marks } = compile(pl, width, elapsed, shore)
  const at = spots(width, shore)

  // The pile disappears once the crab picks it up.
  const tidy = pl.marks.find(m => m.kind === 'pile')
  const pileGone = tidy !== undefined && elapsed >= tidy.t0
  const work = s.work.length && !pileGone
    ? `<g class="${tidy ? 'wpile' : ''}" shape-rendering="crispEdges">${workPile(at.pile, s.work)}</g>`
    : ''
  const workCss = tidy && !pileGone
    ? `@keyframes wpile{0%{opacity:1}${(tidy.t0 / pl.duration * 100).toFixed(3)}%{opacity:0}100%{opacity:0}}.wpile{animation:wpile ${(pl.duration / 1000).toFixed(2)}s steps(1,end) forwards;animation-delay:-${(elapsed / 1000).toFixed(2)}s}`
    : ''

  const castleMark = pl.marks.find(m => m.kind === 'castle')
  const stage = Math.min(MAX_CASTLE, s.seg.castle)
  const castleSvg = castleMark && stage < MAX_CASTLE
    ? `<g class="cold">${castle(at.castle, stage)}</g><g class="cnew" opacity="${elapsed >= castleMark.t1 ? 1 : 0}">${castle(at.castle, stage + 1)}</g>`
    : castle(at.castle, stage)
  const castleCss = castleMark && stage < MAX_CASTLE
    ? `@keyframes cnew{0%{opacity:0}${(castleMark.t1 / pl.duration * 100).toFixed(3)}%{opacity:1}100%{opacity:1}}.cnew{animation:cnew ${(pl.duration / 1000).toFixed(2)}s steps(1,end) forwards;animation-delay:-${(elapsed / 1000).toFixed(2)}s}`
    : ''

  const shellMark = pl.marks.find(m => m.kind === 'shell')
  const kept = Math.min(PILE_MAX, s.seg.shells)
  const gold = (x: number, y: number) => `<rect x="${x + 1}" y="${y}" width="1" height="1" fill="#F5C542"/><rect x="${x}" y="${y + 1}" width="3" height="1" fill="#F5C542"/><rect class="spark" x="${x + 3}" y="${y - 1}" width="1" height="1" fill="#FFF3B0"/>`
  const pile = Array.from({ length: kept }, (_, i) => pileShell(i)).join('') + ((s.seg.golden ?? 0) > 0 ? gold(7, GROUND - 10) : '')
  const found = !shellMark ? '' : shellMark.variant === 'gold'
    ? `<g class="snew" opacity="${elapsed >= shellMark.t0 ? 1 : 0}">${gold(7, GROUND - 10)}</g>`
    : kept < PILE_MAX ? `<g class="snew" opacity="${elapsed >= shellMark.t0 ? 1 : 0}">${pileShell(kept)}</g>` : ''
  const shellCss = shellMark && (kept < PILE_MAX || shellMark.variant === 'gold')
    ? `@keyframes snew{0%{opacity:0}${(shellMark.t0 / pl.duration * 100).toFixed(3)}%{opacity:1}100%{opacity:1}}.snew{animation:snew ${(pl.duration / 1000).toFixed(2)}s steps(1,end) forwards;animation-delay:-${(elapsed / 1000).toFixed(2)}s}`
    : ''

  const kick = pl.marks.find(m => m.kind === 'pebble')
  const pebble = `<ellipse class="peb${kick ? ' kpeb' : ''}" cx="${at.pebble}" cy="${GROUND + 0.8}" rx="2.2" ry="1.5"/>`
  const pebbleCss = kick
    ? (() => {
        const p = (t: number) => `${(Math.max(0, Math.min(100, (t / pl.duration) * 100))).toFixed(3)}%`
        return `@keyframes kpeb{0%{transform:none;opacity:1}${p(kick.t0)}{transform:none;opacity:1}${p(kick.t0 + 900)}{transform:translateX(24px);opacity:1}${p(kick.t1 - 600)}{transform:translateX(24px);opacity:0}${p(kick.t1)}{transform:none;opacity:0}${p(kick.t1 + 800)}{transform:none;opacity:1}100%{transform:none;opacity:1}}.kpeb{animation:kpeb ${(pl.duration / 1000).toFixed(2)}s ease-out forwards;animation-delay:-${(elapsed / 1000).toFixed(2)}s}`
      })()
    : ''

  const bubble = s.bubble ? bubbleSvg(s.bubble) : null
  const xNow = xOf(here.p, width)
  const bubbleX = bubble ? Math.max(2 - xNow, Math.min(0, width - 2 - bubble.width - xNow)) : 0

  const layers = poses.map((pose, i) => {
    const look = { ...s.look, hasNightcap: s.timeOfDay === 'night' && pose === 'nap', isDark: s.timeOfDay === 'night' || s.timeOfDay === 'evening' }
    return `<g class="l${i}" opacity="${pose === here.pose ? 1 : 0}"><g transform="scale(${SCALE})" shape-rendering="crispEdges">${crab(s.costume, pose, look)}</g></g>`
  })
  const uprights = poses.map((pose, i) => {
    const o = overlay(pose)
    return o ? `<g class="l${i}" opacity="${pose === here.pose ? 1 : 0}">${o}</g>` : ''
  })
  const held = (inner: string) => `<g class="nr" opacity="${here.pose === 'ride' ? 0 : 1}"><g transform="scale(${SCALE})" shape-rendering="crispEdges">${inner}</g></g>`
  const prop = s.prop ? held(propSvg(s.prop)) : ''
  const umbrella = isWet(s.sky) ? held(umbrellaSvg()) : ''
  const skyCss = `@keyframes clx{from{transform:translateX(-14px)}to{transform:translateX(${width + 4}px)}}@keyframes bat{0%{transform:translate(-8px,${sy(6)}px)}25%{transform:translate(${Math.round(width * 0.3)}px,${sy(3)}px)}50%{transform:translate(${Math.round(width * 0.55)}px,${sy(9)}px)}75%{transform:translate(${Math.round(width * 0.8)}px,${sy(4)}px)}100%{transform:translate(${width + 8}px,${sy(7)}px)}}`
  const faceNow = here.face === 1 ? '' : ` transform="translate(${CRAB_W},0) scale(-1,1)"`

  const fit = s.fill ? `width="${FILL_W}" height="${height}" viewBox="0 ${top} ${width} ${height}" preserveAspectRatio="none"` : `width="${width}" height="${height}" viewBox="0 ${top} ${width} ${height}"`

  return `<svg xmlns="http://www.w3.org/2000/svg" ${fit}><style>${CRAB_CSS}${SCENE_CSS}${SKY_CSS}${skyCss}${css}${castleCss}${shellCss}${pebbleCss}${workCss}
@media (prefers-reduced-motion: reduce){*{animation:none!important}.z,.hrt{opacity:.6}}</style>
<g${s.sky.isWindy ? ' class="windy"' : ''}>${skyBack(width, s.timeOfDay, s.sky, s.hour, s.now, top)}${habitat(width, s.timeOfDay, s.sky, shore, s.now, s.costume, s.seg.shells)}${footprints(pl, width, elapsed)}
<g shape-rendering="crispEdges">${pile}${found}${pixels(SHELL, SHELL_COLORS, HOME_SHELL_X, GROUND - 7)}${castleSvg}${work}</g>${pebble}${marks}
<g class="mv" transform="translate(${r1(xNow)},0)"><g transform="translate(0,${CRAB_Y})">
<ellipse cx="${CRAB_W / 2}" cy="${GROUND - CRAB_Y + 0.6}" rx="${CRAB_W / 2 - 3}" ry="1.4" fill="#000" opacity=".12"/>
<g class="ly" transform="translate(0,${r1(-here.lift)})"><g class="fc"${faceNow}>${layers.join('')}${prop}${umbrella}</g>${uprights.join('')}</g>
${bubble ? `<g transform="translate(${r1(bubbleX)},-${CRAB_Y})">${bubble.svg}</g>` : ''}</g></g>
${skyFront(width, s.timeOfDay, s.sky, s.now, top)}</g>
</svg>`
}
