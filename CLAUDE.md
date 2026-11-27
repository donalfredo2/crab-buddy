# CLAUDE.md: crab-buddy

Read this first. You start from a fresh clone with no memory of earlier sessions.

## What it is
- A Claude Code plugin: a pixel crab on a beach above the prompt that shows the context (the sea), Claude waiting for you (red flag), the usage limit or budget (hourglass), session cost, prompt cache warmth (campfire) and a ready `/compact`. All commands live under `/crab` (`/crab help` lists them).
- Manifest: `.claude-plugin/plugin.json` (version, `userConfig` settings). `.claude-plugin/marketplace.json` serves the repo root (`"source": "./"`), and the marketplace serves `main`: a merge to main is what users get.
- `hooks/hooks.json` loads one engine module, `hooks/register.tsx`. The engine API comes from Claude Code itself (`import ... from 'claude-code'`, tests from `claude-code/testing`). There is no package.json and no dependencies.
- Users install with `/plugin install crab-buddy --marketplace donalfredo2/crab-buddy`. README says it needs Claude Code 2.1.309 or later.
- The owner (Andy) merges PRs that Claude opens. Do not merge yourself.

## Layout
- `hooks/register.tsx`: every hook (`session.start`, `turn.start`, `turn.complete`, `session.measure`, `session.compact`, `tool.call`, `prompt.submit`, `ui.render`, `command.run` for `/crab`, ...), all atoms, and the `/crab` command handler.
- Pure modules beside it: `life.ts` (life plan), `scene.ts` (SVG picture, `SVG_MAX`), `terminal.ts` (half-block terminal beach), `sprites.ts`, `gadgets.ts`, `pixelart.ts`, `signs.ts`, `lines.ts` (the crab's words), `reading.ts` (merging figures from sources), `usage.ts`, `spend.ts`, `cache.ts`, `wait.ts`, `circles.ts`, `ashore.ts`, `logbook.ts`, `roam.ts`, `pulse.ts`, `modes.ts`, `legend.ts`, `state.ts` (store keys, settings), `text.ts` (sanitizing outside text).
- `hooks/weather.ts`: the one effectful module outside register.tsx (touches no atom, returns its result).
- `hooks/news.ts`: `VERSION`, `NEWS`, `NEWS_LONG`, `REPO`.
- `hooks/*.test.tsx`: tests (`crab.test.tsx` pure parts, `e2e.test.tsx` drives the real `register()`).
- `types/index.d.ts`: shared types (declared in plugin.json `types`).
- `scripts/`: `validate.sh`, `release-notes.mjs`, `check-animations.ts`, `preview-terminal.ts`, `make-demo.ts`, `make-icon.ts`.
- `sounds/chirp.wav`, `docs/` (demo.gif, screenshots, `tester-note.md`), `docs/superpowers/specs` and `plans` (design for 0.29.1, 0.29.2, 0.30.0; only 0.29.1 has shipped).

## Validate and test locally
- `scripts/validate.sh`: `claude plugin validate .` but fails on any `error TS`. Plain validate only warns on type errors, so always use the script. About 6 s.
- `claude plugin test .`: every `*.test.tsx` through the real mod. 435 tests, about 46 s. Run all files, there is no filter.
- `bun scripts/check-animations.ts`: the beach in real Chromium via playwright (`npm install --no-save --no-package-lock playwright@1.63.0`, then `npx playwright install chromium`). About 3 minutes. `CRAB_ONLY=<name>` runs one scenario, `CRAB_SHOTS=<dir>` saves PNGs.
- `bun scripts/preview-terminal.ts <folder>`: PNGs of the terminal beach per costume (`CRAB_ONLY`, `CRAB_ROWS`).
- `node scripts/release-notes.mjs vX.Y.Z`: prints the release notes, fails if the tag is not plugin.json's version or the changelog lacks the entry.

## What CI runs (.github/workflows/test.yml)
- On push to main, every PR, weekly (Monday) and by hand.
- `validate and test`: Claude Code pinned to 2.1.316, then `scripts/validate.sh`, a check that `hooks/news.ts` contains `export const VERSION = '<plugin.json version>'` (single quotes, exact), then `claude plugin test .`. This job gates merging.
- `validate and test (latest Claude Code)`: the canary. Same checks on `@latest`, `continue-on-error`. Red here while the pinned job is green means a new Claude Code release changed something the crab relies on.
- `animation check`: Bun 1.4.4 (from cache or npm, not GitHub downloads), playwright 1.63.0, Chromium, `bun scripts/check-animations.ts`.
- Types you use must exist in the pinned 2.1.316. Workflow actions are pinned to commit SHAs and moved by Dependabot.

## Release procedure
- Bump the version in `.claude-plugin/plugin.json` and the `VERSION` in `hooks/news.ts` together, add a `CHANGELOG.md` entry for it, merge to main. The release workflow then tags `vX.Y.Z` on main and publishes the GitHub Release automatically. Do not push tags by hand.
- In the same change, update `NEWS` in `hooks/news.ts` (the sign after an update: `new: ` plus NEWS is at most 22 characters, a test enforces it) and `NEWS_LONG` (shown in `/crab help`, must contain the version, a test enforces it).
- `scripts/release-notes.mjs` builds the Release body from the `## X.Y.Z` changelog entry and refuses a tag that does not match plugin.json or has no non-empty entry.
- Users update with `/plugin marketplace update crab-buddy`, then `/plugin update crab-buddy@crab-buddy`, then start a new session (matches README and CHANGELOG header).
- Versioning, from history: patch for fixes only (0.28.1 "Nothing new to learn", 0.27.1), minor for new features or commands (0.26.0 campfire, 0.29.0).

## Changelog and commit voice
- Changelog entry: `## X.Y.Z`, optionally a one-line summary or plain group lines (0.29.0: "See it sooner", "Understand it", "Keep it"), then bullets. Written for users, in plain words about what they see on the beach, not about code. Commit 1971770 made 0.29.1 plainer by dropping internal detail.
- Keep the crab's voice simple and concrete; new bubbles, signs and help lines follow `hooks/lines.ts`.
- Commit subjects describe the user-visible change, often with the version: "Campfire beside the resting crab, not under it (0.27.1)". Bodies explain cause and evidence.
- Code comments say why, in full sentences (see the headers of `register.tsx`, `text.ts`, `validate.sh`).

## How hooks must behave
- Watch, never block. `tool.call` goes through `watchTool`: the crab's own bookkeeping before and after is wrapped in `.catch`, so a failure never stops the call or replaces its result (09b7283). Handlers call `next(e)` and pass its result on.
- Be fast on the hot path. Bash command parsing runs after the tool returns but before Claude sees the result: a backtracking regex once stalled turns for 5 to 20 s (09b7283) and was fixed again in a975db6. Keep patterns linear and bounded.
- Sanitize outside text (commit titles, paths, repo names, subagent descriptions, other sessions' files) with `clip`, `oneLine`, `cut` from `hooks/text.ts`: strips C0/C1 controls and bidi marks, never cuts half an emoji.
- Send nothing new over the network. Weather is opt-in (`weatherPlace`), `/crab feedback` only prints a link, `/crab debug` sends nothing.
- No noise: `/crab mode quiet|helper|full` and the per-feature `off` switches must keep working; one planted sign at a time, by priority.

## Gotchas from history
- `register.tsx` is one file on purpose: the engine reads each file to list what it does, so an atom must be declared in the file that reads or writes it, `$` may only be passed to functions declared there or imported, and state keys (like `savvyFlow`) must be literals in that file. The spec rules out splitting it.
- Store end times, not flags (`plantedSign`, `bottleUntil`): a reload drops the timer that would have cleared a flag.
- Surfaces differ. `$.session.usage()` can answer empty on the desktop app and VS Code. The sea, hourglass and cost merge the `session.measure` event, the poll and the last value kept (`reading.ts`), and one empty reading must never take a signal away (0.28.0, 0.29.1).
- The campfire's lifetime (5 minutes on an API key, 1 hour on a subscription) is inferred from the limits seen; limits that show up late once gave subscriptions 5 minutes (0.29.1).
- VS Code can drop to one repaint a second after the window was in the background. A heartbeat (`pulse.ts`, `/crab pulse`, default `redraw`) re-sends pictures up to 10 times a second, rests after 15 quiet minutes and while the band is collapsed (0.27.0, 0.28.0, 0.28.1). Nudging alone gave stop motion. Do not bring stop motion back.
- Picture size cap: `SVG_MAX` 131,072 characters (`scene.ts`). Over it the whole beach vanishes; busy scenes thin their footprints instead (0.28.1).
- Everything drawn on desktop needs a terminal counterpart in `terminal.ts`. The terminal repaints 4 times a second (once while napping) only while on screen.
- Keep decoration off the campfire, hourglass, signs and the water's edge: three of four releases before the spec fixed something standing in front of the fire (spec goal G6, planned for 0.30.0).
- The test harness's fake engine can be kinder than a real surface. Desktop and VS Code cannot be run here: for reports from them, rely on `/crab debug` output, and do not call a surface bug fixed on fake-engine tests alone.
- `/crab restart` redraws a stuck crab; `/crab what` explains the beach; `/crab debug` says what each source carried.
- CI flakes once came from GitHub release downloads (504) and Ubuntu mirrors; the workflow already has fallbacks. Do not edit `.github/` unless asked.

## Before you open a PR
- [ ] `scripts/validate.sh` passes with "No type errors."
- [ ] `claude plugin test .` passes in full.
- [ ] If you touched drawing, life, sprites, gadgets or the terminal: `bun scripts/check-animations.ts` (or say in the PR that you could not run it).
- [ ] New user-visible behaviour has tests (e2e through `register()` where it is a feature) and a terminal counterpart if it is drawn.
- [ ] Releasing: plugin.json `version`, `hooks/news.ts` `VERSION`, `NEWS`, `NEWS_LONG` and a `CHANGELOG.md` entry all agree; `node scripts/release-notes.mjs vX.Y.Z` prints the notes.
- [ ] README updated if commands, settings or what is stored changed.
- [ ] No new network calls, outside text sanitized, hook bookkeeping cannot block or throw into a tool call.
- [ ] PR description says what was checked and what was not (surfaces you could not run).
