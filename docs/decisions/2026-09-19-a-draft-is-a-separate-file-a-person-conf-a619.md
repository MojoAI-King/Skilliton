# A draft is a separate file a person confirms; prepare drafts from what the repository shows

Kind: Living. Decision entry.

- **ID:** 2026-09-19-a-draft-is-a-separate-file-a-person-conf-a619
- **Status:** accepted
- **Date:** 2026-09-19

## Decision

`skilliton prepare` reads the repository before it writes, through `runtime/lib/stack.mjs`, and what it reads becomes a draft: a value a program proposed from evidence in the repository and a person has not yet confirmed. Three things are drafted (workflow 0.10.0). First, the dispatch fields in `.skilliton/config.json`: `laneTestCommand` from the first build file that declares a test command (package.json `scripts.test`, then `scripts.verify`, then pytest through pyproject.toml, pytest.ini or conftest.py, then go.mod, Cargo.toml and a Makefile `test:` target; nothing is run and a malformed package.json counts as absent), `laneRoot` as `../<folder name>-lanes`, and `hotspots` as the paths changed in at least one tenth of the last 200 commits outside `dispatch.mainOnlyPaths`, at most five, only once the history holds ten commits. The preview prints each drafted value with its source; `--apply` prints that plan again and then writes it; a key already set is kept and listed as kept; when nothing is detected the summary says so and names the key to set by hand. Second, a delivery policy draft, written as its own file `.skilliton/delivery.draft.json` with one check named `tests` from the detected command, only when a command was detected and neither the policy nor a draft exists. No gate reads a draft: `skilliton gate` refuses and names the confirm command, and `skilliton delivery confirm --apply` is the one way the draft becomes `.skilliton/delivery.json`, after which it is committed and signed like any other policy change. Third, the first task record takes the user's words: `task start --request "<what they asked for>"` fills the Request section, and the acceptance criteria stay the assistant's proposal. The session start offer names that order: preview, apply, first task.

The same wave settles the terminal command's path from measurement rather than from the docs: the harness template says the launcher `skilliton join` writes is the route a session resolves first, and that the workflow plugin's own `bin/` reaches the Bash tool's PATH in a session started after the plugin was installed. On Windows join also writes `skilliton.cmd` beside the POSIX launcher, for PowerShell and the Command Prompt, with the same never-overwrite and undo rules.

## Why

The owner answered three questions on 2026-09-19 before the wave was planned. The draft policy lives in a separate file, so that a gate can never run a policy nobody looked at: a draft written straight into `.skilliton/delivery.json` would be enforced the moment it was committed, and a field inside the policy marking it a draft would need every reader to honor that flag. The Windows launcher is built now with a content test rather than waiting for a Windows machine, because the file's content is deterministic and the live run belongs to the owner's Windows pass anyway. The drafted dispatch fields are written on apply, not left as preview-only suggestions, because a value the person saw in the preview and applied is confirmed by the apply; leaving them out would mean typing the same values by hand after reading them on screen.

Detection reads files and never runs a command, because prepare runs in repositories nobody has reviewed yet. The hotspot rule needs ten commits because on a shorter history every path recurs and the list would be the whole repository. The PATH sentence was rewritten because the template claimed a route this repository's own session did not have: the plugins were installed after the session began, and the measured cause is that the client computes the Bash tool's PATH at session start.

## Alternatives rejected

- Writing the drafted policy straight into `.skilliton/delivery.json` with a `"draft": true` field: rejected by the owner; a flag inside the policy is one more thing every gate must honor, and a gate that forgets it enforces an unreviewed policy.
- A `--draft` flag on `skilliton delivery` that writes the draft on demand instead of prepare writing it: rejected, because the one-yes preparation is the point of M8; a second command is a second thing the person has to know.
- Running the detected command during prepare to see whether it passes: rejected; prepare must not execute repository code.
- Detecting more stacks (Gradle, Maven, dotnet, mix): deferred, not rejected; the detector table is one list in `stack.mjs` with one test row each.
- Documenting the Windows launcher as not built until a Windows machine is available: rejected by the owner in favor of building it with a content test.
- Keeping the harness template's PATH sentence as it was: rejected, because it was measured wrong in this repository's own session.

## Risk

A draft is what the repository showed, not what the team wants: a package.json whose `scripts.test` is a placeholder drafts a check that passes without testing anything, which is why the draft is never run until confirmed and the confirm preview prints the command. The hotspot list is a frequency count, not a judgment; it names paths that change often, which includes files that change for boring reasons. The Windows launcher has never been executed on Windows: its content is pinned, its behavior there is unverified until the owner's pass with 03-02. The PATH measurement comes from one machine and one headless run with Claude Code 2.1.92 and the bundled 2.1.276; another client version may compute the PATH differently, and the interactive session in this editor was not the one measured.

## Reversibility

Deleting `.skilliton/delivery.draft.json` undoes the draft; nothing reads it. The drafted dispatch fields are ordinary config keys a person edits or removes. `task start` without `--request` behaves as before. The Windows launcher is one file join writes and undo removes; a receipt without `launcherCmd` still undoes. What would change this decision: a team asking for the draft to be enforced at once (then the confirm step is the thing to shorten, not remove), or a detected command that misleads people often enough that detection should ask rather than propose.

## Evidence

- `packs/base/plugins/workflow/runtime/lib/stack.mjs`, `lib/prepare.mjs` (`draftDispatch`, `deliveryDraft`, the `draft` item action), `lib/delivery.mjs` (`planConfirm`, `applyConfirm`), `lib/gate.mjs` (the draft refusal), `commands/delivery.mjs` (`confirm`), `lib/tasks.mjs` and `commands/task.mjs` (`--request`), `lib/lifecycle.mjs` (`prepareOffer`), `lib/join.mjs` and `commands/join.mjs` (`skilliton.cmd`); workflow plugin 0.10.0.
- `scripts/stack.test.mjs` (6), `scripts/prepare.test.mjs`, `scripts/gate.test.mjs` (18), `scripts/delivery.test.mjs` (13), `scripts/lifecycle.test.mjs` (38), `scripts/join.test.mjs` (39), all passing 2026-09-19.
- `scripts/rehearsals/projects.mjs` steps N1, K1 node, K2 python, K3 go: 12 of 12 PASS, `evidence/rehearsals/2026-09-19-projects/`.
- `evidence/live/2026-09-19-which-skilliton-in-a-session.md` and `evidence/live/2026-09-19-path-in-a-new-session.md`.
- docs/CONTRACTS.md sections 2, 10, 11, 13 and 14; docs/DELIVERY.md section 1; docs/WINDOWS.md; docs/areas/02-auto-harness batches 01, 02 and 04.
