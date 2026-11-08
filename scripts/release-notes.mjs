// The notes for a GitHub Release, from CHANGELOG.md: `node scripts/release-notes.mjs v0.24.0` prints them.
// It refuses a tag that isn't plugin.json's version, or a version the changelog has no entry for, so a
// release can only go out for what the manifest actually ships. The release workflow runs it.

import { readFileSync } from 'node:fs'

const fail = msg => {
  console.error(msg)
  process.exit(1)
}

const tag = process.argv[2] ?? ''
const version = JSON.parse(readFileSync('.claude-plugin/plugin.json', 'utf8')).version
if (tag !== `v${version}`) fail(`Tag "${tag}" is not v${version}, the version in .claude-plugin/plugin.json. Bump it first, or tag v${version}.`)

const lines = readFileSync('CHANGELOG.md', 'utf8').split('\n')
const start = lines.findIndex(l => l.trim() === `## ${version}`)
if (start < 0) fail(`CHANGELOG.md has no "## ${version}" entry. Add one before releasing.`)
const end = lines.findIndex((l, i) => i > start && l.startsWith('## '))
const entry = lines.slice(start + 1, end < 0 ? undefined : end).join('\n').trim()
if (!entry) fail(`The "## ${version}" entry in CHANGELOG.md is empty.`)

console.log(`${entry}

## Updating

At the Claude Code prompt:

\`\`\`
/plugin marketplace update crab-buddy
/plugin update crab-buddy@crab-buddy
\`\`\`

Then start a new session: the crab holds up what's new, once. [CHANGELOG.md](https://github.com/donalfredo2/crab-buddy/blob/main/CHANGELOG.md) has every version.`)
