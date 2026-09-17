# The real Codex refused a missing home and wrote into its home on every run, which the stand-in did not model

Kind: Living. Lesson entry.

- **ID:** 2026-09-16-the-real-codex-refused-a-missing-home-an-2784
- **Status:** accepted
- **Date:** 2026-09-16

## What broke

`skillgate join` passed its 19 tests against stand-in clients, then failed twice in the machine rehearsal on the real clients. First, `codex plugin marketplace add` exited 1 with "CODEX_HOME points to ... but that path does not exist", so join stopped part way (exit 3; the receipt recorded what had completed). After join created the folder, the repeat-join and undo-preview steps failed their "writes nothing" checks: new `tmp/arg0/codex-arg0*/` entries appeared in the Codex home.

## The mechanism

Codex 0.154.0-alpha.6.2 does not create `CODEX_HOME` and refuses to run when it names a missing folder; Claude Code 2.1.273 creates a missing `CLAUDE_CONFIG_DIR`. Separately, every Codex invocation, including `codex --version`, stages executable aliases under `$CODEX_HOME/tmp/arg0/` when the home exists. join's first version ran `<client> --version` to check each binary during planning, so even a preview changed the Codex home. The earlier probes had created every home folder before running Codex, and the stand-in created its home itself, so neither behavior was ever observed before the rehearsal.

## The fix

`packs/base/plugins/workflow/runtime/lib/join.mjs`: each client driver states whether the client creates its own home (`createsHome`); join creates a missing Codex home during apply, shows it in the preview, and records `createdHome` in the receipt. `findBinary` checks that the binary is an executable file and no longer runs it, so a client runs only to make a change. `scripts/fixtures/clients/standin.mjs` now exits 1 for a missing `CODEX_HOME`, as measured, and `scripts/join.test.mjs` asserts that a preview runs no client at all.

## The rule

A stand-in encodes only what was measured. When a probe prepares state by hand (creating a home folder, pre-adding a marketplace), write down that the unprepared case is unmeasured, and run the real client from a truly empty state before trusting the stand-in. A read-only check must not execute a program whose side effects are unknown.

## What now enforces it

`scripts/rehearsals/machine.mjs` starts Codex from a home that does not exist and compares hashed snapshots of every client folder around the preview, the repeat and the refusals. `scripts/join.test.mjs` runs in CI with the stand-in's measured refusal and the no-client-run assertion. docs/CLIENTS.md records both Codex behaviors.
