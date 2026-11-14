// What fills the sea: the context by category, as /context counts it, with the rows a person can do something
// about (connected tools, memory files) named. Made from the engine's local estimate, so nothing is sent. Pure.

import { cut, oneLine } from './text'

type Row = { name: string; tokens: number; kind: string }
/** The part of the engine's breakdown this reads (SessionContextBreakdown). */
export type SeaInput = {
  categories?: readonly Row[]
  totalTokens: number
  rawMaxTokens: number
  autoCompactThreshold?: number
  mcpTools?: readonly { serverName: string; tokens: number; isLoaded: boolean }[]
  memoryFiles?: readonly { path: string; type: string; tokens: number }[]
}

const TOP = 3
const k = (tokens: number): string => (tokens < 1000 ? String(Math.round(tokens)) : `${Math.round(tokens / 1000)}k`)
const share = (tokens: number, of: number): string => `${Math.round((100 * tokens) / Math.max(1, of))}%`
const label = (text: string, max = 40): string => cut(oneLine(text), max)
const shortPath = (path: string): string => path.split(/[\\/]/).filter(Boolean).slice(-2).join('/')

/** What /crab sea says. `mark`: where a long break can compact, or null. */
export const seaText = (b: SeaInput, mark: number | null): string => {
  const rows = b.categories ?? []
  const used = rows.filter(r => r.kind === 'used' && r.tokens > 0).sort((x, y) => y.tokens - x.tokens)
  const sumOf = (kind: string): number => rows.filter(r => r.kind === kind).reduce((s, r) => s + r.tokens, 0)
  const free = sumOf('free')
  const buffer = sumOf('buffer')
  const deferred = sumOf('deferred')
  const lines = [`The sea: ${k(b.totalTokens)} of a ${k(b.rawMaxTokens)} window (${share(b.totalTokens, b.rawMaxTokens)}).`]
  if (b.autoCompactThreshold) lines.push(`Claude compacts at ${k(b.autoCompactThreshold)}${mark !== null && mark < b.autoCompactThreshold ? `; past ${k(mark)} a long break can` : ''}.`)
  if (used.length) {
    lines.push('', 'What fills it:')
    for (const r of used) lines.push(`  ${label(r.name).padEnd(22)} ${k(r.tokens).padStart(6)}  ${share(r.tokens, b.totalTokens).padStart(4)}`)
  }
  lines.push('', `Room left: ${k(free)}${buffer ? `, with ${k(buffer)} held back for compacting` : ''}.`)

  // The two kinds of row a person can change: tools connected and never used, and memory files grown long.
  const byServer = new Map<string, number>()
  for (const t of b.mcpTools ?? []) if (t.isLoaded) byServer.set(t.serverName, (byServer.get(t.serverName) ?? 0) + t.tokens)
  const servers = [...byServer].filter(([, t]) => t > 0).sort((x, y) => y[1] - x[1]).slice(0, TOP)
  if (servers.length) lines.push('', `Biggest connected tools: ${servers.map(([name, t]) => `${label(name, 24)} ${k(t)}`).join(', ')}.`)
  const files = [...(b.memoryFiles ?? [])].filter(f => f.tokens > 0).sort((x, y) => y.tokens - x.tokens).slice(0, TOP)
  if (files.length) lines.push(`Biggest memory files: ${files.map(f => `${label(shortPath(f.path), 32)} ${k(f.tokens)}`).join(', ')}.`)
  if (deferred) lines.push(`Tools loaded only when used, outside the window: ${k(deferred)}.`)
  lines.push('', 'Counted on this machine, as /context does; nothing is sent.')
  return lines.join('\n')
}
