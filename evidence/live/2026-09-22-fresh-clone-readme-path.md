# The README's paths run from a fresh clone, 2026-09-22

Kind: Reference (evidence). Measured on the maintainer's machine at 04:55 EDT, from a clone made for the purpose (`git clone` of this checkout into a temporary folder), not from the working checkout.

## "Try it in two minutes"

`node scripts/autopilot-demo.mjs` in the fresh clone, exactly as README.md prints it: exit 0. The demo ended the way README says it does, with a stale security observation and a push the shared repository's pre-receive hook declined on purpose. Nothing outside the temporary folder was touched.

## "A developer's two commands"

1. `company join-file --name <company> --signers <allowed_signers> --out <folder>/<company>.skilliton-join.json --apply` wrote the join file and printed the hand-out instruction.
2. `node <fresh clone>/scripts/skilliton.mjs join --from <that file>` (the preview, as README prints it first): exit 2, refused, because this machine has already joined this company from the working checkout, with the note naming `join --undo --company <name> --apply` as the step before joining again, and "Nothing was changed". That is the documented behaviour for a machine that has joined (README: "A machine that has joined does not join again, and `join` says so").

## Not measured here

The `--apply` half of joining from a fresh clone on a machine that has not joined, and the client's plugin install that follows it. Both need a machine (or a fresh client configuration with a login, docs/BACKLOG.md B3) that has not joined; the owner's second device is where that runs. This note claims nothing about them.
