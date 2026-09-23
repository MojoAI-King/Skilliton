# Task: Lane guard-review

Kind: Living. Task record.

- **ID:** 2026-09-23-lane-guard-review-28ae
- **State:** in-progress
- **Branch:** lane/guard-review-0923
- **Owner:** unassigned
- **Updated:** 2026-09-23T15:47:01.497Z

## Request

LANES.md, dispatched 2026-09-23: the items below are this lane's whole scope, and work that is not among them belongs to another lane.

## Acceptance criteria

- [x] N70. [FEATURE] Writes that switch the hooks off ask: guard-bash.sh, SKILL.md: a Bash command whose output lands in `.claude/settings.json` or `.claude/settings.local.json` (redirection `>` or `>>`, `tee`, `cp` or `mv` onto it, `sed -i`, `jq ... > it`, `python3 -c` naming it, a heredoc onto it) and whose text holds `hooks`, `disableAllHooks` or `enabledPlugins` returns ask with a reason naming the file and the word; the same rule for `.claude/settings.json` under a path prefix (`./`, `$PWD/`, an absolute path inside the project). Creating `.skilliton-off` by any command form (`touch`, `>`, `cp`, `install`, `printf ... >`) asks with a reason saying every workflow hook then stays silent. Reproduced at the base: `echo '{"disableAllHooks":true}' > .claude/settings.json` and `touch .skilliton-off` are allowed. Done looks like: both ask; ordinary reads and writes elsewhere are unchanged; the existing config-words rule for `.skilliton/config.json` still asks. Evidence: scripts/guardrails-review.test.sh, the two N70 sections (24 cases that were allow at the base now ask; the negatives still allow; the .skilliton/config.json rule still asks).
- [x] N71. [FEATURE] The guard reads git options the way git does: guard-bash.sh, SKILL.md: (a) git accepts any unambiguous prefix of a long option, so a `--` word that is a prefix of a dangerous option (`--force`, `--force-with-lease`, `--force-if-includes`, `--mirror`, `--delete`, `--no-verify`, `--hard`, `--discard-changes`, `--all` where it matters) is read as that option: `git push --forc origin main`, `git push --f origin main`, `git push --mir origin`, `git commit --no-ver -m x` are denied like their full spellings (over-matching is allowed: a prefix that matches more than one dangerous option is read as the more dangerous one; a prefix of a harmless option stays harmless); (b) `--no-force` cancels `--force` only; an earlier `--force-with-lease` or `--force-if-includes` stays in effect, so `git push origin --force-with-lease --no-force HEAD:main` is denied; (c) `-c` configuration on the git command that changes what a push or a commit does asks: `-c remote.<name>.push=<refspec>` (deny outright when the refspec starts with `+` and names a protected branch, or has no branch and the current branch is protected), `-c push.default=...` combined with a force flag, `-c alias.<x>=...` when the alias body holds `push`, `commit`, `reset`, `checkout`, `clean`, `branch -D` or `--no-verify` (deny when the body holds a force or a hook skip aimed at a protected branch, else ask), and the same three through `GIT_CONFIG_KEY_<n>`, `GIT_CONFIG_PARAMETERS` and `--config-env`, the way core.hooksPath is already caught; (d) an unresolved `$variable`, `${variable}` or `$'...'` in a push refspec or branch position, or in the argument of `checkout -f`, `reset --hard`, `branch -D` or `rm -rf`, asks (the guard's own rule for `$( )` is "ask when it cannot know"; variables get the same), so `x=main; git push -f origin $x` and `for b in main; do git push -f origin $b; done` ask, while a variable that the same command line assigns a literal to may be resolved from that assignment; (e) `--no-verify` on `merge`, `rebase`, `am`, `cherry-pick`, `revert` and `push` (where git accepts it) is caught like on `commit`; `HUSKY=0`, `SKIP=all`, `LEFTHOOK=0` prefixes on a git commit ask; `rm`, `mv`, `chmod` and `truncate` aimed at `.git/hooks/` deny. Done looks like: each listed command has a test case with the decision the review showed at the base (allow) and the decision now, and the push forms are also run against a real bare remote in the test. Evidence: scripts/guardrails-review.test.sh, the two N71 sections (17 push forms run for real against a bare remote, then asked of the hook; 47 base labels checked against the base hook with no mismatch); scripts/guardrails.test.sh line 577 now expects rm -rf "$TMP/x" to ask, as (d) says.
- [x] N72. [TOUCH] The commit path caps its content scan: guard-bash.sh `check_commit` (line 1199 at the base) and the add path's 10 MB name-only rule (lines 1048 to 1050 at the base): a staged file over the cap is checked by name only on the commit path too, so a 200 MB text file cannot run the hook past its 10 second timeout into an allow; the reason says the file was too large to scan and names it. Test: stage a file just over the cap with a secret-shaped last line in a fixture repository, time `git commit -m x` through the hook, assert a decision within 5 seconds and that the decision names the size rule; and a file under the cap with the same last line is still denied by content. Evidence: scripts/guardrails-review.test.sh, the N72 section (a 10.5 MB staged file with a secret-shaped last line is decided in 1 s as an ask naming the size rule; a small one is still denied by content; a small staged blob with a large file on disk is still scanned). Measured here: a 100 MB staged file took the base hook 23 s (past the 10 s timeout) and the new one under 1 s.
- [ ] N73. [FEATURE] The ask rules cover the discard verbs and the deny rule covers the record-deletion forms: guard-bash.sh `check_checkout`, `check_restore`, a new worktree rule, `check_remove`, `protected_target`, SKILL.md: ask on `git checkout -f`, `git checkout -f <branch>`, `git switch -f`, `git switch --discard-changes`, `git switch -C <branch> <start>`, `git worktree remove --force`, `git rm -f <tracked path>`, `git restore <path>`, `git restore -W <path>`, `git checkout -- <path>` (a single modified path is still a discard; asking on every restore is acceptable, the skill says so), `rm -rf .git`; deny `find <records folder> -delete` and `find . -name '*.md' -delete` when the records folder is under the search root, brace expansion (`rm -rf docs/{tasks,decisions}` is read as the two paths), `rm -rf "$PWD/docs"` and `rm -rf ./docs/../docs`, `truncate -s 0 <record file>`, a redirection `> <record file>`, `cp /dev/null <record file>`, a heredoc onto CLAUDE.md or AGENTS.md (the managed block lives there), `rsync --delete` into the records folder, `python3 -c` or `perl -e` text that names `rmtree`, `unlink` or `os.remove` with a record path; and on a case-insensitive filesystem (test with `ls` of a differently cased spelling resolving, or compare names case-folded when the project's disk is case-insensitive, detected once per run) `rm -rf DOCS` and `rm decisions.md` are read as the record paths they hit. Done looks like: every listed command has a case with the base decision and the new one; ordinary `rm` of a non-record file stays allowed; the existing record-protection cases in guardrails.test.sh still pass.

## Decisions

not yet written

## Checkpoints

### 2026-09-23T15:24:51.951Z

- **State:** N70 done: writes to .claude/settings.json or settings.local.json that bring in or meet hooks, disableAllHooks or enabledPlugins ask, and creating .skilliton-off asks
- **Evidence:** bash scripts/guardrails-bypass.test.sh exit 0 (143 ok, runs guardrails-review.test.sh: 42 ok); bash scripts/guardrails.test.sh exit 0 (676 ok); allowlist, lint, names, scrub exit 0
- **Next:** N71: git option prefixes, --no-force, -c config, unresolved variables, --no-verify on more verbs, hook-skip variables, .git/hooks
- **Git:** lane/guard-review-0923 @ fd88938, 5 uncommitted

### 2026-09-23T15:37:37.182Z

- **State:** N71 done: option starts read as git reads them, --no-force takes back --force only, -c/GIT_CONFIG_*/--config-env push refspecs, push.default and aliases read, unresolved variables in a force-push or rm -rf ask, --no-verify on merge/rebase/am/cherry-pick/revert/pull denied, HUSKY=0/SKIP=/LEFTHOOK=0 ask, rm/mv/chmod/truncate on .git/hooks denied
- **Evidence:** bash scripts/guardrails-bypass.test.sh exit 0 (143 ok; review file 123 ok); bash scripts/guardrails.test.sh exit 0 (676 ok); allowlist, footprint, lint, names, audit.test, secret-rules, deadcode, scrub exit 0
- **Next:** N72: cap the commit path's content scan at the add path's 10 MB
- **Git:** lane/guard-review-0923 @ affdb6b, 5 uncommitted

### 2026-09-23T15:47:01.497Z

- **State:** N72 done: the commit path measures staged blobs by their index size and working-tree files by their disk size, leaves those over 10239 KiB out of the diff, and asks naming the file
- **Evidence:** bash scripts/guardrails-bypass.test.sh exit 0 (143 ok; review file 134 ok); guardrails.test.sh exit 0 (676 ok); allowlist, footprint, git-config, lint, names, audit.test, secret-rules, scrub exit 0; 100 MB staged file: base 23 s, new under 1 s
- **Next:** N73: discard verbs ask, record-deletion forms deny
- **Git:** lane/guard-review-0923 @ e2201b1, 4 uncommitted

## Handoff

- **State:** N72 done: the commit path measures staged blobs by their index size and working-tree files by their disk size, leaves those over 10239 KiB out of the diff, and asks naming the file. Evidence: bash scripts/guardrails-bypass.test.sh exit 0 (143 ok; review file 134 ok); guardrails.test.sh exit 0 (676 ok); allowlist, footprint, git-config, lint, names, audit.test, secret-rules, scrub exit 0; 100 MB staged file: base 23 s, new under 1 s.
- **Next:** N73: discard verbs ask, record-deletion forms deny
- **Blocked:** nothing
- **Watch out:** rm -rf with an unresolved variable now asks; guardrails.test.sh line 577 changed from allow to ask
