# Task: Lane guard-review

Kind: Living. Task record.

- **ID:** 2026-09-23-lane-guard-review-28ae
- **State:** in-progress
- **Branch:** lane/guard-review-0923
- **Owner:** unassigned
- **Updated:** 2026-09-23T15:03:40.723Z

## Request

LANES.md, dispatched 2026-09-23: the items below are this lane's whole scope, and work that is not among them belongs to another lane.

## Acceptance criteria

- [ ] N70. [FEATURE] Writes that switch the hooks off ask: guard-bash.sh, SKILL.md: a Bash command whose output lands in `.claude/settings.json` or `.claude/settings.local.json` (redirection `>` or `>>`, `tee`, `cp` or `mv` onto it, `sed -i`, `jq ... > it`, `python3 -c` naming it, a heredoc onto it) and whose text holds `hooks`, `disableAllHooks` or `enabledPlugins` returns ask with a reason naming the file and the word; the same rule for `.claude/settings.json` under a path prefix (`./`, `$PWD/`, an absolute path inside the project). Creating `.skilliton-off` by any command form (`touch`, `>`, `cp`, `install`, `printf ... >`) asks with a reason saying every workflow hook then stays silent. Reproduced at the base: `echo '{"disableAllHooks":true}' > .claude/settings.json` and `touch .skilliton-off` are allowed. Done looks like: both ask; ordinary reads and writes elsewhere are unchanged; the existing config-words rule for `.skilliton/config.json` still asks.
- [ ] N71. [FEATURE] The guard reads git options the way git does: guard-bash.sh, SKILL.md: (a) git accepts any unambiguous prefix of a long option, so a `--` word that is a prefix of a dangerous option (`--force`, `--force-with-lease`, `--force-if-includes`, `--mirror`, `--delete`, `--no-verify`, `--hard`, `--discard-changes`, `--all` where it matters) is read as that option: `git push --forc origin main`, `git push --f origin main`, `git push --mir origin`, `git commit --no-ver -m x` are denied like their full spellings (over-matching is allowed: a prefix that matches more than one dangerous option is read as the more dangerous one; a prefix of a harmless option stays harmless); (b) `--no-force` cancels `--force` only; an earlier `--force-with-lease` or `--force-if-includes` stays in effect, so `git push origin --force-with-lease --no-force HEAD:main` is denied; (c) `-c` configuration on the git command that changes what a push or a commit does asks: `-c remote.<name>.push=<refspec>` (deny outright when the refspec starts with `+` and names a protected branch, or has no branch and the current branch is protected), `-c push.default=...` combined with a force flag, `-c alias.<x>=...` when the alias body holds `push`, `commit`, `reset`, `checkout`, `clean`, `branch -D` or `--no-verify` (deny when the body holds a force or a hook skip aimed at a protected branch, else ask), and the same three through `GIT_CONFIG_KEY_<n>`, `GIT_CONFIG_PARAMETERS` and `--config-env`, the way core.hooksPath is already caught; (d) an unresolved `$variable`, `${variable}` or `$'...'` in a push refspec or branch position, or in the argument of `checkout -f`, `reset --hard`, `branch -D` or `rm -rf`, asks (the guard's own rule for `$( )` is "ask when it cannot know"; variables get the same), so `x=main; git push -f origin $x` and `for b in main; do git push -f origin $b; done` ask, while a variable that the same command line assigns a literal to may be resolved from that assignment; (e) `--no-verify` on `merge`, `rebase`, `am`, `cherry-pick`, `revert` and `push` (where git accepts it) is caught like on `commit`; `HUSKY=0`, `SKIP=all`, `LEFTHOOK=0` prefixes on a git commit ask; `rm`, `mv`, `chmod` and `truncate` aimed at `.git/hooks/` deny. Done looks like: each listed command has a test case with the decision the review showed at the base (allow) and the decision now, and the push forms are also run against a real bare remote in the test.
- [ ] N72. [TOUCH] The commit path caps its content scan: guard-bash.sh `check_commit` (line 1199 at the base) and the add path's 10 MB name-only rule (lines 1048 to 1050 at the base): a staged file over the cap is checked by name only on the commit path too, so a 200 MB text file cannot run the hook past its 10 second timeout into an allow; the reason says the file was too large to scan and names it. Test: stage a file just over the cap with a secret-shaped last line in a fixture repository, time `git commit -m x` through the hook, assert a decision within 5 seconds and that the decision names the size rule; and a file under the cap with the same last line is still denied by content.
- [ ] N73. [FEATURE] The ask rules cover the discard verbs and the deny rule covers the record-deletion forms: guard-bash.sh `check_checkout`, `check_restore`, a new worktree rule, `check_remove`, `protected_target`, SKILL.md: ask on `git checkout -f`, `git checkout -f <branch>`, `git switch -f`, `git switch --discard-changes`, `git switch -C <branch> <start>`, `git worktree remove --force`, `git rm -f <tracked path>`, `git restore <path>`, `git restore -W <path>`, `git checkout -- <path>` (a single modified path is still a discard; asking on every restore is acceptable, the skill says so), `rm -rf .git`; deny `find <records folder> -delete` and `find . -name '*.md' -delete` when the records folder is under the search root, brace expansion (`rm -rf docs/{tasks,decisions}` is read as the two paths), `rm -rf "$PWD/docs"` and `rm -rf ./docs/../docs`, `truncate -s 0 <record file>`, a redirection `> <record file>`, `cp /dev/null <record file>`, a heredoc onto CLAUDE.md or AGENTS.md (the managed block lives there), `rsync --delete` into the records folder, `python3 -c` or `perl -e` text that names `rmtree`, `unlink` or `os.remove` with a record path; and on a case-insensitive filesystem (test with `ls` of a differently cased spelling resolving, or compare names case-folded when the project's disk is case-insensitive, detected once per run) `rm -rf DOCS` and `rm decisions.md` are read as the record paths they hit. Done looks like: every listed command has a case with the base decision and the new one; ordinary `rm` of a non-record file stays allowed; the existing record-protection cases in guardrails.test.sh still pass.

## Decisions

not yet written

## Checkpoints

## Handoff

- **State:** not yet written
- **Next:** not yet written
- **Blocked:** not yet written
- **Watch out:** not yet written
