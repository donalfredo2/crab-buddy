// The parts of the crab that switch on and off, and three presets over them: /crab mode full, helper or quiet.
// One word instead of ten switches, and it says which crab a person wants. Pure, so it is easy to test.

import type { AlertMode } from './wait'

/** Each part with an on/off switch of its own (/crab <part> on|off). */
export const SWITCHES = ['signs', 'needs', 'tips', 'hourglass', 'cost', 'cache', 'breaks', 'sound', 'log', 'circles'] as const
export type SwitchName = (typeof SWITCHES)[number]

/** What each part is called when it's listed as switched off. */
export const SWITCH_LABEL: Record<SwitchName, string> = {
  signs: 'signs', needs: 'needs', tips: 'tips', hourglass: 'hourglass', cost: 'cost signs', cache: 'cache fire', log: 'log',
  breaks: 'breaks', sound: 'sound', circles: 'circles',
}

export type Bubbles = 'often' | 'rare' | 'off'
/** Everything a preset decides: each switch (true is on), how much it talks, and the alert. */
export type Settings = Record<SwitchName, boolean> & { bubbles: Bubbles; alert: AlertMode }

export const MODE_NAMES = ['full', 'helper', 'quiet'] as const
export type ModeName = (typeof MODE_NAMES)[number]
export const isModeName = (v: string): v is ModeName => (MODE_NAMES as readonly string[]).includes(v)

const ALL_ON: Record<SwitchName, boolean> = { signs: true, needs: true, tips: true, hourglass: true, cost: true, cache: true, log: true, breaks: true, sound: true, circles: true }

/**
 * What a preset sets, from where things stand now.
 *   full    everything on. How much it talks and the alert stay as you had them (a silent crab talks again).
 *   helper  the same, without the crab's own talk: no speech bubbles.
 *   quiet   only what is silent, and the red flag: the sea, the hourglass, the campfire, the log. No signs, no
 *           bubbles, no tips, no sounds, no break reminders, no alert.
 */
export const settingsFor = (mode: ModeName, cur: Settings): Settings => {
  if (mode === 'full') return { ...ALL_ON, bubbles: cur.bubbles === 'off' ? 'rare' : cur.bubbles, alert: cur.alert }
  if (mode === 'helper') return { ...ALL_ON, bubbles: 'off', alert: cur.alert }
  return { ...ALL_ON, signs: false, tips: false, cost: false, breaks: false, sound: false, circles: false, bubbles: 'off', alert: 'off' }
}

const same = (a: Settings, b: Settings): boolean => SWITCHES.every(s => a[s] === b[s]) && a.bubbles === b.bubbles && a.alert === b.alert

/** The preset things stand at now, or `custom` when it is none of them. */
export const modeOf = (cur: Settings): ModeName | 'custom' => MODE_NAMES.find(m => same(settingsFor(m, cur), cur)) ?? 'custom'

/** The parts switched off, by the names they are listed under. */
export const offList = (cur: Settings): string[] => [
  ...SWITCHES.filter(s => !cur[s]).map(s => SWITCH_LABEL[s]),
  ...(cur.bubbles === 'off' ? ['bubbles'] : []),
]

const SAYS: Record<ModeName, string> = {
  full: 'everything on',
  helper: 'everything on but the speech bubbles',
  quiet: 'only the red flag and what is silent: the sea, the hourglass and the campfire',
}

/** What /crab mode says. */
export const modeText = (cur: Settings): string => {
  const mode = modeOf(cur)
  const off = offList(cur)
  const now = mode === 'custom' ? `Mode: custom (switched off: ${off.length ? off.join(', ') : 'nothing'}${cur.alert === 'off' ? '' : `; alert ${cur.alert}`}).` : `Mode: ${mode}, ${SAYS[mode]}.`
  return `${now} /crab mode full, helper or quiet sets them all at once: ${MODE_NAMES.map(m => `${m} is ${SAYS[m]}`).join('; ')}.`
}
