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
  | 'peek' | 'notice' | 'kick' | 'hide' | 'sun' | 'sway' | 'hic' | 'chase' | 'skywatch' | 'muse'

export type LifeMode = 'idle' | 'work' | 'sleep' | 'stretch'

export type Activity =
  | 'stroll' | 'lookAround' | 'gaze' | 'peek' | 'muse' | 'dig' | 'forage' | 'kick' | 'inspect' | 'hide' | 'sway'
  | 'sunbathe' | 'butterfly' | 'seagull' | 'fish' | 'neighbour' | 'yawn' | 'sneeze' | 'hiccup' | 'skywatch' | 'dance'
  | 'build' | 'tidy' | 'friend' | 'sleep' | 'stretch' | 'hold'

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
  hold?: { pose: Pose; ms: number }
  /** An activity to do first (a friend Claude's Agent tool whistled for). */
  first?: Activity
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
export type Prop = 'scroll' | 'magnifier' | 'hammer' | 'keyboard' | 'binoculars' | 'whistle'

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

/** How full the context window is: under 50%, 50-80%, 80% and up. */
export type Tiredness = 'fresh' | 'tired' | 'sweaty'

/** A short reaction; `until` is ms since the epoch. */
export type Reaction = { mood: ReactionMood; until: number } | null

export type Stats = {
  /** When the session began, ms since the epoch; 0 until known. */
  startedAt: number
  turns: number
  toolCalls: number
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
      /** The context window's fill, 0-100; null when unknown. */
      contextPercent: number | null
      /** The context fill already warned about this session. */
      contextWarned: boolean
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
