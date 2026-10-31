// Draws docs/demo.gif, the README's moving picture: what the crab shows you, one caption at a time. The
// frames are the mod's own scene, drawn in a real browser and stopped at set moments, so it's the same
// every time it's made.
//
//   bun scripts/make-demo.ts            (writes docs/demo.gif; needs playwright, Chromium and ffmpeg)
//   bun scripts/make-demo.ts /tmp/d.gif

import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { Beach, Segment } from '../types'
import { sceneSvg } from '../hooks/scene'
import type { SceneInput } from '../hooks/scene'
import { skyFor } from '../hooks/sky'

const FPS = 12
const SECONDS_EACH = 1.6
const W = 288
const H = 46
const SCALE = 2.5
const CAPTION_H = 44
const PX_W = Math.round(W * SCALE)
const PX_H = Math.round(H * SCALE)
const T0 = new Date(2026, 9, 29, 15).getTime()

const seg = (over: Partial<Segment> = {}): Segment => ({
  id: 1, seed: 7, startAt: T0, startP: 0.35, startFace: 1, mode: 'idle', width: W, castle: 2, shells: 8,
  food: 80, fun: 70, energy: 80, timeOfDay: 'day', shore: 0.75, ...over,
})
const scene = (s: Segment, over: Partial<SceneInput> = {}): SceneInput => ({
  width: W, height: H, costume: 'plain', look: {}, timeOfDay: 'day', bubble: null, now: s.startAt + 1500, seg: s,
  prop: null, sky: skyFor(s.startAt), hour: 15, work: [], ...over,
})

type Shot = { caption: string; at: (f: number) => SceneInput }
const FRAMES = Math.round(FPS * SECONDS_EACH)
const hourglass: Beach = { usage: 0.45 }

const SHOTS: Shot[] = [
  {
    caption: 'The sea rises as Claude’s context fills',
    // The shore creeps from 0.85 to 0.5 of the way across while it works.
    at: f => {
      const s = seg({ mode: 'work', shore: 0.85 - (0.35 * f) / (FRAMES - 1) })
      return scene(s, { prop: 'hammer', work: ['hammer', 'scroll', 'hammer', 'other'].slice(0, 1 + Math.floor((f / FRAMES) * 4)), beach: { ...hourglass, hasMark: true } })
    },
  },
  {
    caption: 'A red flag when Claude is waiting for you',
    at: () => scene(seg({ hold: { pose: 'look', ms: 600_000 }, shore: 0.55 }), { beach: { ...hourglass, hasMark: true, sign: 'needs you: Bash', isFlag: true } }),
  },
  {
    caption: 'A fishing rod for every subagent',
    at: () => scene(seg({ first: 'cast', shore: 0.55 }), { beach: { ...hourglass, hasMark: true, rods: 2 } }),
  },
  {
    caption: 'Signs for the news: tests green, pushed, merged',
    at: () => scene(seg({ hold: { pose: 'cheer', ms: 600_000, sign: 'pushed!' }, shore: 0.55 }), { beach: { ...hourglass, hasMark: true, sign: 'pushed!' } }),
  },
  {
    caption: 'An hourglass for your usage limit',
    at: () => scene(seg({ seed: 21, startP: 0.45, shore: 0.55 }), { beach: { usage: 0.8, hasMark: true } }),
  },
]

const page = (svg: string, caption: string): string => `<!doctype html><html><head><style>
body{margin:0;background:#262624}
.cap{height:${CAPTION_H}px;display:flex;align-items:center;justify-content:center;color:#F4EFE6;font:600 19px -apple-system,'Segoe UI',Helvetica,Arial,sans-serif;letter-spacing:.2px}
.cap b{color:#E8916F;font-weight:700;margin-right:8px}
.art{width:${PX_W}px;height:${PX_H}px;background:#9FD3F0}
.art svg{width:100%;height:100%;display:block}
</style></head><body><div id="f" style="width:${PX_W}px"><div class="cap"><b>🦀</b>${caption}</div><div class="art">${svg}</div></div></body></html>`

const out = process.argv[2] ?? `${import.meta.dir}/../docs/demo.gif`
const dir = mkdtempSync(join(tmpdir(), 'crab-demo-'))
const browser = await chromium.launch()
const tab = await browser.newPage({ viewport: { width: PX_W, height: PX_H + CAPTION_H } })
let n = 0
for (const shot of SHOTS) {
  for (let f = 0; f < FRAMES; f++) {
    await tab.setContent(page(sceneSvg(shot.at(f)), shot.caption))
    // Every animation stopped at the same moment of its own clock: a frame is the same each time it's drawn.
    await tab.evaluate(t => {
      for (const a of document.getAnimations()) {
        a.pause()
        a.currentTime = t
      }
    }, 1500 + (f * 1000) / FPS)
    await tab.locator('#f').screenshot({ path: join(dir, `${String(n++).padStart(4, '0')}.png`) })
  }
}
await browser.close()

const frames = join(dir, '%04d.png')
const palette = join(dir, 'palette.png')
execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', String(FPS), '-i', frames, '-vf', 'palettegen=max_colors=128:stats_mode=diff', palette])
execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', String(FPS), '-i', frames, '-i', palette, '-lavfi', 'paletteuse=dither=none:diff_mode=rectangle', '-loop', '0', out])
rmSync(dir, { recursive: true, force: true })
console.log(`wrote ${out}: ${n} frames, ${Math.round(statSync(out).size / 1024)} KB`)
