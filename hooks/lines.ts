// What the crab says. Canned lines, no tokens; `{name}` and `{time}` are filled in.

import type { SignKind } from '../types'
import type { Holiday } from './sky'
import type { Costume } from './sprites'

export type Moment =
  | 'long' | 'commit' | 'testsFail' | 'testsPass' | 'hungry' | 'sleepy' | 'morning' | 'late'
  | 'fed' | 'played' | 'petted' | 'full' | 'tired' | 'pettedAgain' | 'named' | 'grumpy'
  | 'muse' | 'aware' | 'butterfly' | 'neighbour' | 'hic' | 'sky' | 'found' | 'built' | 'peek' | 'friend' | 'golden'
  | 'compact' | 'bottle' | 'caught' | 'lost'
  | `ride-${Costume}`

const LINES: Record<Moment, readonly string[]> = {
  long: ['phew, {time}!', 'that was a big one', 'done! {time} well spent', 'ta-da, all done'],
  commit: ['shipped it!', 'commit! 🎉', 'into the history books', 'nice commit'],
  testsFail: ['uh oh…', 'red again?', 'we can fix this', 'deep breaths'],
  testsPass: ['all green 😎', 'tests pass!', 'smooth'],
  hungry: ['snack time? 🍤', 'tummy rumbling…', '{name} is hungry'],
  sleepy: ['need a break…', 'so sleepy', 'stretch with me?'],
  morning: ['good morning!', 'coffee first?', 'rise and shine'],
  late: ["it's late…", 'one more thing?', 'bedtime soon?'],
  fed: ['nom nom', 'yum!', 'tasty 🍤', 'thank you!'],
  played: ['wheee!', 'again! again!', 'got it!'],
  petted: ['♥', 'hehe', 'more please', 'purr… wait, crabs don\'t purr'],
  full: ['still full!', 'maybe later', 'no room left'],
  tired: ['catching my breath…', 'one sec…', 'later?'],
  pettedAgain: ['♥ ♥', 'happy crab'],
  named: ['{name}! I like it', 'call me {name}'],
  grumpy: ['hmph.', 'feeling a bit neglected', 'pinch.'],
  muse: ['am I made of pixels?', "what's past the edge?", 'is the prompt… watching me?', 'sand is just tiny rocks', 'do crabs dream?', 'I could walk sideways forever', 'who draws me?'],
  aware: ['oh! hi, you', 'I see you there', "you're looking at me", 'hello, big friend'],
  butterfly: ['come back!', 'so fast…', 'pretty!'],
  neighbour: ['hey neighbour!', 'hi Shelly!', 'visitor!'],
  hic: ['hic!', '*hic*', 'hic… sorry'],
  sky: ['nice sky', 'look up!', 'so many stars'],
  found: ['a shell! mine now', 'ooh, shiny', 'for the collection'],
  built: ['castle grows!', 'one more tower', 'architect crab'],
  peek: ['what do these do?', 'buttons…', 'shall I press one?'],
  friend: ['buddy!', 'you came!', 'best friends'],
  golden: ['a GOLDEN shell!', 'jackpot!', 'so shiny!!'],
  compact: ['good moment for /compact', 'clean break: /compact?', 'tide is high: /compact?'],
  bottle: ['message in a bottle!', 'bottle sent', 'ahoy, summarizer'],
  caught: ['got one!', 'fish on!', 'a nice catch'],
  lost: ['just an old boot', 'that is no fish', 'a boot. again.'],
  'ride-racer': ['vroom!', 'pit stop? never', 'new lap record'],
  'ride-viking': ['row, row, row', 'to Valhalla!', 'land ho… oh, it is land'],
  'ride-engineer': ['digging it', 'mind the bucket', 'structurally sound'],
  'ride-chef': ['fresh shrimp!', 'hot food, coming through', 'order up!'],
  'ride-plain': ['kickflip!', 'wheee', 'look, no claws'],
  'ride-detective': ['nothing to see here', 'just reading…', 'I see everything'],
  'ride-oktoberfest': ['steady… steady…', 'prost!', 'whoa, barrel'],
  'ride-raincoat': ['smooth sailing', 'paper holds… for now', 'ahoy, puddle'],
  'ride-king': ['to the throne!', 'onward, loyal subjects', 'carry on'],
  'ride-wizard': ['up, up!', 'no brakes on this broom', 'abraca-zoom'],
  'ride-santa': ['ho ho ho!', 'on we go!', 'gifts for everyone'],
  'ride-ghost': ['boooo', 'just passing through', 'wooOOOooo'],
  'ride-astronaut': ['liftoff!', '3, 2, 1…', 'see you up there'],
  'ride-surfer': ['cowabunga!', 'surf is up', 'hang ten, all ten'],
  'ride-diver': ['periscope up', 'dive, dive!', 'all quiet down here'],
  'ride-dj': ['drop the beat', 'this one is for the shells', 'hands in the air, claws too'],
  'ride-pirate': ['fire!', 'BOOM', 'warning shot, matey'],
}

export const line = (moment: Moment, seed: number, vars: { name: string; time?: string }): string => {
  const pool = LINES[moment]
  const text = pool[Math.abs(Math.floor(seed)) % pool.length] ?? pool[0] ?? ''
  return text.replace('{name}', vars.name).replace('{time}', vars.time ?? '')
}

// What fits on a plank: 22 characters at most, so a costume's width never decides it.
const SIGNS: Record<SignKind, readonly string[]> = {
  done: ['done! {time}', 'all done, {time}', 'ta-da! {time}'],
  coffee: ['coffee time?', 'coffee break?', 'espresso, maybe?'],
  walk: ['time for a walk', 'go touch some sand', 'legs need a walk'],
  commit: ['committed!', 'into the history books', 'saved for ever'],
  pushed: ['pushed!', 'up it goes', 'off to the remote'],
  pr: ['PR is open!', 'PR sent', 'PR out to sea'],
  mr: ['MR is open!', 'MR sent', 'MR out to sea'],
  merged: ['merged!', "it's in!", 'merged, party time'],
  green: ['green again!', 'back to green', 'phew, all green'],
  context: ['high tide soon', 'the sea is rising', 'high tide: /compact'],
  compact: ['good moment: /compact', 'clean break: /compact', 'tide is high: /compact'],
  fish: ['caught! {time}', 'got one! {time}', 'fish on! {time}'],
  boot: ['old boot: it failed', 'a boot! it failed', 'no fish: it failed'],
  limit: ['limit {time}'],
  budget: ['budget {time}'],
}

/** The red flag's words: what Claude is waiting for you on, short enough for a plank. */
export const needsLine = (tool: string, isHelper = false): string => {
  if (isHelper) return 'a helper needs you'
  if (tool === 'AskUserQuestion') return 'a question for you'
  if (tool === 'ExitPlanMode') return 'a plan to approve'
  const name = tool.startsWith('mcp__') ? (tool.split('__')[2] ?? tool) : tool
  return `needs you: ${name.slice(0, 18)}`
}

export const signLine = (kind: SignKind, seed: number, time = ''): string => {
  const pool = SIGNS[kind]
  return (pool[Math.abs(Math.floor(seed)) % pool.length] ?? pool[0] ?? '').replace('{time}', time)
}

const THEME_LINES: Record<Costume, string> = {
  astronaut: "3, 2, 1… it's astronaut day!",
  detective: "psst… it's detective day",
  engineer: 'hard hats on: engineer day!',
  chef: "bonjour! it's chef day",
  racer: "vroom! it's racer day",
  pirate: "ahoy, it's pirate day!",
  plain: 'just me today: plain day',
  surfer: "surf's up: surfer day!",
  diver: "deep breath, it's diver day",
  viking: "to the longship: viking day!",
  wizard: "abracadabra: wizard day!",
  dj: "drop the beat: DJ day!",
  ghost: 'boo! happy Halloween',
  santa: 'ho ho ho, merry Christmas!',
  oktoberfest: "o'zapft is! it's Oktoberfest",
  raincoat: 'drip drop, raincoat on',
  king: 'bow before your king',
}

/** Today's theme in words: the holiday if there is one, else the costume's day. */
export const themeName = (costume: Costume, hol: Holiday): string =>
  hol === 'halloween' ? 'Halloween' : hol === 'christmas' ? 'Christmas' : hol === 'oktoberfest' ? 'Oktoberfest' : hol === 'newyear' ? `New Year, ${costume} day` : `${costume} day`

/** The day's first hello, naming the theme. */
export const themeLine = (costume: Costume, hol: Holiday): string =>
  hol === 'newyear' ? `happy New Year! ${costume} day` : THEME_LINES[costume]
