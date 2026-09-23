# Task: Lane guard-security

Kind: Living. Task record.

- **ID:** 2026-09-22-lane-guard-security-68d3
- **State:** in-progress
- **Branch:** lane/guard-security-0922
- **Owner:** unassigned
- **Updated:** 2026-09-22T22:59:34.057Z

## Request

LANES.md, dispatched 2026-09-22: the items below are this lane's whole scope, and work that is not among them belongs to another lane.

## Acceptance criteria

- [x] N27. [TOUCH] HIGH: force-push through pattern refspecs and `heads/`: around lines 805 to 816, `dst` has only `refs/heads/` stripped and is matched literally. Allowed today: `git push -f origin 'refs/heads/*'`, `git push -f origin 'refs/heads/*:refs/heads/*'`, `git push origin '+refs/heads/*:refs/heads/*'`, `git push -f origin HEAD:heads/main` (git expands heads/main to refs/heads/main; a real remote's main was force-updated). Fix: a dst containing `*` hits every protected branch; strip a leading `refs/`, then `heads/`, before is_protected.
- [x] N28. [TOUCH] MEDIUM: deleting a protected branch on the remote: check_push around lines 756 to 785 allows `git push origin --delete main`, `git push -d origin main` and `git push origin :main`. Treat --delete, -d and an empty source the same as force for protected names.
- [x] N29. [TOUCH] MEDIUM: wrappers that take an argument hide the command: analyze_segment around lines 452 to 464 skips only flags after env, nice, sudo and exec, so a flag's value is read as the command name, and timeout and caffeinate are not treated as wrappers. Allowed today: `env -u FOO git push --force origin HEAD:main`, `nice -n 5 git push --force origin HEAD:main`, `timeout 60 git push --force origin main`, `sudo -u someone git push --force origin main`, `exec -a x git push --force origin main`, `caffeinate -i git push -f origin main`, `env -u X rm -rf .skilliton`. Fix: give each wrapper's value-taking options their argument (env -u, -C, -P, and -S as a shell string; nice -n; sudo -u, -g; exec -a), add timeout <duration>, caffeinate, stdbuf and ionice; if a segment still has a later word that is exactly git, rm or mv after an unrecognized wrapper, ask rather than allow.
- [x] N30. [TOUCH] MEDIUM: the assistant can turn the rules off by writing the config they come from: guard-bash.sh lines 268 to 303 read .skilliton/config.json from the working tree, and neither hooks/lane-write-guard.mjs nor hooks/managed-block-guard.mjs refuses a Write or Edit that sets a guardrails key to false. Fix in the write guard that fits: refuse a Write or Edit of .skilliton/config.json whose result turns a guardrails key from true (or absent) to false, or shrinks protectedBranches, with a reason saying a person makes that change in their own editor or terminal. For a shell write (`echo ... > .skilliton/config.json`, `node -e` writing it), the Bash guard asks when a command names .skilliton/config.json as a write target. Tests for Write, Edit and the shell forms.
- [x] N31. [TOUCH] LOW: `git stage` skips the secret-file check: the git subcommand switch around lines 524 to 535 has no `stage`. Fix: `add|stage)`. Test: `git stage .env && git commit -m x` is denied like `git add .env`.
- [x] N32. [TOUCH] LOW: the tokenizer loses quotes and heredocs: around lines 341 to 350 and 370 to 385. (a) A double-quoted `$(cat <<'EOF' ... EOF)` whose body has an odd number of double quotes flips the quote state, and what follows is not read: `git commit -m "$(cat <<'EOF'` / `Use a 12" pipe` / `EOF` / `)" && git push --force origin main` is allowed, and zsh runs both. (b) `echo $((1<<n))` then `git push --force origin main` on the next line is allowed because `<<n` is taken as a heredoc. Fix: track `$(` and `$((` depth inside double quotes and never start a heredoc inside arithmetic; where the state is uncertain, ask. Tests for both shapes.
- [x] N33. [TOUCH] LOW: a `GIT_DIR=` prefix is skipped while `--git-dir` is honored (around lines 458 to 461): `GIT_DIR=<other>/.git git push -f <remote> HEAD` is allowed. Turn GIT_DIR= and GIT_WORK_TREE= prefixes into the same git arguments `--git-dir` and `--work-tree` produce.
- [x] N34. [TOUCH] LOW, document: a secret written and staged in the same command is not scanned (`printf 'k=AKIA...' > cfg.txt && git add cfg.txt && git commit -m x` is allowed) because the hook sees the tree before the command runs; and globs (`rm -rf docs/*`) are not expanded. Ask when an earlier segment redirects into a path a later add or commit in the same command names; add both limits to the header and to packs/base/plugins/guardrails/skills/guardrails/SKILL.md in one line each.

## Decisions

not yet written

## Checkpoints

## Handoff

- **State:** not yet written
- **Next:** not yet written
- **Blocked:** not yet written
- **Watch out:** not yet written
