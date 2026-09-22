# A guard judges paths against the root the client names, spelled as the input spelled it

Kind: Living. Lesson entry.

- **ID:** 2026-09-22-a-guard-judges-paths-against-the-root-th-a324
- **Status:** accepted
- **Date:** 2026-09-22

## What broke

The first run of the B61 removal rule in `scripts/guardrails.test.sh` failed eight cases at once: every case run from a subfolder (`cd .. && rm -rf docs`, `rm -rf ..`, `rm -rf .` from `sub/`) got the opposite decision, and under the Codex-shaped input every record case allowed while the `.skilliton` cases denied with an absolute path in the reason where the Claude-shaped input had a relative one.

## The mechanism

Two roots, neither the real one. The test's `hook()` helper sets `CLAUDE_PROJECT_DIR` to the case's cwd for every case, so a subfolder case told the hook the subfolder was the project root, and a path resolved to `<root>/docs` was outside it. Under the Codex shape there is no such variable; the hook fell back to the cwd (the same wrong root), and the first fix, `git rev-parse --show-toplevel`, returned the physical path (`/private/var/...`) while the test's folder was spelled `/var/...`, so a string comparison never matched: the sibling of B56, where letter case did the same to a real project.

## The fix

`packs/base/plugins/guardrails/hooks/guard-bash.sh` `set_project_dir`: without `CLAUDE_PROJECT_DIR`, the root is the input cwd with git's `--show-prefix` stripped off, which keeps the caller's spelling; `protected_target` compares the physical forms of both paths (`cd <dir> && pwd -P`) when both exist, and the spelled forms otherwise. The subfolder cases pass `CLAUDE_PROJECT_DIR="$RCFG"` explicitly (what Claude Code sends), and one case runs with the variable empty to prove the git fallback (commit 17189d2).

## The rule

A fixture sets a client-provided variable to what the client provides, the root, never the cwd; a case that runs from a subfolder names the root. A hook that may run without the variable derives the root in the caller's spelling, and any comparison of a path from one source with a path from another goes through the physical form on both sides or on neither.

## What now enforces it

`scripts/guardrails.test.sh`: the section "deny: removing what Skilliton keeps in a prepared project" has three subfolder cases with the root passed, one with the variable unset, and the Codex-shaped run of every case, which has no variable at all; the temporary folder those cases use is spelled through `/var`, so the physical-path comparison is exercised on every run.
