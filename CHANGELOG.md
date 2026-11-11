# Changelog

What changed in each version, newest first. To update: `/plugin marketplace update crab-buddy`, then `/plugin update crab-buddy@crab-buddy`, then start a new session.

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
