/** The daily costumes, then those worn on holidays, in the rain or once earned. */
export type Costume =
  | 'astronaut' | 'surfer' | 'detective' | 'viking' | 'engineer' | 'diver' | 'chef' | 'wizard' | 'racer' | 'dj' | 'pirate' | 'plain'
  | 'ghost' | 'santa' | 'oktoberfest' | 'raincoat' | 'king'

export type Mood = 'nap' | 'work' | 'wander' | 'cheer' | 'daze' | 'wave' | 'party' | 'cool' | 'nervous' | 'stretch' | 'eat' | 'play' | 'love'

export type ReactionMood = 'cheer' | 'daze' | 'wave' | 'party' | 'cool' | 'nervous' | 'eat' | 'play' | 'love'

export type TimeOfDay = 'morning' | 'day' | 'evening' | 'night'

export type Weather = 'clear' | 'cloudy' | 'fog' | 'rain' | 'snow' | 'storm'

/** The local weather, fetched hourly when a place is set; `at` is when it was fetched. */
export type WeatherNow = { kind: Weather; isWindy: boolean; at: number } | null

/** Everything the crab can look like: a mood, or a pose from its own life. */
export type Pose =
  | Mood
  | 'stand' | 'look' | 'gaze' | 'wink' | 'dig' | 'sit' | 'yawn' | 'sneeze' | 'dance' | 'duck' | 'carry' | 'build'
  | 'peek' | 'notice' | 'kick' | 'hide' | 'sun' | 'sway' | 'hic' | 'chase' | 'skywatch' | 'muse' | 'ride' | 'gone'

export type LifeMode = 'idle' | 'work' | 'sleep' | 'stretch' | 'away'

/** News the crab shows on a sign. */
export type SignKind = 'done' | 'coffee' | 'walk' | 'commit' | 'pushed' | 'pr' | 'mr' | 'merged' | 'green' | 'context' | 'compact' | 'fish' | 'boot'

/** A sign waiting its turn; `at` is when it was asked for. */
export type QueuedSign = { kind: SignKind; text: string; at: number }

/** A sign in the sand, standing until `until`. */
export type PlantedSign = { text: string; until: number } | null

/** What is on the beach besides the crab's own life. */
export type Beach = {
  /** Words the crab is holding up. */
  sign?: string
  /** Words on a sign in the sand. */
  planted?: string
  /** A bottle at the waterline: a compaction just took the log. */
  hasBottle?: boolean
  /** Rods planted at the water's edge, one for each subagent out. */
  rods?: number
  /** The wrack on the sand: past it, a long break can compact. */
  hasMark?: boolean
}

/** The context as a tide. `level` runs 0 to 1, see tideOf; `mark` is null where there is none; `isCounted`: a local count, until the next reply measures it. */
export type Tide = { tokens: number; level: number; mark: number | null; isCounted?: boolean } | null

/** Where compactions come, read once for a window: the engine's line, and the idle one if it's on. */
export type TideLines = { window: number; full: number; idleMark: number | null } | null

/** A running subagent's line in the water. */
export type Rod = { id: string; description: string }

/** What a line brings in: a fish for a subagent that finished, a boot for one that failed. */
export type CatchKind = 'fish' | 'boot'

export type Activity =
  | 'stroll' | 'lookAround' | 'gaze' | 'peek' | 'muse' | 'dig' | 'forage' | 'kick' | 'inspect' | 'hide' | 'sway'
  | 'sunbathe' | 'butterfly' | 'seagull' | 'fish' | 'neighbour' | 'yawn' | 'sneeze' | 'hiccup' | 'skywatch' | 'dance'
  | 'build' | 'tidy' | 'friend' | 'sleep' | 'stretch' | 'hold' | 'ride' | 'cast' | 'reel' | 'away' | 'arrive'

/**
 * One stretch of the crab's life: the seed and the inputs its plan is made from,
 * so every redraw draws the same plan. Positions are fractions of the strip.
 */
export type Segment = {
  id: number
  seed: number
  startAt: number
  startP: number
  startFace: 1 | -1
  mode: LifeMode
  /** The strip's width when the segment began; walking times are worked out from it. */
  width: number
  /** A pose held in place first: a reaction, a care action, noticing you. */
  hold?: { pose: Pose; ms: number; sign?: string }
  /** An activity to do first (a line to cast or reel in). */
  first?: Activity
  /** What the line it reels in brings up. */
  haul?: CatchKind
  /** It's off to another window: it wades in and sinks. */
  isLeaving?: boolean
  /** What it wears: its gadget is that costume's. */
  ride?: Costume
  /** The last segment was cut off mid-ride: a puff of dust covers the gadget going. */
  poof?: boolean
  /** This install's own number, the same in all its windows: what its beach and its ways are like. */
  layout?: number
  earned?: number
  castle: number
  shells: number
  /** Rare golden shells found, kept apart from the pile's count. */
  golden?: number
  food: number
  fun: number
  energy: number
  timeOfDay: TimeOfDay
  weather?: Weather
  /** Where the sea starts, as a fraction of the width: it creeps in as the context fills. */
  shore?: number
}

/** A prop in its claw that mirrors the tool Claude is using. */
export type Prop = 'scroll' | 'magnifier' | 'hammer' | 'keyboard' | 'binoculars' | 'rod'

export type Antic = { prop: Prop; since: number; until: number } | null

/** The pet's needs, 0-100, kept in $.store across sessions. */
export type Needs = {
  food: number
  fun: number
  energy: number
  /** When the needs were last brought up to date, ms since the epoch. */
  updatedAt: number
  lastFed: number
  lastPlayed: number
  lastPetted: number
}

/** A speech bubble; `until` is ms since the epoch. */
export type Bubble = { text: string; until: number } | null

/** How high the tide is: below the mark, past it, near the top. */
export type Tiredness = 'fresh' | 'tired' | 'sweaty'

/** A short reaction; `until` is ms since the epoch. */
export type Reaction = { mood: ReactionMood; until: number } | null

export type Stats = {
  /** When the session began, ms since the epoch; 0 until known. */
  startedAt: number
  turns: number
  toolCalls: number
}

/** The state of the work, logged as it happens; goes to the summarizer before a compaction. */
export type Logbook = {
  /** Files changed since the last commit, newest last. */
  files: string[]
  test: 'passed' | 'failed' | null
  build: 'passed' | 'failed' | null
  /** Recent commits' subject lines, newest last. */
  commits: string[]
}

export type BreakState = {
  /** Start of the current work streak; 0 when none. */
  streakStart: number
  /** The last turn's start or end: an idle gap since then resets the streak. */
  lastActive: number
  /** No reminder before this time (a snooze). */
  snoozedUntil: number
  /** The streak the reminder already toasted for. */
  toastedFor: number
}

declare module 'claude-code' {
  interface PluginState {
    'crab-buddy': {
      reaction: Reaction
      /** A costume picked with /crab; null follows the costume of the day. */
      costume: string | null
      isHidden: boolean
      stats: Stats
      /** The context as a tide; null when unknown, as in a fresh session. */
      tide: Tide
      tideLines: TideLines
      /** The context fill already warned about this session. */
      contextWarned: boolean
      /** The good moment to compact was already signed at this fill. */
      contextHinted: boolean
      logbook: Logbook
      plantedSign: PlantedSign
      signQueue: QueuedSign[]
      rods: Rod[]
      /** Where the crab is, in a sign's words, while it's in another window. */
      crabAway: string | null
      /** A task that finished elsewhere while you're busy here. */
      roamNote: string | null
      /** This beach's roster file: a reload forgets the module's copy. */
      beachSlot: string
      areSignsOff: boolean
      /** The segment in which it reached home to stretch, so the break's sign goes up then. */
      stretchedSeg: number
      /** A bottle lies at the waterline after a compaction until then, ms since the epoch. */
      bottleUntil: number
      breaks: BreakState
      areBreaksOff: boolean
      isSoundOff: boolean
      needs: Needs | null
      /** When the last break refill was given. */
      restedAt: number
      name: string
      bubble: Bubble
      lastBubbleAt: number
      bubbleMode: string
      /** The segment of its life being played; null before the session starts it. */
      life: Segment | null
      antic: Antic
      weather: WeatherNow
      /** The tools used this turn, one block each in the work pile (a prop's name, or 'other'). */
      turnWork: string[]
      /** The crab lives in its tank pane instead of the strip above the prompt. */
      isTank: boolean
    }
    /** Read only: savvy-progress's flow, non-null while its bar is up. */
    'savvy-progress': {
      flow: { title: string; isFinished: boolean } | null
    }
  }
}
