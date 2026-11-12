// VS Code draws the beach as an image, and the image keeps its own animation clock. After the window has
// been in the background that clock can drop to a frame a second and stay there: the crab and everything
// else on the beach then move once a second, in jumps. A heartbeat from here draws the picture again on a
// timer instead, so the motion no longer hangs on that clock.
//
//   redraw  a fresh picture each beat, drawn for that moment: needs no clock of the image's at all, but
//           sends the whole picture (70 to 85 KB) every time. The default since 0.28: nudging alone left the
//           beach moving in jumps where the image's clock had slowed, since painting a slow clock again only
//           shows the same moment again.
//   nudge   the same picture, its height off by a hundredth of a pixel every other beat: VS Code paints
//           it again, and the image's own animation, where it runs well, is left alone. Lighter.
//   off     no heartbeat: the image runs on its own, as before 0.27.

export type PulseMode = 'nudge' | 'redraw' | 'off'
export type Pulse = { mode: PulseMode; fps: number }

/** The engine redraws a surface like VS Code ten times a second at most; sooner asks fold into one. */
export const MAX_FPS = 10
export const DEFAULT_PULSE: Pulse = { mode: 'redraw', fps: MAX_FPS }
/** No picture drawn in VS Code for this long (hidden, closed, another surface): the heartbeat stops. */
export const PULSE_IDLE_MS = 3000

const MODES: readonly PulseMode[] = ['nudge', 'redraw', 'off']
const fpsOf = (n: unknown): number | null =>
  typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= MAX_FPS ? n : null

/** What the store holds, made safe: anything else is the default. */
export const pulseOf = (stored: unknown): Pulse => {
  if (!stored || typeof stored !== 'object') return DEFAULT_PULSE
  const { mode, fps } = stored as { mode?: unknown; fps?: unknown }
  return {
    mode: MODES.includes(mode as PulseMode) ? (mode as PulseMode) : DEFAULT_PULSE.mode,
    fps: fpsOf(fps) ?? DEFAULT_PULSE.fps,
  }
}

/** `/crab pulse <value>`: a mode, `on` (the default, redraw), or beats a second from 1 to 10. Null: not a value it takes. */
export const pulseFrom = (value: string, cur: Pulse): Pulse | null => {
  if (value === 'on') return { ...cur, mode: DEFAULT_PULSE.mode }
  if (MODES.includes(value as PulseMode)) return { ...cur, mode: value as PulseMode }
  const fps = /^\d+$/.test(value) ? fpsOf(Number(value)) : null
  return fps === null ? null : { mode: cur.mode === 'off' ? DEFAULT_PULSE.mode : cur.mode, fps }
}

export const pulseText = (p: Pulse): string =>
  p.mode === 'off'
    ? 'VS Code heartbeat: off. The beach runs on the image\'s own clock. /crab pulse on brings it back.'
    : `VS Code heartbeat: ${p.mode}, ${p.fps} ${p.fps === 1 ? 'beat' : 'beats'} a second. ${p.mode === 'nudge' ? 'It nudges the picture so VS Code paints it again; /crab pulse redraw sends a fresh one each beat instead, the default.' : 'It sends a fresh picture each beat; /crab pulse nudge is lighter, if the walk keeps moving with it.'} /crab pulse off stops it. Desktop and the terminal are not affected.`

/** The picture's height on this beat: a hundredth of a pixel taller every other beat, which nobody sees. */
export const nudged = (height: number, beat: number): number => (beat % 2 ? height + 0.01 : height)
