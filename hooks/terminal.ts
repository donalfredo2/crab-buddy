// The beach in a terminal, which draws no SVG: coloured half-block cells, two
// pixels stacked in each, one pixel to a column. The same life plan drives it,
// scaled to the terminal's width, so the crab does what it does on the desktop.
// Empty cells keep the terminal's own colours, so it stays see-through.

import type { Beach, Segment, TimeOfDay } from '../types'
import { CRAB_W, MAX_RODS, NO_CONTEXT_SHORE, isWalking, planOf, whereAt, xOf } from './life'
import { moonLit } from './sky'
import type { Sky } from './sky'
import { CLAY } from './sprites'
import type { Costume } from './sprites'

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
}

const HAT: Partial<Record<Costume, string>> = {
  astronaut: '#C9CCD2', detective: '#8A5A3B', engineer: '#F5C542', chef: '#FFFFFF', racer: '#1D9E75', pirate: '#2B2A28', santa: '#D8352B',
  surfer: '#378ADD', diver: '#F28C3A', viking: '#8E929A', wizard: '#534AB7', dj: '#D85A30', oktoberfest: '#3B6D11', raincoat: '#F5C542', king: '#F5C542',
}
// Claws up, eyes set in the shell so they show on light and dark terminals alike.
const STAND = ['d.....d', 'dbebebd', '.bbbbb.', '.d.d.d.']
const STEP = ['d.....d', 'dbebebd', '.bbbbb.', 'd.d.d.d']
const NAP = ['.......', '.......', '.bdbdb.', 'dbbbbbd']
const BOUNCY = new Set(['dance', 'wave', 'cheer', 'party', 'play', 'love'])

// Its gadget, the crab's own 7 columns plus 3 either side, facing right; `show` leaves
// the crab's pixels showing through where the gadget is empty. A cell is too coarse for
// more: each is a shape and a colour or two.
type Cells = { rows: readonly string[]; show?: boolean }
const GADGET: Record<Costume, Cells> = {
  racer: { show: true, rows: ['.............', '.............', 'ggggggggggggg', '..kk.....kk..'] },
  viking: { show: true, rows: ['.............', 'h...........h', 'hhhhhhhhhhhhh', '.hhhhhhhhhhh.'] },
  engineer: { show: true, rows: ['..........yy.', '..........y.y', 'yyyyyyyyyy..y', 'ddddddddddd..'] },
  chef: { show: true, rows: ['.........rrrr', '.........a..a', '.........wwww', '..........k.k'] },
  plain: { show: true, rows: ['.............', '.............', '.............', '..qqqqqqqqq..'] },
  detective: { rows: ['...wwwwwww...', '...wewwwew...', '...wwwwwww...', '....b.b.b....'] },
  oktoberfest: { show: true, rows: ['.............', '.............', '.............', '...aaaaaaa...'] },
  raincoat: { show: true, rows: ['.............', '.............', 'wwwwwwwwwwwww', '..wwwwwwwww..'] },
  king: { show: true, rows: ['.............', '.............', 'hhhhhhhhhhhhh', '.l.l.....l.l.'] },
  wizard: { show: true, rows: ['.............', '.............', 'yynnnnnnnnnnn', '.............'] },
  santa: { show: true, rows: ['.............', '.............', 'rrrrrrrrrrrnn', 'SSSSSSSSSSSnn'] },
  ghost: { show: true, rows: ['.............', '.............', '..........o..', '.............'] },
  astronaut: { rows: ['......r......', '.....www.....', '.....wbw.....', '....rwwwr....'] },
  surfer: { show: true, rows: ['t............', 'tt...........', 'ttt..........', 'tttBBBBBBBBB.'] },
  diver: { rows: ['.......y.....', '.......y.....', '..yyyyyyyyy..', '.yyybyyybyyy.'] },
  dj: { show: true, rows: ['.............', '.............', '..xxxxxxxxx..', '..x.......x..'] },
  pirate: { show: true, rows: ['.............', '.............', '.........dddd', '.........nn..'] },
}
const GADGET_INK: Record<string, string> = {
  g: '#1D9E75', k: '#1F1E1D', h: '#8A5A2B', y: '#F5C542', d: '#3A3936', r: '#D8433B', a: '#A0703F', w: '#F4F3EE', q: '#D85A30',
  e: '#3A3936', b: '#B85C3E', l: '#5B8FD9', n: '#7A4A26', S: '#8E929A', o: '#F28C3A', t: '#6BB8D6', B: '#378ADD', x: '#5F5E5A',
}

/** A speech bubble as cells: one character each, so only narrow ones, and no emoji. */
export const cellText = (text: string): string =>
  [...text.replace(/♥/g, '<3')].filter(c => (c.codePointAt(0) ?? 0) < 0x2100 && c !== '️').join('').replace(/\s+/g, ' ').trim()

/** Where words beside the crab's head start: right of it when there's room, else left. */
const wordsAt = (crabX: number, length: number, W: number): number =>
  crabX + 9 + length <= W ? crabX + 9 : Math.max(0, crabX - length - 2)

/** The pixels of the beach, `columns` wide and `rows * 2` tall, NONE where empty, and where the crab is. */
export const beachPixels = (t: TerminalInput): { px: number[]; crabX: number } => {
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
  const shore = Math.round(W * (t.seg.shore ?? NO_CONTEXT_SHORE)) + Math.round(Math.sin((now / 5000) * 2 * Math.PI))
  for (let x = 0; x < W; x++) put(x, G, x < shore ? '#D9C08A' : x === shore ? '#FFFFFF' : '#4FA3CC')
  for (let x = shore + 2; x < W; x++) put(x, G - 1, '#8FCFE6')
  const onSand = (x: number) => x < shore - 1

  // Home shell, the pile of shells it found, castle, pebble, seaweed.
  put(1, G - 1, '#F2B8A0')
  put(2, G - 1, '#D98E73')
  const pile = ['#F2B8A0', '#F5D58A', '#C9D8F0', '#E8B4C8', '#D9C493']
  for (let i = 0; i < Math.min(5, t.seg.shells); i++) put(4 + i, G - 1, pile[i % pile.length] ?? '#F2B8A0')
  if ((t.seg.golden ?? 0) > 0) put(9, G - 1, '#F5C542')
  const c = Math.round(W * 0.3)
  const stage = Math.min(5, t.seg.castle)
  if (stage >= 1) for (const dx of [-1, 0, 1]) put(c + dx, G - 1, '#C9A86A')
  if (stage >= 2) put(c - 1, G - 2, '#C9A86A')
  if (stage >= 3) put(c + 1, G - 2, '#C9A86A')
  if (stage >= 4) put(c, G - 2, '#B8975B')
  if (stage >= 5) put(c - 1, G - 3, '#E8577A')
  const pebble = Math.round(W * 0.44)
  if (onSand(pebble)) put(pebble, G - 1, '#9A948A')
  const weed = Math.round(W * 0.62)
  if (onSand(weed)) {
    put(weed, G - 1, '#3E8E5E')
    put(weed + ((sky.isWindy ? tick : sec) % 2), G - 2, '#4FA36E')
  }
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
  const x0 = Math.max(0, Math.min(W - 7, Math.round((xOf(here.p, t.seg.width) + CRAB_W / 2) * f - 3.5)))
  const isNap = here.pose === 'nap'
  const rows = isNap ? NAP : isWalking(here.pose) && tick % 2 ? STEP : STAND
  const ghost = t.costume === 'ghost'
  const hat = HAT[t.costume]
  const colors: Record<string, string> = { e: '#3A3936', b: ghost ? '#F2F2EE' : CLAY, d: ghost ? '#C9CCD2' : '#B85C3E' }
  const lift = BOUNCY.has(here.pose) && tick % 2 && G >= 5 ? 1 : 0
  // Up with the gadget, one half-cell per pixel of the strip's scale; a rocket leaves the top.
  const up = Math.round((here.lift * H) / 40)
  const flyUp = lift + (here.lift > 40 ? up : Math.min(up, Math.max(0, G - 4)))
  const riding = here.pose === 'ride' && t.seg.ride ? GADGET[t.seg.ride] : null
  if (!riding || riding.show) {
    rows.forEach((row, dy) => {
      for (let dx = 0; dx < 7; dx++) {
        const k = row[here.face === 1 ? dx : 6 - dx] ?? '.'
        const color = colors[k]
        if (color) put(x0 + dx, G - 4 + dy - flyUp, color)
      }
    })
    if (hat && !isNap) for (const dx of [2, 3, 4]) put(x0 + dx, G - 4 - flyUp, hat)
  }
  riding?.rows.forEach((row, dy) => {
    for (let dx = 0; dx < 13; dx++) {
      const color = GADGET_INK[row[here.face === 1 ? dx : 12 - dx] ?? '.']
      if (color) put(x0 - 3 + dx, G - 4 + dy - flyUp, color)
    }
  })
  if (hat && isNap) for (const dx of [2, 3, 4]) put(x0 + dx, G - 3, hat)
  if (isNap && G >= 5 && sec % 2) put(x0 + (here.face === 1 ? 6 : 0), G - 5, '#C9CCD2')
  // The pole of the sign it holds up, on the side the words go.
  const held = t.beach?.sign && !t.bubble ? cellText(t.beach.sign) : ''
  if (held) for (let y = G - 3; y <= G; y++) put(wordsAt(x0, held.length, W) - 1, y, '#A0703F')

  // Rain and snow fall in front of everything.
  if (sky.weather === 'rain' || sky.weather === 'storm' || sky.weather === 'snow') {
    const isSnow = sky.weather === 'snow'
    const n = Math.max(4, Math.round(W / (isSnow ? 10 : 7)))
    for (let i = 0; i < n; i++) {
      const fall = Math.floor((isSnow ? now / 600 : now / 150) + i * 3) % G
      put((i * 37 + (isSnow ? (sec + i) % 2 : 0)) % W, fall, isSnow ? '#FFFFFF' : '#7EB6E0')
    }
  }
  return { px, crabX: x0 }
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
  const { px, crabX } = beachPixels(t)
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
  // The row of the crab's head.
  const row = Math.max(0, R - 3)
  const planted = t.beach?.planted ? cellText(t.beach.planted) : ''
  if (planted) write(planted, Math.max(1, Math.min(W - planted.length - 1, Math.round(W * 0.38) - Math.floor(planted.length / 2))), row, PLANK_INK, PLANK)
  const text = t.bubble ? cellText(t.bubble) : ''
  const held = !text && t.beach?.sign ? cellText(t.beach.sign) : ''
  if (text) write(text, wordsAt(crabX, text.length, W), row, NONE, NONE)
  if (held) write(held, wordsAt(crabX, held.length, W), row, PLANK_INK, PLANK)
  return toBase64(new Uint8Array(words.buffer))
}
