// What the crab says. Canned lines, no tokens; `{name}` and `{time}` are filled in.

import type { Holiday } from './sky'
import type { Costume } from './sprites'

export type Moment =
  | 'long' | 'commit' | 'testsFail' | 'testsPass' | 'hungry' | 'sleepy' | 'morning' | 'late'
  | 'fed' | 'played' | 'petted' | 'full' | 'tired' | 'pettedAgain' | 'named' | 'grumpy'
  | 'muse' | 'aware' | 'butterfly' | 'neighbour' | 'hic' | 'sky' | 'found' | 'built' | 'peek' | 'friend' | 'golden'

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
}

export const line = (moment: Moment, seed: number, vars: { name: string; time?: string }): string => {
  const pool = LINES[moment]
  const text = pool[Math.abs(Math.floor(seed)) % pool.length] ?? pool[0] ?? ''
  return text.replace('{name}', vars.name).replace('{time}', vars.time ?? '')
}

const THEME_LINES: Record<Costume, string> = {
  astronaut: "3, 2, 1… it's astronaut day!",
  detective: "psst… it's detective day",
  engineer: 'hard hats on: engineer day!',
  chef: "bonjour! it's chef day",
  racer: "vroom! it's racer day",
  pirate: "ahoy, it's pirate day!",
  plain: 'just me today: plain day',
  ghost: 'boo! happy Halloween',
  santa: 'ho ho ho, merry Christmas!',
}

/** Today's theme in words: the holiday if there is one, else the costume's day. */
export const themeName = (costume: Costume, hol: Holiday): string =>
  hol === 'halloween' ? 'Halloween' : hol === 'christmas' ? 'Christmas' : hol === 'newyear' ? `New Year, ${costume} day` : `${costume} day`

/** The day's first hello, naming the theme. */
export const themeLine = (costume: Costume, hol: Holiday): string =>
  hol === 'newyear' ? `happy New Year! ${costume} day` : THEME_LINES[costume]
