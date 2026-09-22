# A check runner that starts a login shell changes what the tests control

Kind: Living. Lesson entry.

- **ID:** 2026-09-22-a-check-runner-that-starts-a-login-shell-1367
- **Status:** accepted
- **Date:** 2026-09-22

## What broke

The first full run of scripts/checks.mjs failed one step: "Preflight against blocks made on purpose", subtest 14, "a home folder and an askpass program named in the environment cannot steer a git call", after 209 seconds. The same file run directly, `node --test scripts/preflight.test.mjs`, passed 24 of 24 in 30 seconds on the same tree.

## The mechanism

The runner spawned each step with `bash -lc`. The `-l` makes it a login shell, which sources the profile files (`~/.bash_profile`, `~/.profile`) before the command. Those files export variables and alter PATH on this machine; the preflight test plants `HOME` and `GIT_ASKPASS` values on purpose and checks that git under Skilliton cannot be steered by them. With the profile sourced between the test's environment and the command, the planted values were no longer what the test assumed, and one git call waited on something the test expected to be blocked, hence the 209 seconds. CI runs the same steps in a non-login shell, which is why it was green.

## The fix

`spawnSync("bash", ["-c", ...])` in scripts/checks.mjs (commit d35a9a8), with a comment saying why it is not a login shell. The step then passed through the runner in 30 seconds.

## The rule

A runner that executes a repository's checks starts a plain shell and passes the environment it was given. Anything that sources a person's profile between the test and the command is testing that person's dotfiles. When a step passes on its own and fails through a runner, the difference is the runner, and the first thing to compare is the shell and the environment it starts with.

## What now enforces it

The runner's own first run through CI (`node scripts/checks.mjs --list` is a CI step, and the runner is the documented way to run the suite locally in CONTRIBUTING.md), and this entry. No test asserts the shell flag; a test that spawns the runner on a step which prints `$0` and its flags would, and is not written because the runner is not shipped inside a plugin.
