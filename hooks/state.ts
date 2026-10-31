// Plain values the modules beside register.tsx share: the $.store keys that outlive the session, and the
// settings. Not the atoms: the engine lists what each file reads and writes, so an atom is declared in the
// file that uses it (register.tsx).

export const MIN = 60_000

// $.store keys: choices made with /crab and the pet itself outlive the session.
export const KEY = {
  hidden: 'isHidden', breaksOff: 'areBreaksOff', soundOff: 'isSoundOff', needs: 'needs', name: 'name',
  firstMet: 'firstMet', bubbles: 'bubbles', signsOff: 'areSignsOff', castle: 'castle', shells: 'shells', golden: 'goldenShells', weather: 'weather', geo: 'weatherGeo', located: 'weatherLocated', failed: 'weatherFailed', asked: 'weatherAsked',
  greeted: 'greetedDay', tank: 'isTank', fish: 'fishCaught', roam: 'isRoaming', logOff: 'isLogOff', earned: 'decorEarned',
  needsOff: 'areNeedsOff', tipsOff: 'areTipsOff', hourglassOff: 'isHourglassOff', seenVersion: 'seenVersion',
} as const

// Set from the options each time the module loads.
export const cfg = { longMs: 120_000, breakMs: 90 * MIN, place: '', budgetUsd: 0 }
