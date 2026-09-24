# Task: Lane pin-at-tag

Kind: Living. Task record.

- **ID:** 2026-09-23-lane-pin-at-tag-3bf0
- **State:** in-progress
- **Branch:** lane/pin-at-tag-0924
- **Owner:** unassigned
- **Updated:** 2026-09-24T15:35:27.330Z

## Request

LANES.md, dispatched 2026-09-23: the items below are this lane's whole scope, and work that is not among them belongs to another lane.

## Acceptance criteria

- [x] N31. [FEATURE] skilliton pin moves the machine's marketplace to the release tag as well as the skills clone: new lib/marketplace-pin.mjs: read the client's marketplaces with claude plugin marketplace list --json; for the company marketplace (the one join registered, by name) whose source is a git source (github with repo, or git with url), plan remove then add at <source>#skilliton-release/<version> (the GitHub shorthand form owner/repo#tag for a github source, the url#tag form for a git source), then claude plugin update <plugin>@<marketplace> for each installed plugin of that marketplace; run every client command from a new empty temporary folder, never from the project or the current folder (the lesson above: the client's remove empties the project settings of the folder it runs in), and remove the folder after; after the add, read marketplace list --json again and require its ref to equal the tag, else exit 3 naming what the client reported; a marketplace from a local folder is not pinnable and is named as such (exit 1, the clone pin still done); no client found: pin the clone only, print the exact commands to run by hand, exit 1; commands/pin.mjs shows the client commands in the preview and runs them only with --apply, gains --claude <path> like join, and its help loses the sentence saying the client has no ref option (line 28 at the base) and says what is pinned and what is not (a tag, not a commit; verify stays the check); scripts/pin-marketplace.test.mjs with a stub client covering: github and git sources, the preview writing nothing and running nothing, apply running remove, add with the right ref and the updates in that order, the working directory of every stub call not being the project folder, a project fixture's .claude/settings.json byte-identical before and after, the ref check failing loudly when the stub reports another ref, a folder marketplace, and no client. Evidence: node --test scripts/pin-marketplace.test.mjs, the nine pin cases pass with a stub client; node scripts/release.test.mjs 27 of 27.
- [x] N32. [TOUCH] skilliton join with a release adds the marketplace at that release's tag: where join adds the company marketplace (lib/join.mjs, addMarketplace near line 185 at the base, and its caller), use the same source form from lib/marketplace-pin.mjs when join has a release (--release, or the release the join file names) and the source is a git source; join's own client calls run from a neutral temporary folder the same way; when the client refuses the ref form, join reports NOT PINNED with the exact command, continues, and exits 1 instead of 0; a case in scripts/pin-marketplace.test.mjs for a join with a release (the stub sees the #tag form) and one without (no ref). Evidence: node scripts/pin-marketplace.test.mjs 12 of 12 (three join cases: at the tag with exit 0 and every plugin VERIFIED, no ref with --no-pin, NOT PINNED and exit 1 when the stub refuses the tag form); node --test scripts/join.test.mjs 42 of 42.

## Decisions

not yet written

## Checkpoints

### 2026-09-24T04:01:40.104Z

- **State:** N31 built: skilliton pin moves Claude Code's company marketplace to the release tag (remove, add at <source>#<tag>, read back the ref, update the plugins), every client command from a new empty folder; preview runs nothing
- **Evidence:** scripts/pin-marketplace.test.mjs pin cases 9 of 9 with a stub client; release.test.mjs 27 of 27; lint, lint-shape, deadcode, docs, names, scrub-check pass; allowlist.test.mjs fails only on the three rows main has to add to scripts/allowlist.test.mjs
- **Next:** N32: join adds the marketplace at the release tag, from a neutral folder
- **Git:** lane/pin-at-tag-0924 @ c26b084, 6 uncommitted

### 2026-09-24T15:35:27.330Z

- **State:** N31 and N32 built: pin moves the marketplace to the release tag; join adds it at the tag for Claude Code with a GitHub source, reports NOT PINNED and exits 1 when refused; every client command of join and pin runs from a new empty folder
- **Evidence:** pin-marketplace.test.mjs 12 of 12; join.test.mjs 42 of 42; join-redact 1 of 1; release.test.mjs 27 of 27; skilliton, footprint, lint, lint-shape, docs, names, scrub-check, deadcode exit 0; allowlist.test.mjs exit 1 on the three rows only main can add (a scratch copy with them exits 0)
- **Next:** main adds the three allowlist.test.mjs rows and the CI step, then merges
- **Git:** lane/pin-at-tag-0924 @ bf38773, 6 uncommitted

## Handoff

- **State:** N31 and N32 built: pin moves the marketplace to the release tag; join adds it at the tag for Claude Code with a GitHub source, reports NOT PINNED and exits 1 when refused; every client command of join and pin runs from a new empty folder. Evidence: pin-marketplace.test.mjs 12 of 12; join.test.mjs 42 of 42; join-redact 1 of 1; release.test.mjs 27 of 27; skilliton, footprint, lint, lint-shape, docs, names, scrub-check, deadcode exit 0; allowlist.test.mjs exit 1 on the three rows only main can add (a scratch copy with them exits 0).
- **Next:** main adds the three allowlist.test.mjs rows and the CI step, then merges
- **Blocked:** scripts/allowlist.test.mjs needs three rows outside this lane's write set
- **Watch out:** nothing known
