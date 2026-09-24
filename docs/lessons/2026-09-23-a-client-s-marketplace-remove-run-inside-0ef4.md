# A client's marketplace remove run inside a repository also empties that repository's plugin settings

Kind: Living. Lesson entry.

- **ID:** 2026-09-23-a-client-s-marketplace-remove-run-inside-0ef4
- **Status:** accepted
- **Date:** 2026-09-23

## What broke

While measuring whether a marketplace can be pinned at a release tag, `claude plugin marketplace remove skilliton` was run from inside this checkout with `CLAUDE_CONFIG_DIR` pointing at an empty scratch folder. The scratch configuration lost the marketplace, as intended, and so did this repository: its committed `.claude/settings.json` had `enabledPlugins` and `extraKnownMarketplaces` emptied, which would have switched the four plugins off for every session opened here and for every clone after a commit.

## The mechanism

Claude Code 2.1.278's remove acts on every settings scope that declares the marketplace and is visible from the working directory, and the project scope is the `.claude/settings.json` of the folder the command runs in. `CLAUDE_CONFIG_DIR` redirects the user scope only. So a command that looks confined to a scratch configuration is not confined when its working directory is a project.

## The fix

`git restore .claude/settings.json` the same minute, confirmed with `git diff --quiet`; the user configuration was checked with `claude plugin marketplace list` and `claude plugin list` and was untouched. The observation is filed in evidence/live/2026-09-23-marketplace-pinned-at-a-release-tag.md, and the lane that makes `skilliton pin` move a machine between release tags is told to run the client from a folder that is not a project and to compare the project's settings before and after.

## The rule

Run a client's plugin or marketplace command that changes state from a neutral working directory (a new empty folder), never from inside a repository, unless changing that repository's settings is the point; and after any such command, check `git status` for `.claude/settings.json` before doing anything else.

## What now enforces it

`scripts/pin-marketplace.test.mjs`: every stub client call made by `pin` and `join` runs from a folder that is not the project, and a fixture project's `.claude/settings.json` is byte-identical before and after (runtime/lib/marketplace-pin.mjs runs each client command from a new empty temporary folder). Nothing enforces it for a person or a session running the client by hand.
