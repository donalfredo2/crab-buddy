// Draws the terminal beach the way a terminal would, so it can be looked at without one:
// every Raster cell painted at a typical cell size (VS Code's integrated terminal at 14px,
// about 8x17 pixels), half blocks drawn as exact halves like xterm.js does, words in a
// monospace font. One PNG per scene: each costume standing, walking, napping and riding,
// in the strip above the prompt and in a docked tank.
//
//   bun scripts/preview-terminal.ts /tmp/crab-term          (needs playwright and Chromium)
//   CRAB_ONLY=pirate bun scripts/preview-terminal.ts /tmp/crab-term
//
// Not part of the plugin's own test run: `claude plugin test` has no browser.

import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'

import type { Segment } from '../types'
import { skyFor } from '../hooks/sky'
import { COSTUMES, SPECIAL_COSTUMES } from '../hooks/sprites'
import type { Costume } from '../hooks/sprites'
import { beachCells, decodeCells } from '../hooks/terminal'
import type { TerminalInput } from '../hooks/terminal'

const OUT = process.argv[2] ?? 'terminal-preview'
const ONLY = process.env.CRAB_ONLY
const STRIP_ROWS = Number(process.env.CRAB_ROWS ?? 4)
const CELL_W = 8
const CELL_H = 17
const T0 = new Date(2026, 9, 29, 12).getTime()

const seg = (over: Partial<Segment> = {}): Segment => ({
  id: 1, seed: 7, startAt: T0, startP: 0.3, startFace: 1, mode: 'idle', width: 600, castle: 3, shells: 12,
  food: 80, fun: 60, energy: 80, timeOfDay: 'day', shore: 0.8, layout: 3, ...over,
})

type Scene = { name: string; input: TerminalInput }
const scenes: Scene[] = []
const ALL: Costume[] = [...COSTUMES, ...SPECIAL_COSTUMES]
for (const costume of ALL) {
  if (ONLY && costume !== ONLY) continue
  const strip = (name: string, s: Segment, at: number, over: Partial<TerminalInput> = {}) =>
    scenes.push({ name: `${costume}-${name}`, input: { columns: 72, rows: STRIP_ROWS, now: T0 + at, seg: { ...s, width: 72 * 8 }, costume, timeOfDay: 'day', sky: skyFor(T0), bubble: null, ...over } })
  strip('stand', seg({ hold: { pose: 'stand', ms: 60_000 } }), 1000)
  strip('walk', seg({ hold: { pose: 'wander', ms: 60_000 } }), 1250)
  strip('nap', seg({ hold: { pose: 'nap', ms: 60_000 } }), 1000)
  strip('ride', seg({ seed: 11, ride: costume, first: 'ride', width: 900, shore: 0.7 }), 2500)
  strip('talk', seg({ hold: { pose: 'stand', ms: 60_000 } }), 1000, { bubble: `${costume} day!` })
  scenes.push({ name: `${costume}-tank`, input: { columns: 48, rows: 14, now: T0 + 1000, seg: seg({ hold: { pose: 'stand', ms: 60_000 }, width: 48 * 8, startP: 0.4 }), costume, timeOfDay: 'day', sky: skyFor(T0), bubble: null } })
}

const page = await (await chromium.launch()).newPage({ deviceScaleFactor: 1 })
mkdirSync(OUT, { recursive: true })
for (const sc of scenes) {
  const words = decodeCells(beachCells(sc.input))
  const { columns, rows } = sc.input
  await page.setContent(`<body style="margin:0;background:#1e1e1e"><canvas id="c" width="${columns * CELL_W + 16}" height="${rows * CELL_H + 16}"></canvas></body>`)
  await page.evaluate(({ words, columns, rows, w, h }) => {
    const ctx = (document.getElementById('c') as HTMLCanvasElement).getContext('2d')
    if (!ctx) return
    const NONE = 0x01000000
    const css = (c: number) => `#${c.toString(16).padStart(6, '0')}`
    ctx.fillStyle = '#1e1e1e'
    ctx.fillRect(0, 0, columns * w + 16, rows * h + 16)
    ctx.font = `${h - 3}px Menlo, "DejaVu Sans Mono", monospace`
    ctx.textBaseline = 'middle'
    for (let r = 0; r < rows; r++) {
      for (let x = 0; x < columns; x++) {
        const i = (r * columns + x) * 3
        const [cp = 32, fg = NONE, bg = NONE] = [words[i], words[i + 1], words[i + 2]]
        const X = 8 + x * w
        const Y = 8 + r * h
        if (bg !== NONE) {
          ctx.fillStyle = css(bg)
          ctx.fillRect(X, Y, w, h)
        }
        if (cp === 0x2580 || cp === 0x2584) {
          if (fg === NONE) continue
          ctx.fillStyle = css(fg)
          ctx.fillRect(X, cp === 0x2580 ? Y : Y + Math.floor(h / 2), w, cp === 0x2580 ? Math.floor(h / 2) : h - Math.floor(h / 2))
        } else if (cp === 0x2588) {
          ctx.fillStyle = css(fg)
          ctx.fillRect(X, Y, w, h)
        } else if (cp !== 32) {
          ctx.fillStyle = fg === NONE ? '#cccccc' : css(fg)
          ctx.fillText(String.fromCodePoint(cp), X, Y + h / 2)
        }
      }
    }
  }, { words, columns, rows, w: CELL_W, h: CELL_H })
  writeFileSync(`${OUT}/${sc.name}.png`, await page.locator('#c').screenshot())
}
console.log(`${scenes.length} scenes in ${OUT}`)
process.exit(0)
