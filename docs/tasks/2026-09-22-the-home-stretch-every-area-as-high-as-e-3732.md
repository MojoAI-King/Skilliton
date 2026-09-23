# Task: The home stretch: every area as high as evidence allows before the cold read

Kind: Living. Task record.

- **ID:** 2026-09-22-the-home-stretch-every-area-as-high-as-e-3732
- **State:** in-progress
- **Branch:** main
- **Owner:** unassigned
- **Updated:** 2026-09-23T13:25:15.664Z

## Request

Get the areas up: token efficiency, auto-harness, the autopilot loop into the 90s, security top tier, proof it helps people. README super clean and easy to install by hand or by an AI agent reading the repo. Set goals and loop through everything tonight, use dispatch to delegate. Keep this repo healthy, archive old documents. We have about 17 hours.

## Acceptance criteria

- [ ] Every item in LANES.md is shipped, merged, or listed for the owner with the exact step
- [ ] README front door rewritten and a cold agent install from GitHub in a clean home completes with every stuck point fixed or filed
- [ ] Each area's evidence filed as measured or labeled unverified; no savings figure without the meter and the Usage screen
- [ ] Superseded documents archived, index and records reconciled, scrub and full checks green, CI green on main
- [ ] A fresh reviewer-agent dry run done and its findings fixed or filed; the owner's list for the night is one file

## Decisions

not yet written

## Checkpoints

### 2026-09-23T01:17:07.306Z

- **State:** Merged and pushed: meter (B63, token direction), hooks (clean tree not held, B64), gate-security (replace refs, gate self-integrity, SSH-only signatures, join redaction); workflow 0.22.0 on main, not released. Filed: VS Code extension hooks (03-01 item 1), Windows first run on a hosted runner (03-02 item 1; prepare refuses there, not supported), a real Codex session (01-05 item 1), use counted on this machine, INSTALL.md, README front door, ARCHITECTURE.md, SECURITY_PROPOSAL.md, COMPARISON_PROTOCOL.md. Report card 102 of 123. Running: guard-security, install-fixes, quality lanes, the Windows port on branch windows/port-0922, the hiring-panel dry run.
- **Evidence:** checks.mjs on the merged tree 60 pass, 1 expected audit fail fixed in 2666303; CI run 35804599365 70 steps 0 not success; history scrub with the denylist 0 name hits; cold install rehearsal from GitHub passed the install, 13 findings, text fixed, product fixes in lane install-fixes
- **Next:** Merge guard-security, install-fixes, quality; fix the panel's findings; the owner's list in docs/OWNER_TESTS.md; 1.0.1 prepared up to signing
- **Git:** main @ c020cea, 0 uncommitted

### 2026-09-23T02:14:10.879Z

- **State:** All six lanes merged and closed (meter, hooks, gate-security, guard-security, install-fixes, quality); guardrails 0.8.0, context-hygiene 0.3.1, workflow 0.22.0 on main, unreleased. The owner confirmed every decision at 21:33 EDT: security applicability recorded (05-03 item 1), B53 closed, the comparison ran (10-02 item 1; uncommitted work kept 3 of 3 with, lost 3 of 3 without; no difference on A, B, E; about 20k to 30k more input tokens with), 1.0.1 to be signed. README rebuilt from the panel dry run, docs/MAKE_IT_YOURS.md, the GNU awk RT bug fixed and proved in a container. Report card 104 of 123. Waiting on the Windows port (branch windows/port-0922).
- **Evidence:** checks.mjs 67 pass 0 fail on the merged lanes; CI 75 steps 0 not success on the awk fix; guardrails 676 and bypass 123 on macOS and on GNU awk 5.2.1 in node:22-bookworm; the unfixed hook fails 17 bypass checks there
- **Next:** Merge the Windows port; release 1.0.1 (create, commit, rerun checks, sign, push, fresh clone, update installs, verify); collect the security evidence; regrade proposal; handoff
- **Git:** main @ 8018916, 0 uncommitted

### 2026-09-23T07:05:26.493Z

- **State:** Merged on main tonight: the Windows port (every session hook and the guard pass on a hosted runner; B79 and B80 filed), the maintenance trigger (15 commits or the handoff 15 behind), the field report filed with a verdict per item, the security-loop and records-host lanes; 03-02 items 2 to 4 ticked (107 of 123). Five night lanes running (instruction-size, windows-names, security-proposal, code-clarity, gate-and-tasks); a pre-release review and a docs cold read running as workflows; 1.0.1 not yet released
- **Evidence:** CI 79 of 79 on 21d041d; checks.mjs 71 pass 0 fail on the records lane, 68 pass 0 fail on the port and the security lane; Windows run 35815835006: preflight 40 ok, guard 674 of 676, lifecycle 59 of 59; skill-load probe: no Skilliton skill in the without arm, each once in the with arm
- **Next:** Merge the five lanes in order (windows-names, security-proposal, gate-and-tasks, code-clarity, instruction-size), fix confirmed review findings, run the comparison's second run (D and F), then release 1.0.1 and write the handoff
- **Git:** main @ 25c2dae, 0 uncommitted

### 2026-09-23T07:58:29.978Z

- **State:** Pre-release review: 16 findings confirmed, all fixed on main in a7bc8f6 (subshell arithmetic bypass, letter case on the settings and instruction files, hooksPath through the environment and git config, content-bound secrets allowlist, .gitattributes * -text, handoff hook opt-out, record header shape, archive header order); names check mirrors the website's product copies (bf4d3e1). Three lanes stacked (windows-names, gate-and-tasks, security-proposal) under full checks; code-clarity and instruction-size still running; three docs agents fixing the cold-read findings on their own branches; 1.0.1 not released
- **Evidence:** checks.mjs 71 pass 0 fail on the review fixes; bypass 142 of 142 (13 of the new cases fail against the old hooks); guardrails 676 and bypass 142 under GNU awk 5.2.1; handoff hook 129; record header 10; CI 79 of 79 on 21d041d
- **Next:** Fast-forward main through the stacked lanes when their checks pass, then merge code-clarity and instruction-size, run the comparison's second run, merge the docs branches, release 1.0.1
- **Git:** main @ a7bc8f6, 0 uncommitted

### 2026-09-23T08:40:42.571Z

- **State:** The three stacked lanes (N63 Windows bare names, N64 maintain refreshes security records, N65 proposed applicability, N68 gate machine context, N69 task growth note) are on main at aba8b6f with tar resolved like git; eleven merged lane tasks closed; B70 archived, B71 B74 B77 half built, B79 built awaiting its Windows run, B81 to B83 filed. Not done: code-clarity and instruction-size merges, docs branches, the second comparison, 1.0.1, security evidence, website words
- **Evidence:** stack checks.mjs 72 pass 1 fail 2 skipped (preflight load timeout; alone 24 of 24 in 31 s); delivery 15 of 15, allowlist, lint, docs, backlog, names and scrub exit 0; whole-history audit on committed HEAD 0 findings in 690 files; CI 35838448878 and the Windows workflow started on aba8b6f
- **Next:** Read CI and the Windows decoy step; merge code-clarity when it commits N67, then N67b in join.mjs; merge instruction-size and apply its migration
- **Git:** main @ aba8b6f, 0 uncommitted

### 2026-09-23T13:25:15.664Z

- **State:** Main (d8868ef, pushed) holds every lane but one: the Windows bare-name fix (B79, now proven on Windows by the decoy step), the gate's machine context, the task growth note, maintain refreshing security records and settling in one run (B81), proposed applicability (B70), code-clarity's line and function rules with the six longest functions split, the doctor fix, the docs cold-read fixes, and README's corrected lean-session claim. The instruction-size lane (the harness block from 8.3 KB to 4.5 KB, compact Project state) is finishing; 1.0.1 is not signed yet; the second comparison waits on the shrink. Report card 107 of 123; every open item needs the owner
- **Evidence:** checks.mjs on each merged tree: stack 72 pass 1 load-timeout fail (alone 24 of 24), code-clarity 73 pass 2 fail on a stale generated table fixed on main; CI green on aba8b6f; Windows run 35838465792: decoy PASS, guard 674 of 676 (B80), handoff hook 129 of 129, behaviors PASS; whole-history audit 0 findings in 696 files; new tests fail without their fixes (doctor-tools, maintain-security-collectors)
- **Next:** Merge instruction-size and apply its migration here; sign 1.0.1 and verify from a fresh clone; run the second comparison (tasks D and F, 3 each per arm); then the owner: the Usage screen reading, the maintain minutes, docs/OWNER_TESTS.md, the website words in ~/Desktop/SITE_WORDS_FOR_THE_WEBSITE_SESSION.md
- **Git:** main @ d8868ef, 0 uncommitted

## Handoff

- **State:** Main (d8868ef, pushed) holds every lane but one: the Windows bare-name fix (B79, now proven on Windows by the decoy step), the gate's machine context, the task growth note, maintain refreshing security records and settling in one run (B81), proposed applicability (B70), code-clarity's line and function rules with the six longest functions split, the doctor fix, the docs cold-read fixes, and README's corrected lean-session claim. The instruction-size lane (the harness block from 8.3 KB to 4.5 KB, compact Project state) is finishing; 1.0.1 is not signed yet; the second comparison waits on the shrink. Report card 107 of 123; every open item needs the owner. Evidence: checks.mjs on each merged tree: stack 72 pass 1 load-timeout fail (alone 24 of 24), code-clarity 73 pass 2 fail on a stale generated table fixed on main; CI green on aba8b6f; Windows run 35838465792: decoy PASS, guard 674 of 676 (B80), handoff hook 129 of 129, behaviors PASS; whole-history audit 0 findings in 696 files; new tests fail without their fixes (doctor-tools, maintain-security-collectors).
- **Next:** Merge instruction-size and apply its migration here; sign 1.0.1 and verify from a fresh clone; run the second comparison (tasks D and F, 3 each per arm); then the owner: the Usage screen reading, the maintain minutes, docs/OWNER_TESTS.md, the website words in ~/Desktop/SITE_WORDS_FOR_THE_WEBSITE_SESSION.md
- **Blocked:** Only the owner can do these: read the Usage screen for the token window (turns the meter's reconstruction into a number that may be stated), report the end-of-day maintain minutes before and after, the extension keyboard checks and the other rows of docs/OWNER_TESTS.md, a clean macOS account, a Codex login, a Windows machine with a Claude login, an endpoint security product to test under, and a participant for the new builder rehearsal
- **Watch out:** Plugins on this machine are older than main (workflow 0.19.0 installed); restart the client after 1.0.1 installs. Read the clock before typing a time. Windows stays not supported (B80, no Claude Code session there)
