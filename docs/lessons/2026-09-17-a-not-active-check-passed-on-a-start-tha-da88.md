# A not-active check passed on a start that never ran a session

Kind: Living. Lesson entry.

- **ID:** 2026-09-17-a-not-active-check-passed-on-a-start-tha-da88
- **Status:** accepted
- **Date:** 2026-09-17

## What broke

An independent security-first review of `scripts/rehearsals/enrollment.mjs` at commit 0c6855a, before anything was published, found that the steps expecting "not active" (E4 starts 1 and 2, E5 start 1) would pass on a Claude Code start that crashed or exited before its session began. The spike's result is a count of session starts before plugins are active, so a crash counted as a start would have produced a wrong count with PASS beside it. The same review found that a SessionStart hook with no plugin tag was never judged, that the base plugins' hooks exit 0 while printing a failure notice, that the no-login step claimed "registers nothing" but checked registration only after `plugin list`, and that Ctrl-C was recorded as a failed step and written as evidence.

## The mechanism

`isInactive` asked only whether plugin skills and plugin hooks were absent. A start that never reached the init event produces the parser's default report (no skills, no hooks), which satisfies every absence test. The start's exit code was saved and never checked, so a start that ended by itself looked the same as one `timeout` stopped while it waited for the model. Separately, every step runs synchronously, so a SIGINT handler registered with `process.on` never ran; only the docker child died, its step failed, and the run carried on to write evidence.

## The fix

The rewritten script requires every judged start to have run a session: an init event naming the pinned version (`claude_code_version`) and exit 124 from `timeout`. `isInactive` and `isActive` both start from that, and `isActive` also fails on any untagged hook that did not succeed and on the failure notices the base hooks print. E3 checks marketplace registration after each no-login start. `scripts/rehearsals/lib.mjs` `run` now returns the signal that ended a child, and the rehearsal's docker wrapper stops the run on SIGINT or SIGTERM, removes containers and the image, writes no evidence and exits 130. The base image is pulled and pinned by digest, the image tag is unique per run, `docker run` never pulls, and the folder marketplace commit is read once and archived exactly. The evidence from the first run, made with the unreviewed judgement and never committed, was deleted and the rehearsal run again.

## The rule

A check that expects something to be absent must first prove that the thing it observes ran. Record the exit status and a positive marker of the run (here the init event and its version) and fail when either is missing.

## What now enforces it

`node scripts/rehearsals/enrollment.mjs --self-test` (in CI) runs the in-container report on synthetic runs, including no init event, a start that ended by itself, another version, a failure notice with exit 0 and an untagged failing hook, and requires each to be neither active nor inactive, or not active. Mutants that ignore whether a session ran, ignore failure notices, or ignore untagged hooks each fail it. The interruption path was tested twice on the running rehearsal: SIGINT sent to the rehearsal and its running `docker exec` together, as a terminal Ctrl-C does (exit 130 at once, no container, image or evidence left), and SIGTERM to the rehearsal alone (stopped at the end of its step, the same cleanup). A SIGINT sent only to `docker exec` made it exit 0 with no output, which is why the run stops on its own signal rather than on the child's exit.
