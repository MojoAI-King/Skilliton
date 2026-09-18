# Token efficiency ships in the harness: an enforced read guard, the rules in the block, a gate command, the compaction window, and a meter that reproduces its reference

Kind: Living. Decision entry.

- **ID:** 2026-09-18-token-efficiency-ships-in-the-harness-an-a3f4
- **Status:** accepted
- **Date:** 2026-09-18

## Decision

The token-efficiency setup that lived as a personal skill on one machine becomes part of what Skilliton gives every team, in five pieces, each in the place the harness already has for it:

1. **The read guard is a hook of the context-hygiene plugin** (`hooks/read-guard.mjs`, PreToolUse with matcher Read). A whole-file read of a non-image file over 50KB is refused with the reason; a ranged read, an image or a PDF is never refused. It fails open on anything unexpected and logs each refusal to `~/.claude/skilliton/read-guard.log`.
2. **The rules are a section of the harness template** ("Session cost" in `templates/harness.md`), so every prepared project receives them by the instructions migration, labelled enforced or instructed like every other line. The project's own text outside the block keeps only what is particular to it.
3. **`skilliton gate` is a runtime command** that runs the delivery policy's checks, else `npm run verify`, else the command given, and returns the exit status, the tree it ran on and on failure a bounded tail, with the full output in `.git/skilliton/gate/<label>.log`.
4. **The compaction window is a key of the team settings template** (`autoCompactWindow: 200000` in `templates/project-settings.json`), which the documented settings scope lets a shared project file carry.
5. **The meter keeps the copy with the largest output count inside a duplicate group**, counts a locally written `<synthetic>` message without calling it a request, and has a reference check that must reproduce the known window where the transcripts exist and reports NOT RUN elsewhere. Open item O2 closes.

The owner's four everyday skills (`maintain`, `dispatch`, `/autocompact 200k`, `token-efficiency`) are all in the product after this: the first two were already workflow skills, the third is the settings key, the fourth is the five pieces above.

## Why

A rule in a personal skill reaches one machine; the harness reaches every project a team prepares. The pieces went where the harness already had a mechanism, instead of a sixth mechanism: a plugin hook is how Skilliton enforces, the template migration is how instructions reach projects with receipts, a runtime command is how a repeatable action stays on the assistant's path, and the team settings template is how a client setting reaches a shared project file. The measurement came with it because the personal meter had already found, and the repository's meter had not, why the subagent figure was short: not a scope or a cutoff (the guess in O2) but a copy of each response written while it was still streaming, carrying an output count of 1 or 2, which first-copy-wins kept. That is a mechanism, checked on 1,794 groups, not a tuning toward the target.

## Alternatives rejected

- **Copying the personal skill's files into a plugin as they were.** Its meter's self-test read one machine's transcripts, its harness took `HOME` from the environment, its gate wrapper carried another project's names, and its rules text carried percentages this repository's rule forbids. Each piece was rewritten for a team and tested here.
- **A `gate.mjs` copied into each project** (what the personal skill did). A copy drifts from the plugin and needs a `scripts/` folder; the runtime command is on the path wherever the plugin is enabled and reads the project's own delivery policy, so the local run and the shared branch's gate cannot list different checks.
- **Putting the compaction window in the harness block as an instruction.** The client enforces the settings key; an instruction is followed sometimes. The block still says what the key does, so an assistant knows not to wait for it.
- **Recording the usage baseline now that the meter reproduces its reference.** It would publish one machine's per-day reconstructed cost; whether that belongs in a public repository is the owner's decision (docs/USAGE_BASELINE.md).

## Risk

A live refusal of a Read has not been observed in a Claude Code session; the deny shape is measured for Bash and the Read tool's input fields come from the tools reference and a captured payload (docs/CLIENTS.md; docs/BACKLOG.md B34). The read guard sees only the Read tool: a shell command that prints a whole file is the guardrails plugin's business, and it does not cover that either. `skilliton gate` runs a project's checks with the developer's environment, not an isolated one, and says so. A team whose `.claude/settings.json` already sets a different window will have it changed by `project-settings --apply`, which lists the change first. On Windows the read guard is a Node script run through Git Bash's `env`, unmeasured like every hook there.

## Reversibility

Easy. Disabling the context-hygiene plugin removes the guard; the template section is one block of `harness.md` and a migration carries its removal the same way it carried its arrival; `gate` is one command with one engine; the settings key is one line of the template; the meter's earlier dedup is one `Map` lookup away, and the fixtures would fail on it.

## Evidence

`scripts/read-guard.test.mjs` (16 tests), `scripts/gate.test.mjs` (13), `scripts/token-cost.test.mjs` with `--reference` (fixtures fail under first-copy-wins; 1919 and 439 requests, $407.68 and $70.72 at the 5m rate, reproduced on this machine), migration `0100-instructions-ff8374b8e33a` applied to this repository, `scripts/allowlist.test.mjs` (the read guard and the gate in the empty-home scenario; `npm` and the two logs on the allow list), `scripts/footprint.test.mjs` (the gate's two process-group starts named), docs/CLIENTS.md for what is documented rather than measured.
