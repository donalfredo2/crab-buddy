// Text that comes from outside the mod (a commit message, a path, a subagent's description, a
// file another session wrote, an API's answer) passes through here before it's drawn or said.

// C0 and C1 controls (U+009B is a terminal's CSI), and the invisible marks that reverse or reorder text.
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g
const UNSAFE_CHAR = /^[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]$/

/** One character a terminal or a reader could be fooled by: a control, or a direction mark. */
export const isUnsafeChar = (c: string): boolean => UNSAFE_CHAR.test(c)

/** Safe inside an SVG text node or a double-quoted attribute. */
export const xml = (s: string): string => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)

// Half of a character outside the basic plane (most emoji), on its own: not valid text, and a request that
// carries one may be turned down for it.
const LONE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g

/** Text with every half character dropped: what's left is well formed. */
export const whole = (s: string): string => s.replace(LONE, '')

/** The first `max` units of `s`, never ending on half a character: an emoji at the cut goes whole. */
export const cut = (s: string, max: number): string => whole(s.slice(0, Math.max(0, max)))

/** One line: control characters (newlines too) become spaces. */
export const oneLine = (s: string): string => whole(s.replace(CONTROL, ' ')).trim()

/** Control characters dropped, trimmed and cut to `max`; trimmed again so a cut at a space doesn't keep it. */
export const clip = (s: string, max: number): string => cut(s.replace(CONTROL, '').trim(), max).trim()
