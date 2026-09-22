# Lessons

Kind: Living. This repository's own lessons, specific and technical, in the format `/workflow:maintain` writes (what broke, the mechanism, the fix, the rule, what now enforces it).

## 2026-09-16 A test certified a copy of the hook instead of the hook that ships

1. **What broke:** on the real lessons file, the shipped session-start hook injected 1 byte, silently, while its fixture test passed.
2. **The mechanism:** the hook matched the heading exactly (`$0 == h`) and the real heading carries a suffix; the test ran `scripts/fixtures/hook/repaired.awk`, a copy of the logic, against a sample whose heading had no suffix.
3. **The fix:** prefix match and a visible notice when nothing is found, in `packs/base/plugins/context-hygiene/hooks/session-start-checklist.sh`.
4. **The rule:** a test drives the file that ships, with the input shape that production actually has.
5. **What now enforces it:** `scripts/hook-fixture.test.sh` runs the shipped hook against a suffixed heading; run with `--hook` against the old hook, it fails.

## 2026-09-16 Hook scripts that could never run passed every test

1. **What broke:** the session-start hook and the status line were committed without the executable bit since the first commit, including the published one.
2. **The mechanism:** `hooks.json` and `setup.mjs` run both scripts by path, which needs mode 755; every test ran them as `bash <script>`, which does not.
3. **The fix:** executable bits set in git (`git update-index --chmod=+x`).
4. **The rule:** invoke a script in tests the way production invokes it.
5. **What now enforces it:** `scripts/packs.test.mjs` fails on any non-executable hook script; `hook-fixture.test.sh` and `statusline.test.sh` run the scripts by path.

## 2026-09-16 A piped gate let a failing commit through

1. **What broke:** a commit went in while `scrub-check.sh` printed FAIL (a literal em dash in a new test file).
2. **The mechanism:** the command was `bash scripts/scrub-check.sh | tail -1 && git add ... && git commit`. A pipeline's exit status is its last command's, so `tail` succeeded and the chain continued.
3. **The fix:** the file was corrected and the unpushed commit amended, so the dash never reached history; `scrub-check.sh --history` passes.
4. **The rule:** run a gate as its own step, read its exit status on its own line, then commit as a separate step. Never pipe a gate into `head`, `tail`, or `grep` when its result decides anything.
5. **What now enforces it:** nothing automatic in this repository yet. CI runs every gate as a separate step, which catches the result after a push, not before a local commit.

## 2026-09-16 A file writer turned an escape sequence into the character it names

1. **What broke:** a test meant to hold a JavaScript escape sequence for the em dash character (backslash, the letter u, then 2014) was written with the literal character instead, which this repository forbids. Writing this lesson reproduced the same failure once more, and the scrub check caught it.
2. **The mechanism:** the escape was interpreted when the file was written, before JavaScript ever saw it.
3. **The fix:** `String.fromCharCode(0x2014)` in `scripts/evidence.test.mjs`.
4. **The rule:** build forbidden characters and secret-shaped strings at runtime (character codes, string concatenation), never as literals or escapes in source.
5. **What now enforces it:** `scripts/scrub-check.sh` (tree and `--history`), locally and in CI.

## 2026-09-16 Eval failures were grader mistakes three times out of four

1. **What broke:** the first eval runs scored the review skill as failing where its transcripts showed correct behavior.
2. **The mechanism:** a pattern searched only the line after `Next:`; a rubric treated "that pass means nothing" as a claimed pass; a pattern matched the word "pass" in a prediction; the default judge failed an explicitly allowed prediction. One real defect was found the same way: the review rule demanded NEEDS ATTENTION for a comment-only change, which a reviewer rightly calls ready.
3. **The fix:** graders rewritten to match meaning; the review verdict rule and a fixed verdict line in `packs/base/plugins/workflow/skills/review/SKILL.md`; runs kept with `--keep-temp` so transcripts can be read.
4. **The rule:** read the transcript of every failed eval check before changing a skill or a grader; a score is a hint, the transcript is the evidence.
5. **What now enforces it:** nothing automatic; `evidence/<commit>/SUMMARY.md` notes record the diagnosis of each failure.

## 2026-09-16 Agent worktrees started from the last pushed commit, not local main

1. **What broke:** parallel lanes began without files committed locally minutes earlier (the shared contract), and one lane worked from an out-of-date base.
2. **The mechanism:** the worktree for each isolated agent was created from the remote's commit, not from local `main`.
3. **The fix:** lanes fast-forwarded to local `main` before committing; one was sent the contract values directly.
4. **The rule:** push (or otherwise publish) the commit a parallel lane must build on before dispatching it, and name that commit in the brief.
5. **What now enforces it:** nothing yet; the dispatch skill's lane brief checks the branch name, not the base commit.

## 2026-09-16 "Enforced" in the harness block was only true with the plugins installed

1. **What broke:** the first harness template told the model that the handoff display and the git blocks were **enforced**, and this repository applied it before the plugins that enforce them were installed on the machine.
2. **The mechanism:** a hook enforces a behavior only while its plugin is installed and enabled; the block is written into `CLAUDE.md` independently of installation, so the label could state a guarantee that did not exist.
3. **The fix:** `templates/harness.md` now says enforced behaviors hold only while `workflow` and `guardrails` are installed and enabled, and names `skillgate doctor` as the check (commit 1bdf74e).
4. **The rule:** a claim that something is enforced names the condition it depends on, wherever the claim can outlive that condition.
5. **What now enforces it:** `node scripts/skillgate.mjs doctor` reports whether the base plugins are installed and enabled and whether the block is current; nothing checks the wording itself.

## 2026-09-16 A live probe whose success is "nothing changed" nearly passed without running

1. **What broke:** the first run of the committed `scripts/live-guardrails-probe.sh` never started a Claude Code session, and the protected branch did not move.
2. **The mechanism:** `--allowedTools` takes a list (`<tools...>`), so it consumed the prompt placed after it; the CLI exited with "Input must be provided". An unchanged remote is exactly what a successful block looks like.
3. **The fix:** the prompt goes right after `-p`, before any list-taking flag, and stdin is `/dev/null`; the probe checks the session's exit status before judging the result and ships a `--control` run that must move the branch without the plugin.
4. **The rule:** a check that passes on absence of change first proves the actor ran, and carries a control that shows the change happening without the protection.
5. **What now enforces it:** the probe itself (exit 2, NOT RUN, when the session fails); `--control` must report the branch moved.

## 2026-09-16 Another agent session was working the same repository

1. **What broke:** a pre-push secret scan over `git rev-list --all` matched strings in a file nobody in this session had written.
2. **The mechanism:** a Codex session had created worktrees (`~/Desktop/Skilliton-security-0916`, `~/Desktop/Skilliton-autopilot-0916`) and branches in this repository; `--all` includes every local branch, pushed or not.
3. **The fix:** only `main` was pushed; the other branches were left untouched and recorded as owner decision O11, with a trial merge showing no conflicts.
4. **The rule:** before pushing or scanning history, run `git worktree list` and `git for-each-ref refs/heads`, and scope pushes and scans to your own refs.
5. **What now enforces it:** `scrub-check.sh --history` scans only what the checked-out branch reaches, and `--history-all` (which CI runs) every ref; the self-test proves both scopes (DECISIONS.md O13, closed).

## 2026-09-16 A local-folder plugin install shipped files that were never committed

1. **What broke:** a Codex install of the workflow plugin from this checkout held five raw eval result files that no release would contain; a Claude Code install from a folder copied an untracked note the same way.
2. **The mechanism:** a marketplace added from a local folder is read as a directory, and both clients copy the whole plugin folder, including git-ignored and untracked files. `claude plugin eval` writes its raw results inside the plugin folder by default.
3. **The fix:** the raw results moved out of the repository; eval runs now pass `--output-dir` outside the plugin folder; `skillgate verify` lists added files as TAMPERED.
4. **The rule:** distribute plugins from committed content (a Git source or a clean clone), and keep generated files out of plugin folders.
5. **What now enforces it:** `scripts/codex-offline-probe.sh` check X3 (installed files must equal the committed plugin files; it failed on the real extra files); `scripts/release.test.mjs` (added files are TAMPERED).

## 2026-09-16 A research agent quoted this repository's own instructions as platform documentation

1. **What broke:** a documentation research report cited a sentence about session-start hooks as coming from the platform's headless documentation; the sentence was this repository's own harness block.
2. **The mechanism:** the agent's context held the repository instructions, and it attributed a remembered sentence to the page it was summarising.
3. **The fix:** the capability was measured instead, in a real session (`scripts/live-capability-probe.sh`, check C1).
4. **The rule:** a platform capability the design depends on is either run or quoted from a fetched page whose text is checked; a report's citation alone is a lead.
5. **What now enforces it:** `scripts/live-capability-probe.sh` and docs/CLIENTS.md, which labels every row measured, documented or unverified.

## 2026-09-16 A string replacement in a patch script inserted half a file

1. **What broke:** a test file patched by a small Node script failed to parse; a copy of the file's beginning had appeared in the middle of a line.
2. **The mechanism:** `String.prototype.replace(from, to)` interprets `$` patterns in the replacement string; the replacement contained a dollar sign followed by a backtick, which means "the text before the match".
3. **The fix:** the file was restored from Git and the patch reapplied with a function replacer (`s.replace(from, () => to)`), which inserts text literally.
4. **The rule:** when a script edits code, use a function replacer or `split(from).join(to)`, never a replacement string, and check the syntax before running anything.
5. **What now enforces it:** nothing automatic; the syntax check (`node --check`) caught this one before a test ran.

## 2026-09-16 Each lane was green on its own base and red on the combined tree

1. **What broke:** after merging, 4 prepare tests, 2 release tests and 2 lifecycle tests failed, although each lane had passed every test before merging.
2. **The mechanism:** each lane's tests hard-coded facts true only on its base: the raw template text (before the template gained `{{...}}` values), an empty migrations list, a guardrails version, and "not available in this build" for modules another lane added.
3. **The fix:** the tests derive those expectations from the build (render the template with the contract defaults; read the migrations registry; bump from the current version; check whether a module exists).
4. **The rule:** a lane's test states what the contract promises, not what its base happens to lack; the integrating session runs the full suite after every merge, not only the lane's own tests.
5. **What now enforces it:** the merge protocol in the dispatch skill and docs/MAINTAIN.md step 2; CI runs every suite on the combined tree.

## 2026-09-16 An improvement's behavior test passed before the improvement

1. **What broke:** the company release rehearsal's eval for "review stops on a removed delivery check" passed on the review skill before the change as well as after, so the rehearsal could not show the change mattered.
2. **The mechanism:** the existing STOP rule for tests that are switched off already covered a removed test check.
3. **The fix:** the fixture became a company rule the model cannot infer (billing changes need the payments lead); the rehearsal asserts the eval fails before and passes after (evidence/rehearsals/2026-09-16-company-release).
4. **The rule:** show a behavior test failing on the old version before crediting a change with fixing it.
5. **What now enforces it:** `scripts/rehearsals/company-release.mjs` step I1 (fails unless before is false and after is true).

## 2026-09-16 An eval run without its tool grants measured nothing

1. **What broke:** a regression run of the workflow evals failed the handoff case with "docs/HANDOFF.md does not exist", although the skill fired.
2. **The mechanism:** the case allows only read-only tools; writing needs the operator grant `--allow-tools Bash Write Edit`, which the recorded run had used but its summary did not record.
3. **The fix:** the run was stopped and repeated with the grant; the command is now written next to the evidence.
4. **The rule:** record the exact eval command with its results, and compare runs only when the commands match.
5. **What now enforces it:** docs/MAINTAIN.md step 4 names the full command; nothing checks it automatically yet.

## 2026-09-16 The first live Codex rehearsal wrote trust entries into the owner's Codex configuration

1. **What broke:** while checking what was installed on this machine, `~/.codex/config.toml` held `[projects."<temporary folder>"] trust_level = "trusted"` entries for the rehearsal's two deleted folders, `codex-guard` and `codex-control`.
2. **The mechanism:** the first live Codex run of `scripts/rehearsals/live-clients.mjs` used the default Codex home, because that is where the login was, and ran `codex exec` in those folders with and without a `-c projects.<path>.trust_level` override. Something in those runs persisted a trusted-project table for each folder; which step wrote it was not isolated.
3. **The fix:** the two entries (six lines) were removed on 2026-09-16 and nothing else in the file changed; the script had already been changed to run Codex only from an isolated home given with `--codex-home`.
4. **The rule:** a scripted client run uses its own configuration home and asks the owner for a login there; a side effect in the owner's real configuration is reported and removed.
5. **What now enforces it:** `live-clients.mjs` marks the Codex steps NOT RUN without `--codex-home`; nothing compares the owner's configuration before and after a run yet.

## 2026-09-16 A client path that did not run was silently replaced by another client

1. **What broke:** `node scripts/rehearsals/live-clients.mjs --claude /nonexistent/claude`, meant as a quick check that nothing runs without a client, started Claude Code steps anyway; they failed with exit 1.
2. **The mechanism:** `findClient` in `scripts/rehearsals/lib.mjs` tried the `--claude` value, then `SKILLGATE_CLAUDE`, then `claude` on PATH, and took the first that answered `--version`. The terminal's `claude` is 2.1.92, which lacks flags the rehearsal passes, so it failed before starting a session (no transcript or configuration entry appeared). With a newer `claude` on PATH, the rehearsal would have run paid sessions and recorded evidence for a client nobody chose.
3. **The fix:** `findClient` uses the first value given and never falls back from it; both rehearsals stop with NOT RUN (exit 2) when that client does not run. Steps whose prerequisite is missing return `{ notRun }` and are recorded as NOT RUN rather than FAIL.
4. **The rule:** a tool that is told which binary to use either uses it or stops; it never substitutes another one.
5. **What now enforces it:** nothing automated; `node scripts/rehearsals/live-clients.mjs --claude /nonexistent/claude` exits 2 before any session (checked 2026-09-16).

## 2026-09-16 index would have told readers of a 30-entry DECISIONS.md that there were no decisions yet

1. **What broke:** before committing, `skillgate index` on this repository previewed appending a section reading "No decision entries yet." to DECISIONS.md, and the same for docs/LESSONS.md, both of which hold many entries written before Skillgate.
2. **The mechanism:** `regenerateIndexes` in `runtime/lib/records.mjs` appended a section to any record without markers, including when `docs/decisions/` held no entry files; an adopted monolith is exactly such a record. Tests covered appending only with entries present.
3. **The fix:** a record without markers and with nothing to list is left unchanged and the output says the section arrives with the first entry (`deferred` in the plan; `commands/index.mjs`).
4. **The rule:** a generated section must not contradict the human record it is added to; when there is nothing to generate, add nothing.
5. **What now enforces it:** `scripts/records.test.mjs` "index leaves an adopted record without markers alone" (fails when the deferral is removed).

## 2026-09-16 The ID rule lived in three modules, and the open item named two

1. **What broke:** DECISIONS.md O20 said entry IDs were generated in `records.mjs` and `tasks.mjs`. Unifying them found a third copy in `commands/propose.mjs`, whose pattern accepted slugs with a trailing or doubled hyphen that the other two refuse.
2. **The mechanism:** each lane implemented the contract's `YYYY-MM-DD-<slug>-<hex4>` sentence on its own; the search behind O20 looked for the generator functions, and `propose` had only a pattern and a private date helper.
3. **The fix:** `packs/base/plugins/workflow/runtime/lib/ids.mjs` holds the rule (`newId`, `isId`, `slugify`, `localDate`); records, tasks and propose import it.
4. **The rule:** before declaring how many copies of a rule exist, search for the rule's shape (here `[0-9a-f]{4}`), not only for function names.
5. **What now enforces it:** `scripts/records.test.mjs` fails when any runtime module other than `ids.mjs` contains the pattern or defines its own generator (proved by adding one).

## 2026-09-16 releases/SCHEMA.md still called built behavior "design, not built" after the rehearsal proved it

1. **What broke:** after the M3 rehearsal passed 18 of 18, `releases/SCHEMA.md` still said the rehearsal "is still required", listed a contract gap that CONTRACTS section 9 had closed, and titled the update and recovery section "design, not built".
2. **The mechanism:** docs/MAINTAIN.md step 6 asked for SCHEMA.md only "when release contracts change"; the integration changed code and evidence, not the schema's formats, so nobody reread its status sections.
3. **The fix:** the sections were rewritten from the evidence (measured installs, what is built, what is not).
4. **The rule:** when a milestone's evidence lands, reread every status claim it could have changed, not only the files whose formats changed.
5. **What now enforces it:** docs/MAINTAIN.md step 6 now includes a sweep for "not built", "still required", "not verified" and similar phrases; nothing runs it automatically.

## 2026-09-16 The first eval run of the task skill ran out of turns doing work nobody asked for

1. **What broke:** in `task-start-records-work` at 06880a6, asked only to set up a piece of work, two of three with-plugin runs went on to edit the backlog and handoff, run `skillgate index` and start a review toward a commit; one hit the 30-turn limit mid-sentence.
2. **The mechanism:** in `claude plugin eval` runs the plugin's `bin/` is not on the shell path. The task skill said to "continue with the same steps by hand" when `skillgate` is missing, while the project instructions say to use the plugin's `bin/skillgate`; every run spent turns finding it. The skill also had no rule for a request that is only to set work up, so the model followed the whole lifecycle.
3. **The fix:** `packs/base/plugins/workflow/skills/task/SKILL.md` names the fallback (`bin/skillgate` two folders above the skill's base directory), stops at the record when only set-up was asked, and forbids editing a managed index list by hand; `skills/security/SKILL.md` names the same fallback. At e87d2d1 the runs took 14 to 18 turns and did only what was asked.
4. **The rule:** every instruction that depends on a helper command says how to reach it when the host does not put it on the path, in the same words everywhere; and a skill says where to stop when the request is narrower than its full lifecycle.
5. **What now enforces it:** the eval case itself (its `reply` check fails a run that ends mid-task); nothing compares the fallback sentences across instruction files yet.

## 2026-09-16 A PATH folder the process could not inspect made skillgate report an internal error

1. **What broke:** in an eval sandbox, `skillgate index` stopped with "unexpected internal error: EPERM: operation not permitted, stat '/opt/homebrew/bin/git'. This is a bug in skillgate", and the model spent turns working around it.
2. **The mechanism:** `which()` in `runtime/lib/core.mjs` checked each PATH candidate with `statOrNull`, which returns null only for ENOENT and ENOTDIR and rethrows anything else; EPERM from a sandbox, or EACCES from a folder without search permission, escaped as an unexpected exception.
3. **The fix:** `which()` skips candidates it cannot inspect (ENOENT, ENOTDIR, EACCES, EPERM, ELOOP, ENAMETOOLONG) and moves on to the next PATH entry.
4. **The rule:** a lookup over many candidates treats one unreadable candidate as absent; only a failure of the lookup as a whole is an error.
5. **What now enforces it:** `scripts/records.test.mjs` puts a folder without search permission first on PATH; the test fails on the old lookup.

## 2026-09-16 The default eval judge failed replies that met their rubric

1. **What broke:** the `reply` check of `task-start-records-work` failed two with-plugin runs (one at 06880a6, one at e87d2d1) whose final messages named the record, listed the criteria including the emailed link and 30-minute expiry, and claimed nothing was built.
2. **The mechanism:** the first rubric said "does not claim that anything was built or tested", and the default judge (haiku) read a truthful "the existing tests pass" as such a claim; after the wording was fixed, it still failed a long reply that met every element (DECISIONS.md O12).
3. **The fix:** the same case at the same commit with `--judge-model sonnet` passed all three with-plugin runs and failed a without-plugin reply that really omitted a rubric element; docs/MAINTAIN.md step 4 now passes `--judge-model sonnet`.
4. **The rule:** before changing a skill or a rubric over an llm check, read the reply; when the judge is wrong, test a stronger judge on the same case and check that it still fails what should fail.
5. **What now enforces it:** the recorded command in docs/MAINTAIN.md step 4 and the notes requirement to diagnose every failed check from its transcript; nothing checks the judge model automatically.

<!-- skilliton:index:lessons:start -->
Lesson entries in `docs/lessons/`, sorted by ID. `skilliton index` writes this list from the entries; edit the entries, not the list.

| ID | Title | Status | Date |
|---|---|---|---|
| [2026-09-16-a-commit-message-said-every-suite-passed-6d54](lessons/2026-09-16-a-commit-message-said-every-suite-passed-6d54.md) | A commit message said every suite passed after a late wording change broke one test | accepted | 2026-09-16 |
| [2026-09-16-a-documented-maintainer-command-refused-1178](lessons/2026-09-16-a-documented-maintainer-command-refused-1178.md) | A documented maintainer command refused on a fresh fork because its test built the fixture by hand | accepted | 2026-09-16 |
| [2026-09-16-a-merge-could-bring-back-an-earlier-deli-8d09](lessons/2026-09-16-a-merge-could-bring-back-an-earlier-deli-8d09.md) | A merge could bring back an earlier delivery policy because each commit was compared only with its first parent | accepted | 2026-09-16 |
| [2026-09-16-decisions-and-lessons-went-into-the-mono-0925](lessons/2026-09-16-decisions-and-lessons-went-into-the-mono-0925.md) | Decisions and lessons went into the monoliths although the instructions say entry files | accepted | 2026-09-16 |
| [2026-09-16-renaming-the-policy-path-would-have-lock-76ff](lessons/2026-09-16-renaming-the-policy-path-would-have-lock-76ff.md) | Renaming the policy path would have locked every protected branch under both the old and the new gate | accepted | 2026-09-16 |
| [2026-09-16-rollback-ordered-receipts-by-id-so-an-ol-70e5](lessons/2026-09-16-rollback-ordered-receipts-by-id-so-an-ol-70e5.md) | Rollback ordered receipts by ID, so an older instructions receipt would have blocked undoing the rename | accepted | 2026-09-16 |
| [2026-09-16-the-lanes-not-verified-lists-lived-only-c61d](lessons/2026-09-16-the-lanes-not-verified-lists-lived-only-c61d.md) | The lanes' not-verified lists lived only in worktrees marked removable | accepted | 2026-09-16 |
| [2026-09-16-the-real-codex-refused-a-missing-home-an-2784](lessons/2026-09-16-the-real-codex-refused-a-missing-home-an-2784.md) | The real Codex refused a missing home and wrote into its home on every run, which the stand-in did not model | accepted | 2026-09-16 |
| [2026-09-16-undo-trusted-its-own-receipt-so-a-tamper-15cd](lessons/2026-09-16-undo-trusted-its-own-receipt-so-a-tamper-15cd.md) | Undo trusted its own receipt, so a tampered receipt could delete any file whose hash it named | accepted | 2026-09-16 |
| [2026-09-17-a-not-active-check-passed-on-a-start-tha-da88](lessons/2026-09-17-a-not-active-check-passed-on-a-start-tha-da88.md) | A not-active check passed on a start that never ran a session | accepted | 2026-09-17 |
| [2026-09-17-a-rule-that-classifies-a-line-must-not-c-b692](lessons/2026-09-17-a-rule-that-classifies-a-line-must-not-c-b692.md) | A rule that classifies a line must not consume it | accepted | 2026-09-17 |
| [2026-09-17-a-synchronous-start-cannot-stop-a-progra-5e68](lessons/2026-09-17-a-synchronous-start-cannot-stop-a-progra-5e68.md) | A synchronous start cannot stop a program that ignores being stopped | accepted | 2026-09-17 |
| [2026-09-17-a-test-that-proves-an-attack-is-prevente-af61](lessons/2026-09-17-a-test-that-proves-an-attack-is-prevente-af61.md) | A test that proves an attack is prevented needs its positive control in the same run | accepted | 2026-09-17 |
| [2026-09-17-handoff-times-typed-ahead-of-the-clock-h-95ba](lessons/2026-09-17-handoff-times-typed-ahead-of-the-clock-h-95ba.md) | Handoff times typed ahead of the clock hide a stale handoff | accepted | 2026-09-17 |
| [2026-09-18-a-check-that-looks-for-a-heading-cannot-dfde](lessons/2026-09-18-a-check-that-looks-for-a-heading-cannot-dfde.md) | A check that looks for a heading cannot tell a stale section from a current one | accepted | 2026-09-18 |
| [2026-09-18-a-first-copy-wins-dedup-keeps-the-stream-d6c1](lessons/2026-09-18-a-first-copy-wins-dedup-keeps-the-stream-d6c1.md) | A first-copy-wins dedup keeps the streaming partial and undercounts output by two orders of magnitude | accepted | 2026-09-18 |
| [2026-09-18-a-fix-that-scopes-a-removal-can-open-a-h-d5df](lessons/2026-09-18-a-fix-that-scopes-a-removal-can-open-a-h-d5df.md) | A fix that scopes a removal can open a hole the removal was closing | accepted | 2026-09-18 |
| [2026-09-18-a-gate-that-walks-the-list-it-is-checkin-7323](lessons/2026-09-18-a-gate-that-walks-the-list-it-is-checkin-7323.md) | A gate that walks the list it is checking passes when the list gets shorter | accepted | 2026-09-18 |
| [2026-09-18-a-patch-that-aborts-leaves-the-file-unch-910d](lessons/2026-09-18-a-patch-that-aborts-leaves-the-file-unch-910d.md) | A patch that aborts leaves the file unchanged, and a self-test nobody wrote still passes | accepted | 2026-09-18 |
| [2026-09-18-a-rehearsal-that-clones-the-committed-tr-0316](lessons/2026-09-18-a-rehearsal-that-clones-the-committed-tr-0316.md) | A rehearsal that clones the committed tree but runs the working tree's runtime disagrees whenever the two differ | accepted | 2026-09-18 |
| [2026-09-18-a-self-test-mutation-must-change-and-pro-0a3c](lessons/2026-09-18-a-self-test-mutation-must-change-and-pro-0a3c.md) | A self-test mutation must change and prove the same line | accepted | 2026-09-18 |
| [2026-09-19-a-hand-typed-list-of-options-in-a-refusa-ee5f](lessons/2026-09-19-a-hand-typed-list-of-options-in-a-refusa-ee5f.md) | A hand-typed list of options in a refusal loop accepts a new option silently everywhere it was left out | accepted | 2026-09-19 |
| [2026-09-19-a-rewriter-of-a-hand-edited-file-proves-43c7](lessons/2026-09-19-a-rewriter-of-a-hand-edited-file-proves-43c7.md) | A rewriter of a hand-edited file proves the round-trip before it writes | accepted | 2026-09-19 |
| [2026-09-19-a-session-that-installed-the-plugins-sti-fd48](lessons/2026-09-19-a-session-that-installed-the-plugins-sti-fd48.md) | A session that installed the plugins still sees the PATH computed at its start; measure in a session started after the change | accepted | 2026-09-19 |
| [2026-09-20-a-command-held-in-a-variable-is-one-word-5d82](lessons/2026-09-20-a-command-held-in-a-variable-is-one-word-5d82.md) | A command held in a variable is one word in zsh, so a loop of checks can run nothing and still report success | accepted | 2026-09-20 |
| [2026-09-20-a-gate-list-typed-by-hand-from-prose-has-ce6a](lessons/2026-09-20-a-gate-list-typed-by-hand-from-prose-has-ce6a.md) | A gate list typed by hand from prose has no gate of its own | accepted | 2026-09-20 |
| [2026-09-20-a-hook-that-runs-on-every-prompt-cannot-8958](lessons/2026-09-20-a-hook-that-runs-on-every-prompt-cannot-8958.md) | A hook that runs on every prompt cannot say it is unavailable | accepted | 2026-09-20 |
| [2026-09-20-a-minute-granularity-timestamp-compared-32a5](lessons/2026-09-20-a-minute-granularity-timestamp-compared-32a5.md) | A minute-granularity timestamp compared against file times needs a window as wide as the write | accepted | 2026-09-20 |
| [2026-09-20-a-mutant-that-kills-two-cases-has-told-y-afe9](lessons/2026-09-20-a-mutant-that-kills-two-cases-has-told-y-afe9.md) | A mutant that kills two cases has told you something about the tests | accepted | 2026-09-20 |
| [2026-09-20-a-replacement-string-ending-in-a-dollar-1e99](lessons/2026-09-20-a-replacement-string-ending-in-a-dollar-1e99.md) | A replacement string ending in a dollar-backtick splices the file into itself | accepted | 2026-09-20 |
| [2026-09-20-a-test-killed-by-its-own-timeout-is-cont-3b76](lessons/2026-09-20-a-test-killed-by-its-own-timeout-is-cont-3b76.md) | A test killed by its own timeout is contention until it is re-run on a quiet machine | accepted | 2026-09-20 |
| [2026-09-20-an-assertion-that-a-value-wins-only-gate-a070](lessons/2026-09-20-an-assertion-that-a-value-wins-only-gate-a070.md) | An assertion that a value wins only gates when the fixture makes the two values differ | accepted | 2026-09-20 |
| [2026-09-20-an-unquoted-colon-space-in-frontmatter-d-0f41](lessons/2026-09-20-an-unquoted-colon-space-in-frontmatter-d-0f41.md) | An unquoted colon-space in frontmatter drops the whole block | accepted | 2026-09-20 |
| [2026-09-21-a-check-that-looks-for-a-word-also-finds-d128](lessons/2026-09-21-a-check-that-looks-for-a-word-also-finds-d128.md) | A check that looks for a word also finds its negation | accepted | 2026-09-21 |
| [2026-09-21-a-command-with-nothing-to-apply-refuses-660a](lessons/2026-09-21-a-command-with-nothing-to-apply-refuses-660a.md) | A command with nothing to apply refuses, it does not fall back to a status view | accepted | 2026-09-21 |
| [2026-09-21-a-file-exists-grader-watches-the-run-s-o-4d8a](lessons/2026-09-21-a-file-exists-grader-watches-the-run-s-o-4d8a.md) | A file_exists grader watches the run's own file operations, not the workspace | accepted | 2026-09-21 |
| [2026-09-21-a-gate-reads-the-shape-of-a-call-not-wha-dcd7](lessons/2026-09-21-a-gate-reads-the-shape-of-a-call-not-wha-dcd7.md) | A gate reads the shape of a call, not what it means | accepted | 2026-09-21 |
| [2026-09-21-a-lane-s-test-is-its-own-file-the-integr-a6ca](lessons/2026-09-21-a-lane-s-test-is-its-own-file-the-integr-a6ca.md) | A lane's test is its own file; the integrating gate is the whole suite | accepted | 2026-09-21 |
| [2026-09-21-a-not-run-on-this-machine-can-be-a-versi-1f6b](lessons/2026-09-21-a-not-run-on-this-machine-can-be-a-versi-1f6b.md) | A NOT RUN was the wrong binary, not a version gap | accepted | 2026-09-21 |
| [2026-09-21-a-project-s-own-numbered-entries-are-a-n-ab8c](lessons/2026-09-21-a-project-s-own-numbered-entries-are-a-n-ab8c.md) | A project's own numbered entries are a note said once, never a problem per file and never an attention exit | accepted | 2026-09-21 |
| [2026-09-21-a-refusal-that-names-one-missing-flag-at-0eb8](lessons/2026-09-21-a-refusal-that-names-one-missing-flag-at-0eb8.md) | A refusal that names one missing flag at a time, on a machine that had already joined | accepted | 2026-09-21 |
| [2026-09-21-an-audit-finds-its-own-rules-written-dow-cc3f](lessons/2026-09-21-an-audit-finds-its-own-rules-written-dow-cc3f.md) | An audit finds its own rules written down | accepted | 2026-09-21 |
| [2026-09-21-an-exit-status-read-after-a-pipe-is-the-c869](lessons/2026-09-21-an-exit-status-read-after-a-pipe-is-the-c869.md) | An exit status read after a pipe is the pipe's, so every gate reported success | accepted | 2026-09-21 |
| [2026-09-21-the-first-signed-release-turned-a-refusa-f7b6](lessons/2026-09-21-the-first-signed-release-turned-a-refusa-f7b6.md) | The first signed release turned a refusal about the machine into one about the tag | accepted | 2026-09-21 |
| [2026-09-21-the-tool-said-so-on-its-second-line-and-0a35](lessons/2026-09-21-the-tool-said-so-on-its-second-line-and-0a35.md) | The tool said so on its second line and its last line, and the table between them was read instead | accepted | 2026-09-21 |
| [2026-09-21-verify-called-every-plugin-in-use-tamper-3e4a](lessons/2026-09-21-verify-called-every-plugin-in-use-tamper-3e4a.md) | verify called every plugin in use TAMPERED, because the client writes a marker into the folder it verifies | accepted | 2026-09-21 |
| [2026-09-22-a-check-runner-that-starts-a-login-shell-1367](lessons/2026-09-22-a-check-runner-that-starts-a-login-shell-1367.md) | A check runner that starts a login shell changes what the tests control | accepted | 2026-09-22 |
| [2026-09-22-a-guard-judges-paths-against-the-root-th-a324](lessons/2026-09-22-a-guard-judges-paths-against-the-root-th-a324.md) | A guard judges paths against the root the client names, spelled as the input spelled it | accepted | 2026-09-22 |
| [2026-09-22-a-rewrite-over-every-file-walks-the-work-0230](lessons/2026-09-22-a-rewrite-over-every-file-walks-the-work-0230.md) | A rewrite over every file walks the worktrees nested inside the repository | accepted | 2026-09-22 |
| [2026-09-22-a-self-test-that-builds-its-fixture-from-662b](lessons/2026-09-22-a-self-test-that-builds-its-fixture-from-662b.md) | A self-test that builds its fixture from the live record breaks the day the record gains the feature | accepted | 2026-09-22 |
<!-- skilliton:index:lessons:end -->
