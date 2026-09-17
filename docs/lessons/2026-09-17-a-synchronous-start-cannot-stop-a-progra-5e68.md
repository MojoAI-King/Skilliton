# A synchronous start cannot stop a program that ignores being stopped

Kind: Living. Lesson entry.

- **ID:** 2026-09-17-a-synchronous-start-cannot-stop-a-progra-5e68
- **Status:** accepted
- **Date:** 2026-09-17

## What broke

`skilliton preflight` starts every program in the allow list once. Written with `spawnSync` and a timeout, and with
`detached: true` so that a hanging program could be killed with its children, it did the opposite of both intentions: a
review measured the check still running after 120 seconds with a 3 second timeout, and after Ctrl-C the probe and its
two children were still running, re-parented to init.

## The mechanism

`spawnSync`'s `timeout` sends SIGTERM and then goes on waiting for the child to exit. A program that ignores SIGTERM,
or a grandchild still holding the output pipe open, means the call never returns, so the `process.kill(-pid,
"SIGKILL")` written on the next line can never run: the code that was meant to stop it is unreachable by construction.
`detached: true` made the interrupt case worse, because it puts the child in its own process group with no controlling
terminal, so Ctrl-C no longer reaches it through the terminal as it did before.

## The fix

`startOnce` in `packs/base/plugins/workflow/runtime/lib/preflight.mjs` is asynchronous: `spawn`, a `setTimeout` that
kills the process group while the child is still running, and a cleanup that also kills live children when the command
is interrupted, removes the files and folders the check made, and then re-raises the signal so the exit status still
names it. `checkPrograms`, `runPreflight` and the `preflight` and `join` commands became async with it.
`runtime/lib/collectors.mjs` already had this shape for a project's test commands; the preflight check should have
copied it rather than reaching for the synchronous call.

## The rule

A timeout is only a timeout when something can still act after it fires. Never rely on a synchronous start's timeout to
end a program that may ignore it: start it asynchronously, in its own process group, and kill the group from a timer.
Anything that adds `detached` also has to say who kills the group on an interrupt, because the terminal no longer will.

## What now enforces it

`scripts/preflight.test.mjs`, "a program that never answers is stopped with its children, and the check finishes": a
stand-in that traps SIGTERM with a child holding the output open, asserting the run finishes well inside the timeout,
that the program is reported as not checked, and that `pgrep` finds nothing left. `scripts/footprint.test.mjs` keeps
the list of places that start a child in its own group, so a new one has to say who stops it.
