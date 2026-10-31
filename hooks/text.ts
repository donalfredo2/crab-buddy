// Text that comes from outside the mod (a commit message, a path, a subagent's description, a
// file another session wrote, an API's answer) passes through here before it's drawn or said.

const CONTROL = /[\u0000-\u001f\u007f]/g

/** Safe inside an SVG text node or a double-quoted attribute. */
export const xml = (s: string): string => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)

/** One line: control characters (newlines too) become spaces. */
export const oneLine = (s: string): string => s.replace(CONTROL, ' ').trim()

/** Control characters dropped, trimmed and cut to `max`; trimmed again so a cut at a space doesn't keep it. */
export const clip = (s: string, max: number): string => s.replace(CONTROL, '').trim().slice(0, max).trim()
