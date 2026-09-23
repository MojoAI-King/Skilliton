# Token direction-of-travel counts gate runs and read-guard refusals by structural markers, not substring search

Kind: Living. Decision entry.

- **ID:** 2026-09-22-token-direction-of-travel-counts-gate-ru-cda2
- **Status:** proposed
- **Date:** 2026-09-22

## Decision

`scripts/token-direction.mjs` counts `skilliton gate` runs by splitting each Bash command on shell separators and requiring a segment to start with `skilliton gate` or `node .../skilliton.mjs gate`, followed only by `--cmd`, a redirect, a pipe, or nothing. It counts read-guard refusals by Claude Code's own `"PreToolUse:Read hook error"` wrapper text, not the hook's own reason string.

## Why

Built and checked against this machine's real transcripts (this checkout's own project folder, whose key is derived at run time and never written down, per `scripts/token-direction.mjs`'s own file header), three cheaper approaches all failed:

1. A bare `"gate"` substring match overcounted by more than 100x (filenames and PLAN.md headings mentioning gate).
2. An unanchored whole-command regex search matched the invocation syntax quoted inside a heredoc that writes `gate.mjs`'s own source (a Bash command that authors that file's comments, which themselves show example usage).
3. A start-anchored, per-segment match without a required trailing boundary still matched two real sentences of prose that happen to start with the words "skilliton gate": `"skilliton gate built in workflow 0.8.0 with 13 tests"` and `"skilliton gate in this repository has no checks of its own"`.

For read-guard refusals, the hook's own reason text (`packs/base/plugins/context-hygiene/hooks/read-guard.mjs:58-64`) turned up far more often as quoted source, a diff, or a test fixture in these transcripts than as a real denial. Claude Code's own `"PreToolUse:Read hook error"` wrapper is runtime text the hook's source file does not itself contain, so it does not fire on a session merely reading or quoting the hook.

## Alternatives rejected

- Bare substring match on `"gate"`: overcounted by two orders of magnitude, rejected outright.
- Unanchored regex search of the whole command string: caught the heredoc false positive, rejected.
- Start-anchored per-segment match with no trailing-boundary requirement: caught two prose false positives, rejected.
- Reading `~/.claude/skilliton/read-guard.log` (the hook's own append-only log) instead of the transcripts: rejected as the primary source because it is scoped to the whole machine, not one project, and only holds 4 entries total on this machine (started 2026-09-20); it is used in the evidence note as a secondary cross-check, not the count.

## Risk

The chosen rule is still not a shell parser: it splits on `;`, `&`, `|`, and newline without being quote-aware, so a command that contains one of those characters inside a quoted string (prose or otherwise) can in principle still produce a false segment boundary. No further real-transcript failure of this kind was found after the fix, but none is proven impossible.

## Reversibility

Fully reversible: this is one function (`bashCommandRunsGate` and `GATE_SEG_RE`/`SEGMENT_SPLIT_RE`) in one script, with a test file (`scripts/token-direction.test.mjs`) that pins the three rejected failure modes as fixtures with negative controls, so a future change that reopens any of them fails loudly.

## Evidence

`scripts/token-direction.test.mjs`; the three failure modes were reproduced by hand against `scripts/fixtures/transcripts-direction/` before the fix, and the negative controls in that test were confirmed to fail when the detection is reverted to each rejected approach (checked 2026-09-22, not itself committed as a separate script). `evidence/live/2026-09-22-token-direction.md` documents the same choice for the note's reader.
