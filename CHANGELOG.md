# Changelog

What changed in each version, newest first. To update: `/plugin marketplace update crab-buddy`, then `/plugin update crab-buddy@crab-buddy`, then start a new session.

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
