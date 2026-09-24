# A merge check that leaves out the demo and the rehearsals lets a moved output file turn CI red on main

Kind: Living. Lesson entry.

- **ID:** 2026-09-24-a-merge-check-that-leaves-out-the-demo-a-76b8
- **Status:** accepted
- **Date:** 2026-09-24

## What broke

After the security-records lane merged (e4717f8), CI went red on main for three pushes: the end-to-end demo asserted the security finding in docs/BACKLOG.md, and the lane had moved findings to docs/SECURITY_FINDINGS.md. The project rehearsal had the same assertion and would have failed next. The lane's own suites and the fast checks were all green before the merge.

## The mechanism

The merge script ran the fast checks and the lane's own suites, and the lane's suites were chosen by what its items touched. The demo (scripts/autopilot-demo.mjs) and the offline rehearsal (scripts/rehearsals/projects.mjs) read the files the product writes as a user would, so a change to where a file is written breaks them without touching any file they import. CI runs them; the merge check did not. A related slip the same day: the checks for the pin lane first ran while its rebase had stopped on a conflict, so they read a half-rebased tree and said nothing about the merge.

## The fix

90da07f points both at the findings file; the batch's merge script (scratchpad merge-0924.sh, and the suites files it reads) now runs the demo and the project rehearsal for every lane, and a merge proceeds only after `rebase exit: 0` is read.

## The rule

A merge check runs every test that reads the product's output as a user would (the demo, the rehearsals), not only the tests of the files a lane touched; and no check is read until the rebase exited 0.

## What now enforces it

Nothing in the repository: the merge script is the integrating session's own. `skilliton gate` with the delivery policy's full list, run on the rebased lane tree before `merge --ff-only`, would; that is the full check run the release takes.
