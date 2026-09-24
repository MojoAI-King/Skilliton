# A marketplace added at a release tag stays on it

Kind: Evidence. Measured 2026-09-23 between 23:40 and 23:50 EDT on Claude Code 2.1.278, macOS, each run in its own empty `CLAUDE_CONFIG_DIR` under a scratch folder, so no real configuration was read or changed. No model session was started and nothing was sent to a model.

## What was run, and what it did

| Run | Command | Result |
| --- | --- | --- |
| 1 | `claude plugin marketplace add "https://github.com/MojoAI-King/Skilliton.git#skilliton-release/1.3.0"` | "Cloning repository ... (ref: skilliton-release/1.3.0)", then added, "declared in user settings". The clone's HEAD is 6fd624b and `git describe --tags --exact-match` reads `skilliton-release/1.3.0`. |
| 1 | `claude plugin marketplace list` | `Source: Git (https://github.com/MojoAI-King/Skilliton.git@skilliton-release/1.3.0)` |
| 1 | what it wrote | `known_marketplaces.json` and the user settings' `extraKnownMarketplaces` both carry `"source": {"source": "git", "url": "...", "ref": "skilliton-release/1.3.0"}` |
| 1 | `claude plugin marketplace update skilliton` | updated; the clone is still on 6fd624b, exactly the tag |
| 1 | `claude plugin install workflow@skilliton` | installed workflow 0.24.0, the version release 1.3.0 carries |
| 2 | a second empty config holding only those settings (`extraKnownMarketplaces` with the ref, `enabledPlugins`), then `marketplace list` and `plugin list` | "No marketplaces configured", "No plugins installed": the settings alone did nothing without a session. Whether a session start acts on them needs a signed-in fresh configuration (backlog B3), so it is **not verified** |
| 3 | `marketplace add` with `#<the full 40-character commit of the tag>` | refused: `fatal: Remote branch <sha> not found in upstream origin`. The ref is passed to a branch-or-tag clone, so a commit cannot be named |
| 4 | `claude plugin marketplace add "MojoAI-King/Skilliton#skilliton-release/1.2.0"` | added; `marketplace list --json` gives `"source": "github", "repo": "MojoAI-King/Skilliton", "ref": "skilliton-release/1.2.0"`; the clone is exactly on the 1.2.0 tag |
| 4 | `marketplace remove skilliton`, then `marketplace add "MojoAI-King/Skilliton#skilliton-release/1.3.0"` | the clone is exactly on the 1.3.0 tag and the settings carry the new ref: moving a machine between releases is a remove and an add |

## What this changes

- The note of 2026-09-21 (measured on 2.1.276) that `marketplace add` and `marketplace update` "take no ref, tag or branch" is wrong for 2.1.278: they take none as an option, but the source takes `#<branch or tag>`, as the documentation says ("To add a specific branch or tag, append # followed by the ref", https://code.claude.com/docs/en/discover-plugins.md, retrieved 2026-09-23). Whether 2.1.276 accepted the same form was not tested then and is not known now.
- A machine's own download can therefore follow a signed release tag instead of the branch, which is the half of backlog B18 that was recorded as not available.
- What the pin is not: a tag is a name, and whoever can move a tag on the remote can move every machine that follows it. The client cannot pin a commit (run 3). What catches a moved tag is `skilliton verify`, which reads the installed files against the signed manifest and says TAMPERED or UNKNOWN VERSION; the pin narrows what a machine downloads, the signature decides what it trusts.
- Managed settings: the documentation names `ref` and `sha` fields on git-based plugin sources inside a marketplace (https://code.claude.com/docs/en/plugin-marketplaces.md, retrieved 2026-09-23), and the settings this client writes carry `ref` on the marketplace source. Whether a managed-settings file carrying the same object makes an enrolled machine follow the tag at its next session is not verified (run 2).

## A side effect found while measuring

Run 4's `claude plugin marketplace remove skilliton` was started from inside this repository's checkout, with `CLAUDE_CONFIG_DIR` pointing at the scratch folder. It also emptied the repository's own `.claude/settings.json`: `enabledPlugins` and `extraKnownMarketplaces` became `{}` (file changed at 23:44:15 EDT, the minute of that run). The user configuration was untouched, and the file was restored from its committed version with `git restore` at once. So the client's remove acts on the project settings of the folder it runs in as well as on the configuration it was pointed at. Anything that moves a pin by remove and add must run the client from a folder that is not a project, and check afterwards that the project's settings did not change.
