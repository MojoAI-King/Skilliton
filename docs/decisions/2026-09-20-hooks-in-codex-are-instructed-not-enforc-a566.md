# Hooks in Codex are instructed, not enforced

Kind: Living. Decision entry.

- **ID:** 2026-09-20-hooks-in-codex-are-instructed-not-enforc-a566
- **Status:** accepted
- **Date:** 2026-09-20

## Decision

Skilliton ships no Codex hook adapter. Every behavior the harness marks **enforced** is **instructed**
under Codex, and the harness block says so in those words. A team that wants a hook enforced under Codex configures it
in a Codex configuration layer itself, trusts it once per hook, and verifies it on its own machines; this repository
neither writes that configuration nor claims it works.

The one Codex-shaped thing that does ship stays: the guardrails hook, when a team has configured it, reads its input
for a Codex session and turns every **ask** into a **deny**, because Codex has no ask from a hook. That is a shape
change inside a hook a team already chose to run, not a delivery route.

## Why

The route does not exist in the measured version. `codex features list` reports `plugin_hooks` as
**removed** on 0.154.0-alpha.6.2, so a plugin's `hooks/hooks.json` never reaches a Codex session. Everything Skilliton
enforces on Claude Code reaches it that way: the session-start project state, the stop checkpoint reminder, the
pre-compact snapshot, the session-end write, the prompt dispatch suggestion, the guardrails command check and the
context-hygiene read guard. None of them can arrive in Codex from a plugin, and no amount of code in this repository
changes that.

What is left is a configuration layer a team owns. Writing into a person's or a team's Codex configuration is a
different act from shipping a plugin: it needs their consent, their trust decision per hook, and their own
verification. An adapter that wrote it for them would be making that decision on their behalf.

And it could not be measured here. Codex lifecycle hooks are unverified (DECISIONS.md O9) because no session has been
run from a logged-in, isolated Codex home. Shipping an adapter whose behavior nobody has watched would put a line in
the harness saying "enforced" with nothing behind it, which is the exact failure the harness's enforced/instructed
split exists to prevent.

## Alternatives rejected

**Write a Codex hook adapter now.** Rejected: it would have to write into a
configuration layer this repository does not own, and its central claim (that the hooks fire) could not be tested
until a real Codex session ran. An untested adapter that makes the harness say "enforced" is worse than no adapter,
because a reader would stop checking.

**Say nothing and let the harness's enforced lines stand.** Rejected: a reader in Codex would believe a guardrail was
running that is not. The harness block already carries the sentence that Codex does not run hooks shipped inside
plugins; this decision is what that sentence rests on.

**Wait for a Codex session before deciding.** Rejected as a way to decide, kept as a way to learn: the session is
worth running and is in the owner-pass list, but the removal of `plugin_hooks` is already measured, and the decision
not to ship an adapter does not depend on what a session would show.

## Risk

Codex moves. `plugin_hooks` was removed rather than never present, so it may return under another name
or another shape, and this decision would then be describing a version nobody runs. The version is pinned in the
matrix for exactly that reason: `docs/CLIENTS.md` names 0.154.0-alpha.6.2 in its column header, so a reader can see
what was measured and when.

The smaller risk is that "instructed" is read as "nearly enforced". It is not: an instruction is followed when the
assistant follows it, and nothing checks that it did.

## Reversibility

Easily reversed, and cheap to reverse. Nothing was built, so nothing has to be removed. If a
later Codex version delivers hooks from a plugin, the work is to run the probe again (`bash
scripts/codex-offline-probe.sh`, no model call), record the new row in `docs/CLIENTS.md`, and add the adapter; the
harness template's enforced/instructed wording is one paragraph and changes with it.

## Evidence

- `docs/CLIENTS.md`, row "Hooks shipped inside a plugin": **measured**, `codex features list`
  reports `plugin_hooks` as "removed" on 0.154.0-alpha.6.2.
- `docs/CLIENTS.md`, row "UserPromptSubmit hook output reaches the model": **not a delivery route** under Codex, for
  the same reason.
- `docs/CONTRACTS.md` section 15 (Codex adapter): the manifests and skills that do reach Codex, measured on the same
  version, and the guardrails ask-to-deny shape.
- `evidence/rehearsals/2026-09-16-live-clients/`: the live lifecycle sessions, with the Codex diagnosis.
- Not evidence, and named so it is not mistaken for some: no Codex session has been run from a logged-in, isolated
  Codex home, so Codex lifecycle hooks remain unverified (O9). This decision does not need that run; the claim it
  rests on is the removal, which is measured.

**What this decision does not let anyone tick.** Report card area 03 batch 03 item 2 asks for a fixture test of the
Codex hook configuration. Under this decision there is no configuration written, so there is nothing for a fixture to
cover, and the item is recorded as not applicable rather than left looking unfinished.
