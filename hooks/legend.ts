// What am I looking at? One line for each thing on the beach right now, and none for what isn't there: what it
// is, what it says at this moment, and the command that says more. Pure, so it is easy to test.

import type { Fire } from '../types'

/** What is on the beach now, in the words the rest of the mod already has for it. */
export type Seen = {
  name: string
  /** Where the crab is while it's in another window, or null. */
  away: string | null
  /** The sea: the context's tokens and where Claude compacts; null before the first measurement. */
  sea: { tokens: string; full: string | null; hasMark: boolean; isPastMark: boolean } | null
  fire: Fire | null
  /** "cache warm ~3 min" and the like. */
  cacheWords: string
  /** "limit 62% (resets 16:20)" or "spent $3.10 of $10"; null with no hourglass. */
  usageWords: string | null
  /** Why there is no hourglass, when there is none. */
  noHourglass?: string | null
  rods: number
  /** The red flag: what Claude waits for, and for how long ("4m", or empty under a minute). */
  flag: { what: string; waited: string } | null
  /** Words on the sign it holds, when that is no flag. */
  held: string | null
  planted: string | null
  hasBottle: boolean
  /** Blocks in the work pile. */
  work: number
  /** The real weather shown, or null with none set or a clear sky. */
  weather: string | null
  costume: string
  theme: string
  isPicked: boolean
  shells: number
}

const FIRE: Record<Fire, string> = {
  blaze: 'The campfire, blazing: the prompt cache is warm',
  fire: 'The campfire, burning down: the prompt cache is still warm',
  embers: 'The embers: the prompt cache is about to go cold',
  ashes: 'The cold campfire: the prompt cache has likely gone cold, so the next prompt writes the whole conversation to it again',
}

/** What /crab what says. */
export const legend = (s: Seen): string => {
  const lines: string[] = []
  if (s.away) lines.push(`The empty beach: ${s.name} is ${s.away}, with the window you last wrote in. /crab here calls it over.`)
  if (!s.sea) lines.push('The sea, far out: your context. It comes up the beach as the context fills, once the first reply has measured it.')
  else lines.push(`The sea: your context, ${s.sea.tokens}${s.sea.full ? ` of the ${s.sea.full} where Claude compacts` : ''}. It comes up the beach as the context fills. /crab sea says what fills it.`)
  if (s.sea?.hasMark) lines.push(`The seaweed line on the sand: past it, a long break lets Claude compact the conversation.${s.sea.isPastMark ? ' The sea is past it now.' : ''}`)
  if (s.flag) lines.push(`The red flag: Claude is waiting for you (${s.flag.what})${s.flag.waited ? `, for ${s.flag.waited} now` : ''}. It comes down when you answer.`)
  if (s.held) lines.push(`The sign it holds up: news, "${s.held}". It stays a few seconds.`)
  if (s.planted) lines.push(`The sign in the sand: "${s.planted}".`)
  if (s.fire) lines.push(`${FIRE[s.fire]}${s.cacheWords ? ` (${s.cacheWords})` : ''}. /crab cache says more.`)
  if (s.usageWords) lines.push(`The hourglass on the home shell: ${s.usageWords}.`)
  if (s.noHourglass) lines.push(`No hourglass: ${s.noHourglass}.`)
  if (s.rods) lines.push(`${s.rods === 1 ? 'The fishing rod: a subagent' : `The ${s.rods} fishing rods: subagents`} at work. A fish means it finished, a boot that it failed. /crab lines names them.`)
  if (s.hasBottle) lines.push('The bottle at the waterline: the log of your work, sent to the summarizer at a compaction or washed up from last time. /crab log and /crab last show it.')
  if (s.work) lines.push(`The ${s.work === 1 ? 'block' : `${s.work} blocks`} by the sandcastle: one for each tool Claude used this turn.`)
  if (s.weather) lines.push(`The sky: ${s.weather}, the real weather. /crab weather says where it is for.`)
  lines.push(`The ${s.costume} costume: ${s.isPicked ? 'the one you picked. /crab today goes back to the day\'s' : `today is ${s.theme}. /crab theme`}.`)
  if (s.shells) lines.push(`The pile of ${s.shells === 1 ? 'one shell' : `${s.shells} shells`} by its home: its collection. More shells unlock things for the beach. /crab stats`)
  return [`On ${s.name}'s beach right now:`, ...lines.map(l => `- ${l}`), '', '/crab help lists every command.'].join('\n')
}
