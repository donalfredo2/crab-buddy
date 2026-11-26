# Reliable signals, a lighter crab, a calm beach with holidays

Design, 2026-11-26. For crab-buddy 0.29.0. Three releases: 0.29.1, 0.29.2, 0.30.0.

## Why

The crab exists to show four things without reading the transcript: how full the context is (the sea), whether the prompt cache is warm (the campfire), how much of the usage limit is left (the hourglass), and whether Claude waits for you (the red flag). On the Claude desktop app and in VS Code the first three are unreliable today: the sea does not rise, the fire or the hourglass do not show. The beach also carries so much decoration that the signals get lost among it, and three of the last four releases fixed something that stood in front of the fire.

The owner wants: the signals to work on desktop and VS Code, a beach calm enough that they stand out, and holiday objects that appear only in their holiday period. A performance check ran alongside and found one large cost (VS Code) and several small ones.

## What was measured (2026-11-25, Claude Code 2.1.332)

| Check | Result | Source |
|---|---|---|
| Test suite | 414 of 414 pass, about 40 s | `claude plugin test .` |
| Types and manifest | no errors | `scripts/validate.sh` |
| Animation check | 65 scenarios, 64,579 checks, 0 failed | `bun scripts/check-animations.ts` |
| Parsing, 99,450 fuzz runs | no input up to 110 kB over 50 ms | scratch test in the plugin test harness |
| Picture size | worst 98% of the 131,072 character cap, never over | 8,000 random states |
| VS Code picture traffic | 555 to 748 kB per second while awake | harness, mocked clock |
| VS Code engine calls | about 600 per second while awake | harness |
| Terminal while napping | 111 engine calls per second, with no rest | harness |
| End of a main turn | 96 to 99 awaited engine calls | harness |

All harness figures come from the fake engine the tests use, not from a real desktop or VS Code session. They count calls and bytes exactly. They say nothing about what one call costs in a real session.

## What is known about the three bugs

Pictures rendered at 300, 420, 725 and 1100 px show the sea, the fire and the hourglass drawn correctly whenever their data is present. The fault is in the data reaching the plugin on desktop and VS Code. It was not reproduced: neither surface can be run in the environment the check ran in. What follows is evidence and hypothesis, to be confirmed by Part A's first step.

1. Claude Code's types say of `session.measure`: "`$.session.usage()`'s figures, pushed, not polled". The event carries `context`, `rateLimits` and `cost`. The plugin reads only `context` from it (`hooks/register.tsx:2143`) and polls `$.session.usage()` for the other two.
2. The engine answers `$.session.usage()` with an empty context and no breakdown when no session is bound to the call (the 2.1.332 binary logs "no session bound; the context window is answered empty"). The plain size and the local count then fail together.
3. A reading with no limit windows makes `nextUsage` return null (`hooks/usage.ts:27`), and `refreshUsage` writes that null (`hooks/register.tsx:1100`): one empty reading takes the hourglass away. The types say the list is "empty off a subscription or before the first reading".
4. The campfire's lifetime is chosen from the same polled limits (`hooks/register.tsx:1124`). With none seen it is taken for an API key: five minutes, where a subscription has an hour. The fire is then gone 20 minutes after each reply.
5. A sea that goes by the local count never lights the fire from a measurement (`hooks/register.tsx:2147` excludes counted readings).
6. With no limits seen there is no idle mark, so the sea is scaled to the whole window. On a 1M window 100k tokens then moves the shoreline about 5% of the strip instead of 12%.
7. The hourglass is 7 by 9 px of pale glass (`#CFE8F2`) on a pale sky. "Not showing" may partly be "not seen".

## Goals

- G1. On desktop and VS Code the sea, fire and hourglass show what the engine reports, from whichever source has it, and one empty reading never takes a signal away.
- G2. `/crab debug` output alone says which source failed, for all three signals.
- G3. Tests replay payloads recorded from real surfaces, so the fake engine is never kinder than a real one.
- G4. VS Code sends no fresh pictures while nothing moves: at most 30 kB per second while the crab stands on a calm day (today 555). While it walks it gets a fresh picture every beat as today, each one lighter. Target for a working turn overall: under 150 kB per second (today 587 to 748). No return of the stop motion that 0.28.0 fixed: where the target and a smooth walk conflict, the walk wins and the target is set to what was measured.
- G5. No surface does work for a picture nobody sees: collapsed band, resting terminal, napping desktop.
- G6. No decoration ever stands on or in front of the campfire, the hourglass, a sign or the water's edge, at any width from 200 to 1600 px, in any season, costume or layout. A test holds this.
- G7. A strip shows at most 3 to 5 pieces of decoration, by its width.
- G8. One holiday object, only in its period, and a matching costume.

## Non-goals

- No new signals, no change to what the signals mean.
- No removal of anything a user earned. Everything unlocked stays unlocked.
- No switch back to the busy beach (`/crab beach full`). If testers miss it, it is a later change.
- No cancelling of `$.clock.after` timers. They are bounded (206 pending at most in a simulated busy hour).
- No rewrite of `hooks/register.tsx` into smaller files.

## Anti-goals

- A fix that is green against the fake engine and unverified on a real surface. Every Part A fix ships with a recorded payload or a pasted `/crab debug` that shows it.
- Stop motion back in VS Code.
- A holiday shown to people who do not keep it (4th of July in Munich).
- A beach that looks empty or broken out of season.

## Constraints

- No package.json, no dependencies. Tests run with `claude plugin test .` (all files, no filter), types with `scripts/validate.sh`, animations with `bun scripts/check-animations.ts`.
- `hooks/news.ts` `VERSION` must equal `.claude-plugin/plugin.json` `version` (CI checks it).
- A picture is at most 131,072 characters (`SVG_MAX`, `hooks/scene.ts:770`).
- Everything drawn on desktop has a terminal counterpart in `hooks/terminal.ts`.
- Nothing new is sent anywhere. The time zone is read on the machine, as the weather already does (`hooks/weather.ts:102`).
- CI pins Claude Code 2.1.316. Types used must exist there, and the canary job runs the latest.
- CHANGELOG entries are written for users, in the voice of the existing ones.

## Approaches

### Part A, signals

1. **Patch each symptom** as 0.26 to 0.28 did. Fast, and it has failed four times because the fake engine passed each patch.
2. **Pushed first, polled second, last good kept (chosen).** The measurement event becomes the main source for all three figures, as the engine's types intend. The poll fills gaps. A figure once seen is kept until something says it ended (a reset time passed, `/clear`, a compaction). Recorded payloads become test fixtures.
3. **Stop reading the engine, count everything locally.** Independent of the surface, but limits and cost cannot be counted locally at all.

Chosen: 2. It fixes hypotheses 1 to 5 by construction, and it stays right if the hypothesis about which call fails turns out wrong, because it no longer depends on any single call.

### Part B, VS Code traffic

"Redraw only on change" was the owner's pick. Taken literally it is today's `nudge` mode, which 0.28.0 found not enough: a picture whose own clock has slowed shows the same moment again however often it is painted, and a walking crab changes every beat.

1. **Default back to `nudge`.** 4 to 27 kB per second. Stop motion returns where the image clock is slow.
2. **Full pictures only while something moves across the beach (chosen).** A fresh picture each beat while the crab walks or rides or a flying mark crosses; otherwise the kept picture, nudged, and a fresh one when anything visible changes. Plus pictures that carry only the CSS they use.
3. **Lower the rate to 4 a second.** 60% less, a choppier walk, and still full traffic while nothing moves.

Chosen: 2. It keeps the smooth walk where smoothness shows and removes the traffic where it does not. It needs one look at a real VS Code window before release.

### Part C, the beach

1. **Remove a short list of items.** Simple, but the crab loses activities, and nothing stops the next item from covering the fire.
2. **Keep-clear zones and a cap (chosen by the owner).** Signals own their ground, decoration is ranked and capped by width, nothing is deleted.
3. **Both.** Most rework for little more calm.

## Part A: reliable signals (0.29.1)

### A0. Evidence first

First, before any code: the owner runs the `/crab debug` that 0.29.0 already has, on the desktop app and in VS Code after three turns, and pastes both. It names the sea's sources, says "(no plan limits seen)" when no limit arrived, and gives the fire's state and when turn and measurement hooks last came. That is enough to confirm or kill hypotheses 2 to 5.

Then `/crab debug` gains, for the last measurement event and the last poll each: whether it carried a context size, how many limit windows and their kinds, whether it carried a cost, and for the poll whether a breakdown came back. It also names the hourglass's source and state. The owner runs this fuller version from the branch before 0.29.1 is released, to see the fix on both surfaces. The pasted outputs are kept in the repo as fixtures. If the first paste contradicts the hypotheses above, stop and bring it back before building further. Part A is one release: the evidence gates the work, it is not a release of its own.

### A1. One reading, three sources

A single pure function merges what is known:

- Context size: the event's, else the poll's, else the local count (as today).
- Limit windows: the event's if not empty, else the poll's if not empty, else the last windows seen, for as long as their reset time lies ahead.
- Cost: the event's, else the poll's, else the last seen.

The session keeps the last non-empty limit windows. A kept window is dropped once its `resetsAt` has passed, or five hours after it was seen when it has no reset time. `/clear` and a compaction do not drop them: they start a new conversation, not a new subscription. A measurement whose `changed` names `rateLimits` and whose list is empty drops them at once: the engine is saying the windows left (a switch to API billing).

### A2. The hourglass

- Fed from the merged reading. An empty reading no longer removes it.
- Drawn larger and darker: at least 9 px wide and 12 px tall on desktop, with an outline that reads on both the light and the dark theme. The terminal's three cells stay.
- `/crab what` and `/crab debug` say why there is none when there is none: "no usage limit reported yet", "API billing and no budget set (budgetUsd)", or "switched off".

### A3. The campfire

- Its lifetime is chosen from the merged limits, so a subscription is recognised even when the poll comes back empty.
- A measurement whose context grew feeds the fire whether the size was measured or counted locally.
- If the lifetime was chosen with no limits known and limits arrive within the fire's life, the lifetime is corrected in place (five minutes becomes an hour) without restarting the clock.

### A4. The sea

- Uses the merged limits for the idle mark, so the scale does not flip between readings.
- No other change. If A0 shows that no source carries a size on a surface, the fix for that surface is designed from the evidence, not guessed here.

### A5. Tests

A new test file drives the plugin with recorded shapes: an event with everything, an event with a context but no limits, a poll with an empty context, a poll that throws, limits that appear late, limits that vanish for one reading. For each it asserts what is drawn (sea position, `class="hourglass"`, `class="cfire"`).

## Part B: a lighter crab (0.29.2)

- B1. VS Code: a fresh picture per beat only while something moves across the beach; otherwise keep and nudge. Moving means: the crab walks or rides, a mark crosses (a seagull, a plane, a visiting crab), or the weather falls or blows (rain, storm, snow, wind and its leaves). Drifting clouds, twinkling stars and the lapping sea do not count: on a slowed image clock they move in steps, which is the price of the saving. The default pulse mode becomes this and is called `smart`. `redraw` and `nudge` stay as they are for people who set them.
- B2. The heartbeat no longer computes the whole view to learn the mood: the last render's mood is remembered.
- B3. The terminal painter rests under the same rule as the VS Code heartbeat (15 minutes quiet, no turn running) and wakes when the session stirs.
- B4. A collapsed band returns before building the view or the picture.
- B5. The minute tick does not write needs whose drawn values did not change, so a napping desktop keeps its picture.
- B6. A picture carries only the CSS rules its elements use. Today the style block is 21 to 23 kB of a 55 kB picture.
- B7. The last fallback of `sceneSvg` checks its length, and drops the weather layer if it is still too long.
- B8. Turn handlers read each piece of state once. The cache lifetime's environment and settings are read once per session and again on `session.start`.
- B9. A budget test fails CI when a picture or a handler grows past its budget.

Budgets. They are targets. Today's figures came from a scratch harness that is not in the repo; B9 puts that harness into the repo as a test, first at today's ceilings, and each change then lowers its own ceiling. Scenarios: "working" is a running turn with a tool call every 3 seconds over 30 seconds; "awake and still" is no turn, clear weather, the crab held in one pose; "at rest" is 16 minutes after the last turn. An engine call is any awaited call on `$` that reaches the engine (state, store, clock, session, settings, env, ui).

| What | Today | Budget |
|---|---|---|
| VS Code, working, kB per second | 587 to 748 | 150 |
| VS Code, awake and still, kB per second | 555 | 30 |
| Terminal, at rest, engine calls per second | 111 | 2 |
| `turn.complete` (main), awaited engine calls | 96 to 99 | 60 |
| `ui.render` AbovePrompt, collapsed, engine calls | 32 | 4 |
| Typical 725 px picture, kB | 54 to 57 | 42 |

## Part C: a calm beach with holidays (0.30.0)

### C1. What is always there

The sand, the sea, the home shell and its shell pile, the crab, the sky and weather. The signals when they have something to say: hourglass, campfire, red flag and signs, fishing rods, the bottle, the tide mark, the work pile. The sandcastle, which the crab builds and which is part of its life.

### C2. Keep-clear zones

Each signal owns a stretch that no decoration may enter, at any width:

| Signal | Owns |
|---|---|
| Hourglass and home shell | from the left edge to the start of the crab's track, full height |
| Campfire | its width plus 3 px each side, up to 14 px above the ground |
| Planted sign | its post plus 2 px each side; decoration under the plank is at most 8 px tall |
| Water's edge | 12 px either side of the shoreline: no fixed decoration, only what floats or is planted there by a signal (rods, bottle, boat afloat) |
| Tide mark | 12 px either side |

Decoration that would enter a zone is not drawn in that picture. It is never moved, so nothing jumps about as the tide comes in. One geometry test checks every decoration against every zone across widths 200 to 1600, all layouts, costumes and seasons.

### C3. The cap

Decoration is ranked, and a strip draws the first few that fit:

1. The holiday object, in its period.
2. The one unlocked item on show.
3. The pebble the crab kicks.
4. Seaweed.
5. Tide pool.
6. The day's costume props.

The pebble ranks above the seaweed and the pool because the crab plays with it; the fish still jumps from the sea when there is no pool.

| Strip width | Pieces |
|---|---|
| under 500 px | 2 |
| 500 to 899 px | 3 |
| 900 px and wider | 5 |

A strip's pieces are the first few by rank among those that exist today and stand clear of the fixed zones (home, campfire, sign, tide mark) and of every higher-ranked piece. The tide then only takes away: a piece the shoreline's zone reaches is not drawn, and nothing takes its place, so nothing pops in and out as the sea moves. Today's gates stay: unlocked items and costume props only on strips of 500 px and wider. With the cap, costume props show only from 900 px.

The four small pebbles in the sand are texture, not pieces. An activity whose landmark is not drawn is not planned, by the mechanism that already skips landmarks under the sea.

### C4. One unlocked item at a time

Shells keep unlocking the palm (5), chair (10), house (20) and boat (40) tiers. The beach shows one: the highest tier earned, unless the user picked another with `/crab show palm|chair|house|boat|latest`. The pick is stored for the install. `/crab show` alone lists what is earned and what is on show. The crab sunbathes only when the chair tier is the one on show.

### C5. Holidays

In code and in commands the word is "holiday": "season" already means spring to winter there.

One object stands in the holiday spot: the stretch at 12% of the width where the pumpkin and the tree stand today, widened to hold 12 px, with the campfire's stretch moved right to keep its zone. Objects are at most 12 px wide and 14 px tall. Out of season the spot is empty sand.

| Holiday | Period (local dates, inclusive) | Who sees it | Object | Costume |
|---|---|---|---|---|
| New Year | 31 Dec, 1 Jan | everyone | a rocket in the sand; fireworks 22:00 to 02:00 as today | party hat (new) |
| Valentine's | 14 Feb | everyone | a heart drawn in the sand | cupid wings (new) |
| Karneval | Thursday before Rosenmontag to Shrove Tuesday (Easter minus 52 to minus 47 days) | DACH | a Krapfen with streamers | jester cap (new) |
| Easter | Good Friday to Easter Monday (Easter minus 2 to plus 1) | everyone | a nest of painted eggs | bunny ears (new) |
| 4th of July | 4 Jul | US | a small flag | star-spangled top hat (new) |
| Oktoberfest | 20 Sep to 5 Oct, as today | everyone, as today | stein and pretzel (today's table, cut to the spot's size) | oktoberfest (exists), the whole period as today |
| Halloween | 25 to 31 Oct | everyone | one pumpkin (lit in the evening) | ghost (exists), on 31 Oct only |
| Thanksgiving | fourth Thursday of November to the Sunday after | US | a turkey | pilgrim hat (new) |
| Nikolaus | 6 Dec | DACH | a boot full of treats, in place of the tree for the day | santa (exists) |
| Advent and Christmas | 1 to 26 Dec | everyone | the tree | santa (exists), on 24 to 26 Dec only |

Rules:

- The table decides when a costume is worn: on the days it names (Halloween, Advent and Christmas), else through the whole period. On the other days the daily rotation goes on. A costume the user picked always wins, as today.
- The six new costumes are headwear on the plain crab. They reuse the plain crab's gadget, ride and ride lines, need no drawing of their own in the terminal (it scales the desktop's crab), and can be picked all year with `/crab <name>`, as `santa` and `ghost` can today.
- Where two holidays meet, the shorter one wins for its days (Nikolaus inside Advent).
- Sky effects are New Year's fireworks only. Halloween's bats and the second pumpkin go.
- Region comes from the machine's time zone. US: the `America/` and `Pacific/` zones of the United States. DACH: `Europe/Berlin`, `Europe/Busingen`, `Europe/Vienna`, `Europe/Zurich`. No zone, or one in neither list: the "everyone" seasons only.
- `/crab holidays auto|us|de|all|off`. `auto` is the default. `off` shows no holiday object and no holiday costume. Stored for the install.
- `/crab what` names the holiday object and its holiday, and the day's first greeting names the holiday as it names the day's theme today.
- The terminal draws each object in a few cells, as it does the pumpkin and the tree today.
- Easter is worked out by the Gregorian computus on the machine. No table of dates.

## Decisions the owner made

- Bugs are seen on the desktop app and in VS Code.
- Calm beach with one holiday object. Trim by keep-clear zones and a cap, removing nothing for good.
- Unlocked items show one at a time.
- Holidays: international basics, US holidays, German holidays, shown only in their periods. Natural lengths. Object plus costume.
- VS Code: redraw only on change.
- Clutter matters because it hides the signals. A few less is enough.

## Calls made here, not by the owner

- Three releases, in the order A, B, C: signals first because they are the product.
- "Redraw only on change" is built as "full pictures only while something moves", for the reason given under Approaches.
- US and German holidays go by time zone. Oktoberfest stays for everyone because it already ships that way.
- A long holiday's costume is worn only on its main days, so December keeps its daily costumes until the 24th. Oktoberfest keeps its costume for all 16 days because it ships that way.
- New holiday costumes are headwear that reuses the plain crab's gadget, not full costumes with gadgets of their own.
- Falling and blowing weather counts as movement for VS Code's fresh pictures; clouds, stars and the sea do not.
- The pebble ranks above seaweed and pool, and a piece the tide takes is not replaced.
- An empty limits list that the engine marks as changed ends the kept limits; a window with no reset time is kept five hours.
- Karneval ends on Shrove Tuesday, not on Ash Wednesday itself.
- DACH, not Germany alone, sees Karneval and Nikolaus.
- The cap's numbers (2, 3, 5), the ranking, and the size of each zone.
- No `/crab beach full`.
- The hourglass's new size and the names `smart`, `/crab show`, `/crab holidays`.

## Left to the builder

- The pixel art of every new object and costume, within the sizes given, in the style of `holidayDecor` (`hooks/scene.ts:201`) and the costumes in `hooks/sprites.ts`.
- Exact pixel positions, as long as the geometry test passes.
- How the per-handler read cache is written.
- Which CSS rules belong to which elements, as long as the animation check passes.
- The words of new bubbles, signs and help lines, in the voice of `hooks/lines.ts`.

## What this means in 3 to 12 months

- Six new costumes and nine objects are art that needs a terminal twin and a place in the animation check. Each later holiday costs the same again.
- The keep-clear test turns "something hides the fire" from a bug report into a red build.
- Recorded payloads age. When the canary job goes red on a new Claude Code, the fixtures are the first thing to record again.
- If testers miss the busy beach, `/crab beach full` is a small addition: the cap is one number.
- The crab does a little less on narrow strips, where its landmarks are capped away. If it reads as dull, the holiday objects are where to give it something to do.
