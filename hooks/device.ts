// The panel's drawing: an egg-shaped toy with a pixel LCD, the crab inside it,
// and its three needs as segment meters.

import type { Mood, Needs, TimeOfDay } from '../types'
import { CRAB_CSS, crab, zzz } from './sprites'
import type { Costume, CrabLook } from './sprites'

export type DeviceInput = {
  width: number
  name: string
  costume: Costume
  mood: Mood
  look: CrabLook
  needs: Needs
  timeOfDay: TimeOfDay
  now: number
}

const xml = (s: string): string => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)

export const deviceHeight = (width: number): number => Math.round(Math.max(220, Math.min(380, width)) * 1.02)

const meter = (x: number, y: number, w: number, value: number, icon: string, label: string): string => {
  const segs = 10
  const gap = 2
  const sw = (w - gap * (segs - 1)) / segs
  const filled = Math.round(value / 10)
  const cells = Array.from({ length: segs }, (_, i) =>
    `<rect x="${(x + i * (sw + gap)).toFixed(1)}" y="${y}" width="${sw.toFixed(1)}" height="8" rx="1.5" fill="#2D4B46" opacity="${i < filled ? 0.9 : 0.15}"/>`,
  ).join('')
  return `<text x="${x - 22}" y="${y + 8}" font-size="10">${icon}</text><title>${label} ${Math.round(value)}</title>${cells}`
}

export const deviceSvg = (d: DeviceInput): string => {
  const W = Math.max(220, Math.min(380, Math.round(d.width)))
  const H = deviceHeight(W)
  const sx = W * 0.17
  const sy = H * 0.2
  const swd = W * 0.66
  const sh = H * 0.38
  const lcd = d.timeOfDay === 'night' ? '#93A784' : '#CFE3B4'
  const scale = Math.min(2.4, (sh - 18) / 28)
  const cw = 30 * scale
  const groundY = sy + sh - 10
  const left = sx + 14
  const right = sx + swd - cw - 10
  const isMoving = d.mood === 'work' || d.mood === 'wander' || d.mood === 'play'
  const period = 9
  const delay = -((d.now / 1000) % period)
  const motion = isMoving && right > left
    ? `@keyframes dmv{0%{transform:translateX(${Math.round(left)}px)}50%{transform:translateX(${Math.round(right)}px)}100%{transform:translateX(${Math.round(left)}px)}}
@keyframes dfc{0%{transform:none}50%{transform:translate(${cw}px,0) scale(-1,1)}100%{transform:translate(${cw}px,0) scale(-1,1)}}
.dmv{animation:dmv ${period}s ease-in-out infinite;animation-delay:${delay.toFixed(2)}s}.dfc{animation:dfc ${period}s steps(1,end) infinite;animation-delay:${delay.toFixed(2)}s}`
    : ''
  const x0 = isMoving ? left : (left + right) / 2
  const crabTop = groundY - 26 * scale
  const night = d.timeOfDay === 'night'
    ? `<circle cx="${sx + swd - 22}" cy="${sy + 18}" r="5" fill="#2D4B46" opacity=".5"/><circle cx="${sx + swd - 19.5}" cy="${sy + 16}" r="4.2" fill="${lcd}"/>`
    : ''
  const meters = [
    meter(W * 0.34, H * 0.66, W * 0.44, d.needs.food, '🍤', 'Food'),
    meter(W * 0.34, H * 0.66 + 16, W * 0.44, d.needs.fun, '🎾', 'Fun'),
    meter(W * 0.34, H * 0.66 + 32, W * 0.44, d.needs.energy, '⚡', 'Energy'),
  ].join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="-apple-system,'SF Pro Text',sans-serif"><style>${CRAB_CSS}${motion}.z{fill:#2D4B46}
@media (prefers-reduced-motion: reduce){*{animation:none!important}.z{opacity:.6}}</style>
<path d="M${W / 2} 6 C ${W * 0.93} 6, ${W - 4} ${H * 0.42}, ${W - 6} ${H * 0.62} C ${W - 10} ${H * 0.86}, ${W * 0.78} ${H - 4}, ${W / 2} ${H - 4} C ${W * 0.22} ${H - 4}, 10 ${H * 0.86}, 6 ${H * 0.62} C 4 ${H * 0.42}, ${W * 0.07} 6, ${W / 2} 6 Z" fill="#8FD3C7" stroke="#5FB0A2" stroke-width="3"/>
${[0.2, 0.76, 0.3, 0.84, 0.12].map((p, i) => `<circle cx="${W * p}" cy="${H * (0.3 + i * 0.12)}" r="2.2" fill="#fff" opacity=".35"/>`).join('')}
<text x="${W / 2}" y="${H * 0.15}" text-anchor="middle" font-size="12" font-weight="800" letter-spacing="1.5" fill="#2D4B46">${xml(d.name.toUpperCase())}</text>
<rect x="${sx - 6}" y="${sy - 6}" width="${swd + 12}" height="${sh + 12}" rx="12" fill="#3A4A45"/>
<rect x="${sx}" y="${sy}" width="${swd}" height="${sh}" rx="6" fill="${lcd}"/>
${night}
<rect x="${sx + 4}" y="${groundY}" width="${swd - 8}" height="2" fill="#2D4B46" opacity=".35"/>
<g class="dmv" transform="translate(${Math.round(x0)},0)"><g transform="translate(0,${crabTop.toFixed(1)})">${d.mood === 'nap' ? `<g transform="scale(${(scale / 1.4).toFixed(2)})">${zzz(30, 6)}</g>` : ''}
<g class="dfc"><g transform="scale(${scale.toFixed(2)})" shape-rendering="crispEdges">${crab(d.costume, d.mood, d.look)}</g></g></g></g>
${meters}
${[0.36, 0.5, 0.64].map(p => `<circle cx="${W * p}" cy="${H * 0.91}" r="7" fill="#F7E7A6" stroke="#5FB0A2" stroke-width="2"/>`).join('')}
</svg>`
}
