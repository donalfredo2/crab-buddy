// The beach in a terminal, which draws no SVG: coloured half-block cells, two
// pixels stacked in each, one pixel to a column. The same life plan drives it,
// scaled to the terminal's width, so the crab does what it does on the desktop.
// Empty cells keep the terminal's own colours, so it stays see-through.

import type { Beach, Pose, Segment, TimeOfDay } from '../types'
import { CRAB_W, MARK_SHORE, MAX_RODS, NO_CONTEXT_SHORE, ZONES, hasDecor, isWalking, layoutOf, planOf, whereAt, xOf } from './life'
import type { Layout } from './life'
import { moonLit } from './sky'
import type { Sky } from './sky'
import { gadgetPixels } from './gadgets'
import { CRAB_CELLS, cellsOf, downsample } from './pixelart'
import type { Fineness, Rect, Sprite } from './pixelart'
import { INK, crabRects, isSeated } from './sprites'
import { isUnsafeChar } from './text'
import type { Costume, CrabLook } from './sprites'

/** The terminal's own colour, for a cell or half a cell with nothing in it. */
const NONE = 0x01000000
const UPPER = 0x2580
const LOWER = 0x2584
const hex = (c: string): number => parseInt(c.slice(1), 16)
const PLANK = hex('#E9D6A6')
const PLANK_INK = hex('#3A3936')

export type TerminalInput = {
  columns: number
  rows: number
  now: number
  seg: Segment
  costume: Costume
  timeOfDay: TimeOfDay
  sky: Sky
  bubble: string | null
  beach?: Beach
  /** How it looks: tired, grumpy, hungry. */
  look?: CrabLook
}

const BOUNCY = new Set(['dance', 'wave', 'cheer', 'party', 'play', 'love'])

// Rows above the ground to the crab's eyes, where words beside its head go.
const EYES: Record<Fineness, number> = { strip: 4, tank: 7 }
// How high a lifted leg goes in the crab's grid: enough to leave its cell, a step.
const STEP_UP: Record<Fineness, number> = { strip: 3, tank: 2 }

const TERMINAL_INK = '#3A3936'
const sprites = new Map<string, Sprite>()

/** The crab as the desktop draws it, scaled to cells: its costume, its pose, its gadget. */
const spriteOf = (costume: Costume, pose: Pose, look: CrabLook, fineness: Fineness, isStep: boolean, ride: Costume | null): Sprite => {
  const key = JSON.stringify([costume, pose, look, fineness, isStep, ride])
  const kept = sprites.get(key)
  if (kept) return kept
  const rects: Rect[] = []
  if (ride) {
    const g = gadgetPixels(ride)
    rects.push(...g.back)
    if (!g.hideCrab) {
      for (const r of crabRects(costume, 'ride', look)) {
        const isLeg = r.cls === 'la' || r.cls === 'lb'
        if ((isLeg && !g.legs) || (g.bare && r.cls === 'it')) continue
        rects.push({ ...r, y: r.y + (g.dy ?? 0) })
      }
    }
    rects.push(...g.front)
  } else {
    const seated = isSeated(pose)
    for (const r of crabRects(costume, pose, look)) {
      const isLeg = r.cls === 'la' || r.cls === 'lb'
      if (isLeg && seated) continue
      // Sitting, it sinks onto the sand; walking, one set of legs is up while the other is down.
      rects.push({ ...r, y: r.y + (seated ? 3 : 0) - (isStep && r.cls === 'la' ? STEP_UP[fineness] : 0) })
    }
  }
  // The desktop's near-black ink vanishes on a dark terminal; this one shows on dark and light alike.
  const sprite = downsample(rects.map(r => (r.c === INK ? { ...r, c: TERMINAL_INK } : r)), fineness)
  if (sprites.size > 400) sprites.clear()
  sprites.set(key, sprite)
  return sprite
}

/** A speech bubble as cells: one character each, so only narrow ones, and no emoji. */
export const cellText = (text: string): string =>
  [...text.replace(/♥/g, '<3')].filter(c => (c.codePointAt(0) ?? 0) < 0x2100 && c !== '️' && !isUnsafeChar(c)).join('').replace(/\s+/g, ' ').trim()

/** Where words beside the crab's head start: right of it when there's room, else left. */
const wordsAt = (crabX: number, crabW: number, length: number, W: number): number =>
  crabX + crabW + 2 + length <= W ? crabX + crabW + 2 : Math.max(0, crabX - length - 2)

// What the shells unlocked, in a few cells each.
type Put = (x: number, y: number, c: string) => void

const fiveShells = (put: Put, own: Layout, x: number, G: number): void => {
  switch (own.decor.palm) {
    case 'palm':
      for (let y = G - 3; y <= G - 1; y++) put(x, y, '#8A5A2B')
      for (const dx of [-1, 0, 1]) put(x + own.lean + dx, G - 4, '#3E9E5A')
      return
    case 'flamingo':
      put(x, G - 1, '#D9577F')
      put(x, G - 2, '#F28CA8')
      put(x + 1, G - 2, '#F28CA8')
      put(x - 1, G - 3, '#F28CA8')
      put(x - 1, G - 4, '#F28CA8')
      put(x, G - 4, '#3A3936')
      return
    case 'lifebuoy':
      put(x, G - 1, '#8A5A2B')
      put(x, G - 3, '#8A5A2B')
      put(x, G - 4, '#D8433B')
      put(x, G - 2, '#D8433B')
      for (const dx of [-1, 1]) {
        put(x + dx, G - 4, '#D8433B')
        put(x + dx, G - 3, '#F4F3EE')
        put(x + dx, G - 2, '#D8433B')
      }
  }
}

const tenShells = (put: Put, own: Layout, x: number, G: number, isLit: boolean): void => {
  switch (own.decor.chair) {
    case 'chair':
      for (const dx of [-1, 0, 1]) put(x + dx, G - 1, '#378ADD')
      put(x, G - 2, '#8E929A')
      put(x, G - 3, '#8E929A')
      for (const dx of [-2, -1, 0, 1, 2]) put(x + dx, G - 4, dx % 2 ? '#F4F3EE' : own.stripe)
      return
    case 'strandkorb':
      for (let dx = -2; dx <= 2; dx++) {
        const isSide = dx === -2 || dx === 2
        put(x + dx, G - 1, '#C9A25E')
        put(x + dx, G - 2, isSide ? '#C9A25E' : own.stripe)
        put(x + dx, G - 3, isSide ? '#C9A25E' : '#F4F3EE')
        put(x + dx, G - 4, '#C9A25E')
      }
      return
    case 'hammock':
      for (let y = G - 3; y <= G - 1; y++) {
        put(x - 2, y, '#8A5A2B')
        put(x + 2, y, '#8A5A2B')
      }
      put(x - 1, G - 3, own.stripe)
      put(x, G - 2, own.stripe)
      put(x + 1, G - 3, own.stripe)
      return
    case 'armchair':
      for (const dx of [-2, -1, 0]) {
        put(x + dx, G - 1, '#94505C')
        put(x + dx, G - 2, '#7A3B46')
      }
      put(x - 2, G - 3, '#7A3B46')
      put(x, G - 3, '#7A3B46')
      for (let y = G - 3; y <= G - 1; y++) put(x + 2, y, '#3A3936')
      for (const dx of [1, 2, 3]) put(x + dx, G - 4, isLit ? '#F5D96A' : '#EAD9B0')
  }
}

const twentyShells = (put: Put, own: Layout, x: number, G: number, isLit: boolean): void => {
  const pane = isLit ? '#F5D96A' : '#A9D6F5'
  switch (own.decor.house) {
    case 'house':
      for (let dx = 0; dx < 5; dx++) {
        put(x + dx, G - 1, dx === 3 ? '#8A5A2B' : '#F0E2C4')
        put(x + dx, G - 2, dx === 1 ? pane : dx === 3 ? '#8A5A2B' : '#F0E2C4')
        put(x + dx, G - 3, own.roof)
      }
      for (const dx of [1, 2, 3]) put(x + dx, G - 4, own.roof)
      return
    case 'tower':
      for (let dx = 0; dx < 5; dx++) {
        put(x + dx, G - 4, own.roof)
        put(x + dx, G - 3, dx === 0 || dx === 4 ? '#F4F3EE' : pane)
      }
      for (const dx of [0, 4]) {
        put(x + dx, G - 2, '#8A5A2B')
        put(x + dx, G - 1, '#8A5A2B')
      }
      put(x + 2, G - 2, '#8E929A')
      return
    case 'hut':
      for (let dx = 0; dx < 5; dx++) {
        put(x + dx, G - 1, dx === 2 ? '#8A5A2B' : dx % 2 ? '#F4F3EE' : own.roof)
        put(x + dx, G - 2, dx === 2 ? pane : dx % 2 ? '#F4F3EE' : own.roof)
        put(x + dx, G - 3, own.roof)
      }
      for (const dx of [1, 2, 3]) put(x + dx, G - 4, own.roof)
      return
    case 'vending':
      for (const dx of [1, 2, 3]) {
        put(x + dx, G - 4, dx === 2 ? '#F4F3EE' : own.roof)
        put(x + dx, G - 3, pane)
        put(x + dx, G - 2, pane)
        put(x + dx, G - 1, own.roof)
      }
      put(x + 2, G - 2, '#D8433B')
  }
}

const fortyShells = (put: Put, own: Layout, x: number, G: number): void => {
  switch (own.decor.boat) {
    case 'rowboat':
      for (let dx = 0; dx < 5; dx++) put(x + dx, G - 1, own.roof)
      put(x, G - 2, own.roof)
      put(x + 4, G - 2, own.roof)
      put(x + 2, G - 2, '#F4F3EE')
      put(x + 3, G - 3, '#8A5A2B')
      return
    case 'dinghy':
      for (let dx = 0; dx < 5; dx++) put(x + dx, G - 1, own.roof)
      for (let y = G - 4; y <= G - 2; y++) put(x + 2, y, '#8A5A2B')
      put(x + 3, G - 3, own.stripe)
      put(x + 3, G - 2, own.stripe)
      put(x + 4, G - 2, own.stripe)
      return
    case 'swan':
      for (let dx = 0; dx < 5; dx++) put(x + dx, G - 1, '#4A7FB5')
      for (const dx of [0, 1, 2, 3]) put(x + dx, G - 2, '#D9D6CC')
      put(x + 3, G - 3, '#D9D6CC')
      put(x + 3, G - 4, '#D9D6CC')
      put(x + 4, G - 4, '#F28C3A')
  }
}

/** The pixels of the beach, `columns` wide and `rows * 2` tall, NONE where empty, and where the crab is. */
export const beachPixels = (t: TerminalInput): { px: number[]; crabX: number; crabW: number; headRow: number } => {
  const W = Math.max(8, Math.round(t.columns))
  const H = Math.max(2, Math.round(t.rows)) * 2
  const G = H - 1
  const px = Array.from({ length: W * H }, () => NONE)
  const put = (x: number, y: number, c: string | number) => {
    const xi = Math.round(x)
    if (xi >= 0 && xi < W && y >= 0 && y < H) px[y * W + xi] = typeof c === 'number' ? c : hex(c)
  }
  const now = t.now
  const tick = Math.floor(now / 250)
  const sec = Math.floor(now / 1000)
  const sky = t.sky
  const grey = sky.weather !== 'clear' && sky.weather !== 'fog'
  // The sky above the crab's head: the tank's taller raster spreads it out.
  const skyH = Math.max(1, G - 4)

  if (t.timeOfDay === 'night') {
    if (!grey) {
      const n = Math.max(3, Math.round((W * skyH) / 40))
      // An R2 sequence: spread out, never in rows or lines.
      for (let i = 0; i < n; i++) if ((sec + i) % 5) put(((0.5 + i * 0.7548777) % 1) * (W - 6), Math.floor(((0.5 + i * 0.5698403) % 1) * skyH), '#F3E7B5')
    }
    put(W - 5, 0, '#F3E7B5')
    if (moonLit(sky.moon) > 0.4) put(W - 4, 0, '#F3E7B5')
  } else if (t.timeOfDay === 'evening') {
    const f = Math.max(0, Math.min(1, (new Date(now).getHours() + new Date(now).getMinutes() / 60 - 18) / 4))
    if (!grey) put(W - 8, Math.round(f * G), '#F28C3A')
  } else if (!grey) {
    put(W - 5, 0, '#F5C542')
    put(W - 4, 0, '#F5C542')
  }
  if (t.timeOfDay !== 'night' || grey) {
    const n = (grey ? 3 : 2) + Math.floor(skyH / 6)
    const period = sky.isWindy ? 40 : 120
    for (let i = 0; i < n; i++) {
      const x = ((now / 1000 / period) * (W + 8) + (i * (W + 8)) / n) % (W + 8) - 4
      const y = Math.floor(((i * 0.381) % 1) * Math.max(1, skyH - 1))
      for (let k = 0; k < 4; k++) put(x + k, y, grey ? '#9EA3AB' : '#E6E8EE')
    }
  }

  // Sand, then the sea from where the context put the shore, lapping a column each way.
  const restShore = Math.round(W * (t.seg.shore ?? NO_CONTEXT_SHORE))
  const shore = restShore + Math.round(Math.sin((now / 5000) * 2 * Math.PI))
  for (let x = 0; x < W; x++) put(x, G, x < shore ? '#D9C08A' : x === shore ? '#FFFFFF' : '#4FA3CC')
  for (let x = shore + 2; x < W; x++) put(x, G - 1, '#8FCFE6')
  const onSand = (x: number) => x < shore - 1
  const own = layoutOf(t.seg.layout, t.seg.earned)
  const isLit = t.timeOfDay === 'night' || t.timeOfDay === 'evening'
  const pool = Math.round(W * own.at.pool)
  if (pool + 1 < restShore - 1) for (const dx of [-1, 0, 1]) put(pool + dx, G, '#9FD3E8')
  if (t.beach?.hasMark) {
    put(Math.round(W * MARK_SHORE) - 1, G - 1, '#4C8A5B')
    put(Math.round(W * MARK_SHORE), G - 1, '#F4F3EE')
    put(Math.round(W * MARK_SHORE) + 1, G - 1, '#4C8A5B')
  }

  // Home shell, the pile of shells it found, castle, pebble, seaweed.
  put(1, G - 1, '#F2B8A0')
  put(2, G - 1, '#D98E73')
  const pile = ['#F2B8A0', '#F5D58A', '#C9D8F0', '#E8B4C8', '#D9C493']
  for (let i = 0; i < Math.min(5, t.seg.shells); i++) put(4 + i, G - 1, pile[i % pile.length] ?? '#F2B8A0')
  if ((t.seg.golden ?? 0) > 0) put(9, G - 1, '#F5C542')
  // The hourglass on the home shell: the top cell is sand while most is left, the bottom once most is gone.
  if (t.beach?.usage !== undefined && G >= 4) {
    const sand = t.beach.usage >= 0.95 ? '#E8577A' : '#E8C27A'
    put(1, G - 4, t.beach.usage < 0.5 ? sand : '#CFE8F2')
    put(1, G - 3, t.beach.usage > 0 && t.beach.usage < 1 && sec % 2 ? sand : '#8A5A2B')
    put(1, G - 2, t.beach.usage >= 0.5 ? sand : '#CFE8F2')
  }
  // The campfire beside it: flames that flicker while the prompt cache is warm, glowing embers near the end, grey once cold.
  if (t.beach?.fire) {
    const f = t.beach.fire
    put(3, G - 1, f === 'ashes' ? '#8E8A84' : f === 'embers' && sec % 2 ? '#E8632B' : '#7A4A26')
    if (f === 'blaze' || f === 'fire') put(3, G - 2, tick % 2 ? '#F5A33A' : '#E8632B')
    if (f === 'blaze' && G >= 4 && tick % 3) put(3, G - 3, '#FBE38A')
    if (f === 'ashes' && sec % 3 === 0) put(3, G - 2, '#B8B4AD')
  }
  const c = Math.round(W * 0.3)
  const stage = Math.min(5, t.seg.castle)
  if (stage >= 1) for (const dx of [-1, 0, 1]) put(c + dx, G - 1, '#C9A86A')
  if (stage >= 2) put(c - 1, G - 2, '#C9A86A')
  if (stage >= 3) put(c + 1, G - 2, '#C9A86A')
  if (stage >= 4) put(c, G - 2, '#B8975B')
  if (stage >= 5) put(c - 1, G - 3, '#E8577A')
  const pebble = Math.round(W * own.at.pebble)
  if (onSand(pebble)) put(pebble, G - 1, '#9A948A')
  const weed = Math.round(W * own.at.seaweed)
  if (onSand(weed)) {
    put(weed, G - 1, '#3E8E5E')
    put(weed + ((sky.isWindy ? tick : sec) % 2), G - 2, '#4FA36E')
  }
  // What the shells unlocked, in a few cells each, where the beach is tall enough to hold them.
  if (G >= 4 && hasDecor('palm', t.seg.shells, t.seg.width)) {
    const palm = Math.round(W * own.at.palm)
    fiveShells(put, own, palm, G)
    // Past the shell pile and clear of the palm; a beach too short to fit it goes without.
    const room = palm - 17
    if (room >= 0 && hasDecor('house', t.seg.shells, t.seg.width)) {
      const [from, to] = ZONES.house
      const x = 10 + Math.round(((own.at.house - from) / (to - from)) * Math.min(4, room))
      twentyShells(put, own, x, G, isLit)
    }
  }
  const chair = Math.round(W * own.at.chair)
  if (G >= 4 && hasDecor('chair', t.seg.shells, t.seg.width) && onSand(chair + 2)) tenShells(put, own, chair, G, isLit)
  if (G >= 4 && hasDecor('boat', t.seg.shells, t.seg.width)) fortyShells(put, own, Math.round(W * own.at.boat) + 1, G)
  if (sky.holiday === 'halloween') for (const f of [0.12, 0.565]) put(W * f, G - 1, '#E8822B')
  if (sky.holiday === 'christmas') {
    const x = Math.round(W * 0.12)
    put(x, G - 1, '#2E8A57')
    put(x, G - 2, '#2E8A57')
    put(x, G - 3, '#F5C542')
  }
  if (t.beach?.planted) {
    const x = Math.round(W * 0.38)
    put(x, G - 1, '#A0703F')
    put(x, G - 2, '#A0703F')
    put(x, G - 3, '#A0703F')
  }
  if (t.beach?.hasBottle) {
    put(shore - 4, G - 1, '#6FB98F')
    put(shore - 3, G - 1, '#6FB98F')
    put(shore - 2, G - 1, '#A0703F')
  }

  // The crab, centred where the plan puts it on the desktop's strip.
  const pl = planOf(t.seg)
  const elapsed = Math.max(0, Math.min(pl.duration, now - t.seg.startAt))
  const here = whereAt(pl, elapsed)
  const f = W / Math.max(1, t.seg.width)

  // A rod at the water's edge for each line out, and a float in the sea that dips and rises.
  for (let i = 0; i < Math.min(MAX_RODS, t.beach?.rods ?? 0); i++) {
    for (let y = G - 3; y <= G - 1; y++) put(shore - 3 - i * 3, y, '#7A4A26')
    put(Math.min(W - 1, shore + 4 + i * 4), (sec + i) % 3 ? G - 1 : G - 2, '#E8577A')
  }
  // What it reels in, up out of the sea and onto the sand behind it.
  const caught = pl.marks.find(m => m.kind === 'catch')
  if (caught && elapsed >= caught.t0 && elapsed <= caught.t1) {
    const k = (elapsed - caught.t0) / Math.max(1, caught.t1 - caught.t0)
    const to = (xOf(caught.p0, t.seg.width) + CRAB_W / 2) * f
    put(shore + 4 + (to - shore - 4) * k, Math.max(0, Math.round(G - 1 - 4 * G * k * (1 - k))), caught.variant === 'boot' ? '#6B4A2E' : '#F28C3A')
  }
  // The tank's taller beach has room for the crab at half the desktop's size; the strip, a third.
  const fineness: Fineness = H >= 18 ? 'tank' : 'strip'
  const crabW = CRAB_CELLS[fineness]
  const mid = Math.max(crabW / 2, Math.min(W - crabW / 2, Math.round((xOf(here.p, t.seg.width) + CRAB_W / 2) * f)))
  const x0 = mid - crabW / 2
  const isNap = here.pose === 'nap'
  const isGone = here.pose === 'gone'
  const lift = BOUNCY.has(here.pose) && tick % 2 && G >= 5 ? 1 : 0
  // Up with the gadget, one half-cell per pixel of the strip's scale; a rocket leaves the top.
  const up = Math.round((here.lift * H) / 40)
  const flyUp = lift + (here.lift > 40 ? up : Math.min(up, Math.max(0, G - 4)))
  if (!isGone) {
    const isDark = t.timeOfDay === 'night' || t.timeOfDay === 'evening'
    const look: CrabLook = { ...t.look, hasNightcap: t.timeOfDay === 'night' && isNap, isDark }
    const ride = here.pose === 'ride' ? (t.seg.ride ?? t.costume) : null
    const sprite = spriteOf(t.costume, here.pose, look, fineness, isWalking(here.pose) && tick % 2 === 1, ride)
    for (const { dx, dy, c } of cellsOf(sprite, here.face)) put(mid + dx, G + dy - flyUp, c)
  }
  if (isNap && G >= 5 && sec % 2) put(here.face === 1 ? x0 + crabW : x0 - 1, G - EYES[fineness] - 2, '#C9CCD2')
  // The pole of the sign it holds up, on the side the words go.
  const held = t.beach?.sign && !t.bubble && !isGone ? cellText(t.beach.sign) : ''
  if (held) for (let y = G - 3; y <= G; y++) put(wordsAt(x0, crabW, held.length, W) - 1, y, t.beach?.isFlag ? '#D9435E' : '#A0703F')

  // Rain and snow fall in front of everything.
  if (sky.weather === 'rain' || sky.weather === 'storm' || sky.weather === 'snow') {
    const isSnow = sky.weather === 'snow'
    const n = Math.max(4, Math.round(W / (isSnow ? 10 : 7)))
    for (let i = 0; i < n; i++) {
      const fall = Math.floor((isSnow ? now / 600 : now / 150) + i * 3) % G
      put((i * 37 + (isSnow ? (sec + i) % 2 : 0)) % W, fall, isSnow ? '#FFFFFF' : '#7EB6E0')
    }
  }
  // The cell row of its eyes, where words beside its head go.
  return { px, crabX: x0, crabW, headRow: Math.max(0, Math.floor((G - EYES[fineness]) / 2)) }
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

const toBase64 = (bytes: Uint8Array): string => {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0
    const b = bytes[i + 1] ?? 0
    const c = bytes[i + 2] ?? 0
    out += (B64[a >> 2] ?? '') + (B64[((a & 3) << 4) | (b >> 4)] ?? '')
    out += i + 1 < bytes.length ? (B64[((b & 15) << 2) | (c >> 6)] ?? '') : '='
    out += i + 2 < bytes.length ? (B64[c & 63] ?? '') : '='
  }
  return out
}

/** Back to `[codePoint, foreground, background]` per cell: for tests and previews. */
export const decodeCells = (cells: string): number[] => {
  const bits = [...cells.replace(/=+$/, '')].map(ch => B64.indexOf(ch))
  const bytes: number[] = []
  for (let i = 0; i + 1 < bits.length; i += 4) {
    const [a = 0, b = 0, c = -1, d = -1] = bits.slice(i, i + 4)
    bytes.push((a << 2) | (b >> 4))
    if (c >= 0) bytes.push(((b & 15) << 4) | (c >> 2))
    if (d >= 0) bytes.push(((c & 3) << 6) | d)
  }
  const words: number[] = []
  for (let i = 0; i + 3 < bytes.length; i += 4) words.push(((bytes[i] ?? 0) | ((bytes[i + 1] ?? 0) << 8) | ((bytes[i + 2] ?? 0) << 16) | ((bytes[i + 3] ?? 0) << 24)) >>> 0)
  return words
}

/** The Raster's cells: the beach in half blocks, with the bubble's words beside the crab's head. */
export const beachCells = (t: TerminalInput): string => {
  const W = Math.max(8, Math.round(t.columns))
  const R = Math.max(2, Math.round(t.rows))
  const { px, crabX, crabW, headRow } = beachPixels(t)
  const words = new Uint32Array(W * R * 3)
  for (let r = 0; r < R; r++) {
    for (let x = 0; x < W; x++) {
      const top = px[2 * r * W + x] ?? NONE
      const bottom = px[(2 * r + 1) * W + x] ?? NONE
      const i = (r * W + x) * 3
      if (top === NONE && bottom === NONE) words.set([0x20, NONE, NONE], i)
      else if (top === NONE) words.set([LOWER, bottom, NONE], i)
      else words.set([UPPER, top, bottom], i)
    }
  }
  // A clear cell either side, so a cloud or star never runs into the words.
  const write = (text: string, start: number, row: number, fg: number, bg: number) => {
    ;[' ', ...text, ' '].slice(0, W - start + 1).forEach((ch, k) => {
      if (start + k - 1 >= 0) words.set([ch.codePointAt(0) ?? 0x20, fg, bg], (row * W + start + k - 1) * 3)
    })
  }
  const row = Math.min(R - 1, headRow)
  const planted = t.beach?.planted ? cellText(t.beach.planted) : ''
  if (planted) write(planted, Math.max(1, Math.min(W - planted.length - 1, Math.round(W * 0.38) - Math.floor(planted.length / 2))), row, PLANK_INK, PLANK)
  const text = t.bubble ? cellText(t.bubble) : ''
  const held = !text && t.beach?.sign ? cellText(t.beach.sign) : ''
  if (text) write(text, wordsAt(crabX, crabW, text.length, W), row, NONE, NONE)
  // The red flag: white on red, so a waiting window stands out in a row of terminals.
  if (held) write(held, wordsAt(crabX, crabW, held.length, W), row, t.beach?.isFlag ? 0xFFFFFF : PLANK_INK, t.beach?.isFlag ? 0xD9435E : PLANK)
  return toBase64(new Uint8Array(words.buffer))
}
