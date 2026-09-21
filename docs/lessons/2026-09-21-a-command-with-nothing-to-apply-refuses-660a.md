# A command with nothing to apply refuses, it does not fall back to a status view

Kind: Living. Lesson entry.

- **ID:** 2026-09-21-a-command-with-nothing-to-apply-refuses-660a
- **Status:** accepted
- **Date:** 2026-09-21

## What broke

A test of the new `pin` command expected `skilliton pin --apply`, with no release named, to exit **2** (refused, nothing written). It exited **1**. The command had done something reasonable-looking instead: with no release to move to, it fell through to its preview path and printed the clone's current pin and the releases it knows, exiting 1 because one of those releases did not verify.

Read from the terminal, that output is indistinguishable from a successful status view. The person typed `--apply`, saw a clean listing, and had no way to tell that nothing had been applied.

## The mechanism

`--apply` is this repository's word for **make the change**, and every command that takes it treats the flagless invocation as a preview of the same plan. That symmetry is what makes the pair safe to use. It also creates one state the pair does not cover: `--apply` given where there is **no plan to apply**, because the arguments that would have named one are absent.

The natural implementation falls through to the preview branch, since the preview is the code path that already handles "no target". The flag is then silently dropped, and the exit code comes from whatever the preview found, which in this case was an unrelated attention condition. The failure is not that the command did the wrong thing; it is that a request to change something produced a page about the current state, and the two look the same.

## The fix

`commands/pin.mjs` refuses before doing any work, with the comment saying why:

```
// --apply with nothing to apply to would read as a status view that quietly did nothing.
if (o.apply && o.release === undefined && !o.latest)
  refuse(`--apply needs to know which release to move to: pass --release <x.y.z> or --latest. ...`);
```

`refuse` is the shared exit-2 path, so the message ends in the repository's standard "Nothing was written", and the text names both ways to supply the missing argument and the flagless command that shows what the clone knows.

## The rule

`--apply` with nothing to apply is a refusal (exit 2), never a status view. A command states this in its own argument check, before it reaches any branch that could print something plausible.

The general form: when a flag means "act" and the arguments that say what to act on are missing, the only safe answer is to refuse and name the missing argument. Falling back to the read-only path is worse than an error, because it returns something that looks like success.

## What now enforces it

The `pin` test that expects exit 2 for `--apply` with no release and matches the refusal's text, at `scripts/release.test.mjs:964`. It is per-command, and that is the honest limit of it: nothing sweeps the other commands that take `--apply` for the same hole. Writing such a sweep would mean deciding, generically, what "nothing to apply to" means for each command, which differs; the check that does generalize is the one already in `scripts/lint.test.mjs`, that every command module exports `help` and `run`, and it does not reach argument semantics. Each new `--apply` command therefore needs this case written for it by hand.
