---
name: security
description: Keep a project's security evidence current and honest - explain what has and has not been assessed, decide which controls apply with a named person, gather real evidence with the built-in collectors or from actual test and scan results, record observations that go stale when their sources change, and turn gaps into backlog items. Use when the user asks about security, before a release or review, when the session start shows missing or stale evidence, or when asked "is this secure" or "are we compliant".
---

# security: evidence, not assurances

This skill records what was actually assessed in this project and keeps that record honest over time. It never declares the project secure or compliant: evidence counts describe what was checked, when, and against which sources, nothing more.

## 1. Show where things stand

Run `skillgate security status`. Explain the result in plain words:

- **current**: a recorded observation whose source files and control definition have not changed since, and that has not expired;
- **missing**: nobody has assessed it yet;
- **stale**: something it depended on changed, or it expired, so it needs a new look;
- **gap**: someone looked and found a problem;
- **needs a person / undecided**: a human has to decide or assess it;
- **invalid**: a record or the catalog is broken; fix that before anything else.

If `skillgate` is not found on the shell path, say so and run the plugin's own copy by its path: `bin/skillgate` in the workflow plugin folder, two folders above this skill's base directory. If the project has no security register, say so and offer `skillgate prepare` (it adds the register). Do not improvise one.

## 2. Decide what applies, with a named person

For each undecided control, ask the user (or the person they name) whether it applies to this project and why. Record their answer, never yours: `skillgate security applicability --control <id> --applies true|false --rationale "<their reason>" --decided-by "<their name or role>" --apply`. A "does not apply" needs a real reason; it leaves the count visibly, not silently.

## 3. Gather real evidence

- Use a collector when one fits: `skillgate security collect tests --source <file the tests cover> --apply` runs the checks named in `.skillgate/delivery.json`; `skillgate security collect secrets --apply` scans tracked files for secret-shaped text; `skillgate security collect delivery-policy --apply` checks that a delivery policy exists. Each stores its raw output under `.skillgate/private-evidence/` (not committed) and records the result, including a gap when the check fails.
- Otherwise record what a person or a tool actually did: `skillgate security record --control <id> --assessment observed|gap|needs-human --source <file assessed> --artifact <real output file> --note "<what was checked and what it showed>" --reviewer "<who>" --apply`. "Observed" requires real source and output files. Never write an observation for something that did not run.
- Keep sensitive outputs (logs with customer data, credentials) out of the repository: redact them or keep them in `.skillgate/private-evidence/`. Never paste a secret value anywhere.

## 4. Keep it current without cheating

- A stale observation is re-assessed and recorded again. Never edit, re-date or delete an old record, and never regenerate a report to make something look fresh.
- On an integration branch, `skillgate security findings --apply` turns every open gap into one backlog row (it never duplicates rows and removes a row once a later observation resolves it).

## 5. Limits to state plainly

- The catalog maps practices to public frameworks as references for review; it is not a whole-framework assessment and not a certification.
- Evidence freshness is not merge enforcement: the shared branch's delivery checks decide what may merge.
- Active security testing against running systems (scanning, penetration testing) needs its own written authorization and scope. Without it, prepare the plan and stop.
