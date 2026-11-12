// What's new: the version this code is, and what to say about it once, the first time it runs after an
// update. The engine doesn't tell a plugin its own version, so it's written here, and a test keeps it equal
// to plugin.json's.

export const VERSION = '0.28.0'

/** On the plank, after "new: ": 17 characters at most, so the whole sign fits. */
export const NEWS = 'sea in VS Code'

/** The longer line, in /crab help. */
export const NEWS_LONG = 'New in 0.28.0: the sea follows the context in VS Code too, the campfire is bigger and nothing stands on it, VS Code draws a fresh picture each beat, and /crab debug says what the sea and the fire go by.'

export const REPO = 'https://github.com/donalfredo2/crab-buddy'

/**
 * What to do about the version last seen: on a first install say nothing (everything is new), after an update
 * hold up the news once, and with nothing changed, nothing. Versions before this one kept no record, so a crab
 * met before (`hasMet`) with none is an update too.
 */
export const newsFor = (seen: unknown, hasMet: boolean, version: string = VERSION): 'first' | 'updated' | 'same' => {
  if (typeof seen === 'string' && seen) return seen === version ? 'same' : 'updated'
  return hasMet ? 'updated' : 'first'
}
