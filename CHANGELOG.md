# Changelog

What changed in each version, newest first. To update: `/plugin marketplace update crab-buddy`, then `/plugin update crab-buddy@crab-buddy`, then start a new session.

## 0.29.0
See it sooner
- The red flag says how long Claude has waited for you, from a minute on ("needs you: Bash · 4m"), and `/crab stats` adds up the day: "waited 37m for you (5 times)".
- `/crab alert chirp`, `notify` or `both`: a chirp or a notification once Claude has waited a minute. Off unless you switch it on.
- Going in circles: when the tests or the build fail three times in a row, or one command fails three times in a turn, a sign in the sand says so. `/crab circles off` turns it off.
- A fire gone cold on a big context (100k tokens or more) gets a sign and the ready `/compact`: with the cache cold, compacting has nothing left to throw away.

Understand it
- `/crab what` explains everything on the beach right now, one line each. The first time the crab is ever seen it says so, once.
- `/crab sea` lists what fills the context, biggest first, with the connected tools and memory files that take the most. Counted on your machine.
- `/crab mode full`, `helper` or `quiet` sets every switch at once: everything, no speech bubbles, or only the red flag and what is silent. `/crab feedback` names the mode.
- One sign stands in the sand at a time, and what matters more now keeps its place: a context or a limit nearly full, then circles, then the hints about compacting and the cache.
- `/crab bubbles off` takes a bubble that is up down at once.

Keep it
- The bottle ashore: the logbook is kept for a week by project folder, on your machine. A new session there, or `/clear`, with work left open finds a bottle on the beach and a ready first prompt in the box ("Pick up where we left off: ..."). `/crab last` shows it, and `/crab log off` keeps and sends nothing.

## 0.28.1
Fixes from a full security and bug review. Nothing new to learn.
- The "cache cools" sign stayed in the sand after you came back in time and the fire blazed again, for up to ten minutes on the one-hour cache. It now comes down with your prompt.
- A commit title, a name or a repo with an emoji right where the text is cut could be left with half of it, which is not valid text, and that half went into the note for the summarizer and the ready `/compact`. Text is now cut between characters, everywhere.
- In VS Code the heartbeat kept asking for pictures all night in a window left open. It now rests after a quarter of an hour with nothing happening, and while the band is collapsed, and beats again when the session stirs. A running turn never rests.
- A very busy picture (a wide strip, a long walk's footprints, a storm, a holiday's sky) could come out longer than Claude Code draws, and the whole beach was gone for a few minutes. Such a picture now thins its footprints instead.
- If the line where Claude compacts could not be read once, the sea stayed scaled to the whole window for the rest of the session. It is asked for again until it can be read.
- Roaming: a link or a folder in the beaches folder is never read or written through, a file that can't be written no longer stops roaming, and with no home folder known nothing is written (before: a folder at the root of the disk). On Windows the folder goes under your user profile, and a window is named by its folder, not its whole path.
- A `git commit` with a heredoc followed by many blank lines, or a command with a long run of `-c` options, could take seconds to read while Claude waited. Both are read in a moment, and `git -C commit status` is no longer taken for a commit.
- Two looks at the fishing lines at the same moment could land one catch twice.
- A name like `$&` is said as it is.
- Newer Claude Code: a collapsed band is not repainted, the tank's small form (a minimized pane) is drawn, and the code and tests type-check again.
- For the repo: the workflows' actions are pinned to a commit, and CI now fails on a type error, which `claude plugin validate` alone lets pass with a warning.

## 0.28.0
- The sea stayed at the far end all session in VS Code, which can leave out the context's size that the crab read. It now also takes the size each measurement carries and, failing both, a count made on your machine that sends nothing (at most every 20 seconds, and at each turn's end). A read with no size no longer takes a measured sea away.
- The campfire was hidden behind the house the shells unlock, and was small. It is now about half as big again and stands in a stretch nothing else can take: between the house (and a holiday's pumpkin or tree) and the costume's own props.
- The campfire is lit when the context grows between turns too, for surfaces that report turns late, and a restart of Claude Code finds it again for the same conversation.
- In VS Code the beach moved like stop motion. The heartbeat now sends a fresh picture each beat by default, each drawn for its moment, instead of nudging the old one, which only painted a slowed clock again. `/crab pulse nudge` brings the lighter way back. With Reduce Motion on, `/crab pulse nudge` or `off` keeps the crab still.
- `/crab debug` says what the sea and the campfire are going by, source by source, to paste into a report. Nothing is sent.

## 0.27.1
- The campfire stood under the crab's resting spot, so the crab hid it whenever it napped, stretched or hid at home, which is just when the cache cools between prompts. It now stands beside that spot, on the desktop and in the terminal.

## 0.27.0
- In VS Code the beach could drop to one frame a second after the window had been in the background, and stay there: the crab then walked in jumps. The crab now has VS Code paint the picture again ten times a second while it is about (once a second while it naps), so the walk keeps moving. Desktop, mobile and the terminal are not affected.
- `/crab pulse` says how: `nudge` (the default, nearly free), `redraw` (a fresh picture each beat, for when nudging is not enough), `off`, or 1 to 10 beats a second.
- `/crab restart` still redraws a stuck crab by hand.

## 0.26.1
- The hint beside `/crab` in the prompt box was so long that it was cut off after two lines, hiding most commands, `help` among them. It now names the few most people want, with `help` first.
- `/crab help` lists every command, grouped, with the costumes and the parts you can switch on or off.

## 0.26.0
- A campfire by the home shell shows how warm the prompt cache likely still is: it blazes after each reply, burns down, glows as embers and goes cold once the cache has likely expired, five minutes or an hour later as Claude Code decides. Come back in time and your next prompt reads the cache instead of writing the whole conversation to it again.
- With 50k tokens or more of context, a sign goes up shortly before it cools, once per pause: "cache cools in 1 min". Also while Claude waits for your answer, never while it works.
- `/crab cache` says how long is left, why, and what a cold restart would write, in tokens and ≈ dollars. `/crab stats` adds it in a word; `/crab cache off` hides the fire and the sign.

## 0.25.1
- A shell command with many options after `git` could take the crab seconds to minutes to read, and Claude waited for it. It now reads any command in a moment.
- If the crab's own bookkeeping fails around a tool call, the call still runs and its result still reaches Claude.
- Text from outside (repo names, subagent descriptions, commit titles) loses terminal control codes and the invisible marks that reverse text, before it's drawn.

## 0.25.0
- In a terminal (VS Code's, Terminal.app and the rest) the crab is now the desktop's own drawing scaled down to the cells, not a blob of seven: every costume and gadget as the desktop draws it, its eyes, claws and legs, and a walk that moves its legs in turn.
- The strip above the prompt is four rows instead of three. A tank 9 rows or taller draws the crab at half the desktop's size.
- Its eyes and shades use an ink that shows on dark terminals as well as light ones.

## 0.24.0
- What the session costs: `/crab stats` adds the dollars and the tokens (out, in, cached), and `/crab cost` gives the whole picture: cache reads and writes, the helpers' (subagents') share, and each model. On a subscription the dollars are marked as an estimate at API prices.
- A sign goes up at $5, $10, $25, $50 and $100 spent, then every $100, once each. Not while a budget hourglass counts the same money. `/crab cost off` keeps them down.

## 0.23.1
- Working never makes the crab hungry, bored or tired any more: while Claude works, no need drops below 30. Time away still fades food and fun, and caring for it works as before.

## 0.23.0
- `/crab help` lists the main commands, and an unknown word points to it.
- After an update the crab holds up what's new, once, for all your windows. A first install hears nothing; `/crab signs off` keeps it down.
- `/crab feedback` says where to tell the author what you think and prints the facts worth pasting. Nothing is sent.
- Issue templates, including "I turned something off".

## 0.22.2
- The README and the listing lead with what the crab shows you, with a moving demo at the top.
- This changelog.

## 0.22.1
- The weather code lives in its own module. No change in behaviour.

## 0.22.0
- Weather requests time out after 10 seconds, and a failing service is left alone for 15 minutes instead of asked every minute.
- A place found by IP is kept only to about a kilometre, and emptying or changing `weatherPlace` forgets it.
- `auto` is now the recommended weather setting, and the README has a Privacy section.

## 0.21.1
- The logbook note the summarizer gets says it is data, not instructions, in a block nothing logged can close.
- `/crab lines` shows one short line per subagent.

## 0.21.0
- Weather from where you are, opt-in: `auto` (your time zone's city) or `auto-ip` (an IP lookup).

## 0.20.0
- The crab lends a claw: a red flag while Claude waits for you, a ready `/compact` at the right moment, and an hourglass for your usage limit.

## 0.19.3
- The sea follows the context, the crab sinks when it leaves, and end-to-end checks.
- `/crab ride` leaves at once.

## 0.19.2
- A note that the mod is not affiliated with Anthropic.

## 0.19.1
- The tide goes back after a compaction.

## 0.19.0
- Every beach earns its own decor.

## 0.18.0
- Every beach a little different.

## 0.17.0
- The sea follows the real compaction lines, with a mark at 200k.

## 0.16.1
- A little house instead of the lighthouse.

## 0.16.0
- One crab, many beaches: it can roam between your sessions. `/clear` keeps your settings.

## 0.15.0
- Fishing: a rod on the shore for every subagent.

## 0.14.0
- Signs: the crab holds up the news.

## 0.13.0
- The logbook, a bottle for the summary and a good moment sign.

## 0.12.2
- `/crab restart` redraws a stuck crab in VS Code.

## 0.12.1
- Smoother motion, fewer redraws.

## 0.12.0
- Every costume gets a gadget.

## 0.11.0
- A bigger wardrobe: surfer, diver, viking, wizard, DJ, Oktoberfest, raincoat and a crown to earn.

## 0.10.4
- The strip fills the prompt width on desktop and VS Code. `/crab size`.

## 0.10.3
- A README screenshot.

## 0.10.2
- README overview and a release script.

## 0.10.1
- First public release.
