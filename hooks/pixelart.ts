// The desktop's crab, scaled down for a terminal's cells. The crab is drawn in its own
// 30x28 grid (sprites.ts, gadgets.ts); a terminal has a few cells for it, so each cell
// takes the colour that covers most of a patch of that grid.
//
// The patches line up with the crab's own features rather than an even grid: one column
// each for an eye, a leg and a claw, one row for the eyes and one for the legs. Even
// patches of three would split the eyes and legs and lose them. In the tank there's room
// for patches of two, and the crab's features, all two pixels wide, fit them exactly.

/** A rectangle of one colour in the crab's grid. */
export type Rect = { x: number; y: number; w: number; h: number; c: string; cls?: string }

/** Inclusive ranges of the grid's pixels, one per cell. */
type Bins = readonly (readonly [number, number])[]

/**
 * A crab in cells: `px[j * cols + i]` is a colour, or -1 for none. Column `ic` is the one
 * right of the crab's middle; row `jg` is the ground's, the one below its feet.
 */
export type Sprite = { cols: number; rows: number; ic: number; jg: number; px: Int32Array }

/** How finely: the strip's few rows, or the tank's taller ones. */
export type Fineness = 'strip' | 'tank'

// The grid's reach: the widest gadget and the highest rocket.
const X_MIN = -48
const X_MAX = 60
const Y_MIN = -16
const Y_MAX = 31

// Out from a core of bins, both ways, in bins of `step` pixels until the reach.
const grow = (core: Bins, step: number, lo: number, hi: number): Bins => {
  const out: [number, number][] = core.map(([a, b]) => [a, b])
  for (let a = (core[0]?.[0] ?? 0) - step; a + step - 1 >= lo; a -= step) out.unshift([a, a + step - 1])
  for (let a = (core[core.length - 1]?.[1] ?? 0) + 1; a <= hi; a += step) out.push([a, a + step - 1])
  return out
}

// The strip: 10 columns for the crab (claw, leg, eye, leg, middle, middle, leg, eye, leg, claw)
// and 7 rows above the ground (hat, brim, shell, eyes, claws, belly, legs). Symmetric about
// x = 15, so the crab turned round is the same cells mirrored.
const STRIP_X = grow([[2, 6], [7, 8], [9, 10], [11, 12], [13, 14], [15, 16], [17, 18], [19, 20], [21, 22], [23, 27]], 3, X_MIN, X_MAX)
const STRIP_Y = grow([[2, 5], [6, 9], [10, 11], [12, 13], [14, 17], [18, 21], [22, 25], [26, 28]], 3, Y_MIN, Y_MAX)
// The tank: every two pixels, on odd columns and even rows, where the crab's own pixels start.
const TANK_X = grow([[13, 14], [15, 16]], 2, X_MIN, X_MAX)
const TANK_Y = grow([[24, 25], [26, 27]], 2, Y_MIN, Y_MAX)

const LATTICE: Record<Fineness, { xs: Bins; ys: Bins }> = { strip: { xs: STRIP_X, ys: STRIP_Y }, tank: { xs: TANK_X, ys: TANK_Y } }

/** How many cells wide the crab itself is, its claws included. */
export const CRAB_CELLS: Record<Fineness, number> = { strip: 10, tank: 13 }

/** A CSS colour as 0xRRGGBB; -1 for one it can't read. */
export const rgbOf = (c: string): number => {
  if (/^#[0-9a-f]{6}$/i.test(c)) return parseInt(c.slice(1), 16)
  if (/^#[0-9a-f]{3}$/i.test(c)) return parseInt([...c.slice(1)].map(d => d + d).join(''), 16)
  const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c)
  return m ? (Number(m[1]) << 16) | (Number(m[2]) << 8) | Number(m[3]) : -1
}

// Eyes are what make it a face: their ink, and the glint in them, outweigh the shell around.
const WEIGHT = new Map<number, number>([[0x1F1E1D, 2.5], [0x3A3936, 2.5], [0xFFFFFF, 1.5]])

/**
 * Scales rectangles in the crab's grid down to cells: each cell takes the colour covering
 * most of its patch, eyes counting extra, and stays empty unless 40% of the patch is drawn.
 * Later rectangles paint over earlier ones, as in an SVG.
 */
export const downsample = (rects: readonly Rect[], fineness: Fineness): Sprite => {
  const W = X_MAX - X_MIN + 1
  const H = Y_MAX - Y_MIN + 1
  const grid = new Int32Array(W * H).fill(-1)
  for (const r of rects) {
    const c = rgbOf(r.c)
    if (c < 0) continue
    for (let y = Math.max(Y_MIN, r.y); y < Math.min(Y_MAX + 1, r.y + r.h); y++) {
      for (let x = Math.max(X_MIN, r.x); x < Math.min(X_MAX + 1, r.x + r.w); x++) grid[(y - Y_MIN) * W + x - X_MIN] = c
    }
  }
  const { xs, ys } = LATTICE[fineness]
  const px = new Int32Array(xs.length * ys.length).fill(-1)
  ys.forEach(([y0, y1], j) => {
    xs.forEach(([x0, x1], i) => {
      const tally = new Map<number, number>()
      let drawn = 0
      for (let y = Math.max(Y_MIN, y0); y <= Math.min(Y_MAX, y1); y++) {
        for (let x = Math.max(X_MIN, x0); x <= Math.min(X_MAX, x1); x++) {
          const c = grid[(y - Y_MIN) * W + x - X_MIN] ?? -1
          if (c < 0) continue
          drawn++
          tally.set(c, (tally.get(c) ?? 0) + (WEIGHT.get(c) ?? 1))
        }
      }
      if (drawn < 0.4 * (x1 - x0 + 1) * (y1 - y0 + 1)) return
      let best = -1
      let most = 0
      for (const [c, n] of tally) if (n > most) [best, most] = [c, n]
      px[j * xs.length + i] = best
    })
  })
  return { cols: xs.length, rows: ys.length, ic: xs.findIndex(([a]) => a === 15), jg: ys.findIndex(([a]) => a === 26), px }
}

/**
 * Each drawn cell of a sprite, where it lands: `dx` columns from the crab's middle (the
 * column right of it), `dy` rows from the ground (-1 is the row its feet are in).
 * Facing left, the cells are mirrored about the middle.
 */
export const cellsOf = (s: Sprite, face: 1 | -1): { dx: number; dy: number; c: number }[] => {
  const out: { dx: number; dy: number; c: number }[] = []
  for (let j = 0; j < s.rows; j++) {
    for (let i = 0; i < s.cols; i++) {
      const c = s.px[j * s.cols + i] ?? -1
      if (c >= 0) out.push({ dx: face === 1 ? i - s.ic : s.ic - 1 - i, dy: j - s.jg, c })
    }
  }
  return out
}
