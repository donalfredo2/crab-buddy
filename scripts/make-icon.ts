// Draws the plugin's listing icon from the mod's own crab sprite: the crab on its beach, as pixel art.
//
//   bun scripts/make-icon.ts                       (writes .claude-plugin/icon.png, 1024 px)
//   CRAB_ICON=day bun scripts/make-icon.ts /tmp/x.png     (another sky: day, sunset or night; CRAB_POSE another pose)
//
// Needs playwright and Chromium, like check-animations.ts. The grid is 64 units at 16 px each, and the crab is
// scaled by 1.5, so every edge lands on a whole pixel.

import { chromium } from 'playwright'

import type { Pose } from '../types'
import { CRAB_CSS, crab } from '../hooks/sprites'

const SIZE = 1024
const N = 64

type Sky = { bands: string[]; orb: string; orbRim: string; isMoon: boolean; sea: string; foam: string; stars: boolean }
const SKIES: Record<string, Sky> = {
  day: { bands: ['#5FAED8', '#74BBE0', '#8CC8E7', '#A6D5EE', '#C2E3F3'], orb: '#FFE08A', orbRim: '#FFD05C', isMoon: false, sea: '#3F97C2', foam: '#E8F6FC', stars: false },
  sunset: { bands: ['#3B3B78', '#6A4C8C', '#B0608A', '#E98A72', '#F6B98A'], orb: '#FFE6A8', orbRim: '#FFD07A', isMoon: false, sea: '#3D5E8E', foam: '#F6C9A8', stars: false },
  night: { bands: ['#131A33', '#18223F', '#1D2A4C', '#23335A', '#2B3E68'], orb: '#F4EFD8', orbRim: '#D9D2B4', isMoon: true, sea: '#22406A', foam: '#7FA6CF', stars: true },
}

const px = (x: number, y: number, w: number, h: number, fill: string): string => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`

// A round thing in 2-unit blocks, the size of the crab's own pixels.
const disc = (cx: number, cy: number, r: number, fill: string, rim: string): string => {
  const out: string[] = []
  for (let y = -r; y < r; y += 2)
    for (let x = -r; x < r; x += 2) {
      const d = Math.hypot(x + 1, y + 1)
      if (d <= r) out.push(px(cx + x, cy + y, 2, 2, d > r - 2 ? rim : fill))
    }
  return out.join('')
}

/** A little pixel map, one character a block of `unit`; '.' is empty. */
const art = (rows: readonly string[], x0: number, y0: number, unit: number, ink: Record<string, string>): string =>
  rows.flatMap((row, y) => [...row].map((c, x) => (ink[c] ? px(x0 + x * unit, y0 + y * unit, unit, unit, ink[c]!) : ''))).join('')

// A waxing crescent, lit on the right, in the crab's own 2-unit blocks.
const MOON = ['..mmmm..', '....smm.', '.....smm', '.....smm', '.....smm', '.....smm', '....smm.', '..mmmm..']
const SHELL = ['..wpw..', '.pwpwp.', 'pwpwpwp', 'ppppppp', '.ddddd.']
function iconSvg(sky: Sky, pose: Pose): string {
  const horizon = 38
  const bandH = horizon / sky.bands.length
  const parts: string[] = sky.bands.map((c, i) => px(0, Math.floor(i * bandH), N, Math.ceil(bandH) + 1, c))
  if (sky.stars) for (const [x, y] of [[6, 6], [14, 14], [26, 4], [34, 10], [8, 24], [58, 26], [40, 18], [20, 21]]) parts.push(px(x!, y!, 1, 1, '#F4EFD8'))
  if (sky.isMoon) parts.push(art(MOON, 42, 3, 2, { m: sky.orb, s: sky.orbRim }))
  else parts.push(disc(50, 12, 7, sky.orb, sky.orbRim))
  // The sea, with a line of foam where it meets the sand.
  parts.push(px(0, horizon, N, 8, sky.sea))
  for (let x = 2; x < N; x += 8) parts.push(px(x, horizon + 2, 3, 1, sky.foam))
  parts.push(px(0, horizon + 7, N, 2, sky.foam))
  // Sand, a few darker grains, and a shell.
  parts.push(px(0, horizon + 9, N, N - horizon - 9, '#E9D8AE'))
  for (const [x, y] of [[4, 50], [12, 58], [52, 52], [58, 60], [30, 61], [44, 57]]) parts.push(px(x!, y!, 2, 2, '#D9C493'))
  parts.push(art(SHELL, 3, 52, 1, { p: '#F2B8A0', w: '#FBE3D6', d: '#D98E73' }))
  // Its shadow on the sand, then the crab: 30 x 28 units, scaled 1.5, standing on it.
  parts.push(px(12, N - 9, 40, 2, '#D9C493'), px(16, N - 7, 32, 1, '#D9C493'))
  const crabArt = `<g transform="translate(9.5,${N - 6 - 28 * 1.5}) scale(1.5)">${crab('plain', pose)}</g>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${N} ${N}" shape-rendering="crispEdges"><style>${CRAB_CSS}*{animation:none!important}</style>${parts.join('')}${crabArt}</svg>`
}

const sky = SKIES[process.env.CRAB_ICON ?? 'night'] ?? SKIES.night!
const pose = (process.env.CRAB_POSE ?? 'dance') as Pose
const out = process.argv[2] ?? `${import.meta.dir}/../.claude-plugin/icon.png`

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE } })
await page.setContent(`<body style="margin:0">${iconSvg(sky, pose)}</body>`)
await page.locator('svg').screenshot({ path: out, omitBackground: false })
await browser.close()
console.log(`wrote ${out}`)
