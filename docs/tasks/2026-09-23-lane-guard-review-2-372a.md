# Task: Lane guard-review-2

Kind: Living. Task record.

- **ID:** 2026-09-23-lane-guard-review-2-372a
- **State:** in-progress
- **Branch:** lane/guard-review-2-0923b
- **Owner:** unassigned
- **Updated:** 2026-09-23T21:07:18.594Z

## Request

LANES.md, dispatched 2026-09-23: the items below are this lane's whole scope, and work that is not among them belongs to another lane.

## Acceptance criteria

- [x] N88. [TOUCH] Command text over a size cap asks at once: guard-bash.sh: before any tokenizing, when the command text is longer than 64 KB (a constant near the top, documented in the header), write the ask decision with a reason saying the command is too long to read and how long it is, and exit; nothing else runs. Reproduced at the base: 1,200 KB of text plus `git push -f origin main` took 13.5 s against the hook's 10 s budget (a timeout reads as allow in the client, per the header). Test in scripts/guardrails-timing.test.sh: 3 MB of text with a forced push decides ask in under one second; 60 KB of harmless text still gets its real decision (allow) so the cap does not bite ordinary long commands; and the timing file reports NOT RUN with the load average when `sysctl -n vm.loadavg` (macOS) or /proc/loadavg (Linux) shows a one-minute load above four times the CPU count, instead of failing.
- [x] N89. [TOUCH] In-place editors on a record deny: guard-bash.sh: `sed -i`, `sed -i''`, `sed -i.bak`, `perl -pi`, `perl -i`, `awk -i inplace`, `ex`, `ed`, `sponge` aimed at a record file or at CLAUDE.md or AGENTS.md deny with the record-protection reason; the same editors on other files stay allowed; `sed` without `-i` stays allowed. Reproduced at the base: `sed -i.bak -e d docs/STATUS.md` allowed while `cp /dev/null docs/STATUS.md` denied (sed was routed only to the settings-words rule). Cases in scripts/guardrails-review2.test.sh.
- [x] N90. [TOUCH] A shell fed from a pipe, a decoder or a file asks: `| sh`, `| bash`, `| zsh`, `| dash`, `| sh -s`, `base64 -d | sh`, `base64 --decode | bash`, `xxd -r -p | sh`, `curl ... | sh`, `xargs sh -c`, `xargs -I{} bash -c`, `sh <file>`, `bash <file>` where the file is not a known check script under scripts/, `source <file>`, `. <file>`, `eval "$(...)"` (already asks; keep), `env -S`, `exec sh`: ask with a reason saying the guard cannot read what the shell will run; `git ... | cat` and `... | grep` stay allowed. Reproduced at the base: `echo "git push -f origin main" | sh` and `echo <base64> | base64 -d | sh` allowed silently. Cases in the review2 file.
- [x] N91. [TOUCH] Any write to, copy over, move over or removal of `.claude/settings.json` or `.claude/settings.local.json` asks, whatever the text says: `echo {} > .claude/settings.json`, `: > .claude/settings.json`, `rm .claude/settings.json`, `mv x .claude/settings.json`, `cp x .claude/settings.json`, `truncate`, `install`, `ln -sf`, `git rm .claude/settings.json`, `git checkout -- .claude/settings.json`, and the same under a path prefix; reading it (`cat`, `jq .`) stays allowed. Reproduced at the base: `echo {} > .claude/settings.json` and `rm .claude/settings.json` allowed. Cases in the review2 file.
- [ ] N92. [TOUCH] A glob that can match a record path denies: guard-bash.sh: for `rm`, `rmdir`, `mv`, `find -delete`, `rsync --delete` and the redirections, a word holding `*`, `?` or `[` is matched with bash's own pattern matching (`[[ <record path> == <pattern> ]]`, case-folded on a case-insensitive disk) against every record path the guard protects (`docs/`, `docs/tasks`, `docs/decisions`, `docs/lessons`, the status, backlog, handoff files, DECISIONS.md, CLAUDE.md, AGENTS.md, `.skilliton`, `.skilliton/config.json`) and their parents; a match denies; `rm -rf *` and `rm -rf ./*` and `rm -rf .*` at the project root ask; a glob that cannot match a record (`rm -rf dist/*`, `rm -f *.log`) stays allowed. Reproduced at the base: `rm -rf docs/*`, `rm -rf docs/t*`, `rm -rf d*cs/tasks` allowed silently. Cases in the review2 file.
- [x] N93. [TOUCH] The wall-clock cases leave the correctness suite: the two cases at scripts/guardrails.test.sh lines 1018 and 1023 ("both input shapes ... (limit 5s)") move to scripts/guardrails-timing.test.sh with the load-aware NOT RUN from N88; scripts/guardrails.test.sh shrinks and its pin in scripts/lint.test.mjs is lowered to the new count. Three independent runs saw that case red at 6 s and 9 s under load and green alone. The timing file's CI step runs it on the runner, where the load is low.
- [ ] N94. [TOUCH] The hook header agrees with the client matrix: guard-bash.sh line 9 says "Codex CLI runs the same plugin hook"; docs/CLIENTS.md and README say Codex runs no hooks shipped in a plugin (a team that configures its own Codex hook may point it at this script, and then every ask is a deny). Reword the header line and the Codex sentence in SKILL.md to that. No test; docs.test passes.

## Decisions

not yet written

## Checkpoints

### 2026-09-23T20:04:03.024Z

- **State:** N93 done: the two wall-clock cases moved from scripts/guardrails.test.sh to scripts/guardrails-timing.test.sh, which judges a time limit only when the one-minute load is at most four times the CPU count and reports NOT RUN with the load otherwise; pin lowered 1027 to 1015; CI step added
- **Evidence:** bash scripts/guardrails-timing.test.sh exit 0 (4 ok); a one-CPU copy printed NOT RUN for both limits and exit 0; bash scripts/guardrails.test.sh exit 0 (670 ok); node scripts/lint.test.mjs exit 0
- **Next:** N88, the 64 KB cap
- **Git:** lane/guard-review-2-0923b @ a3b5acd, 5 uncommitted

### 2026-09-23T20:07:41.588Z

- **State:** N88 done: a command text over 64 KB (CMD_MAX_BYTES) asks at once, naming its length, before any splitting and whatever it names; input over the cap skips the raw-text prefilter
- **Evidence:** bash scripts/guardrails-timing.test.sh exit 0 (16 ok, 3 MB forced push asks in about 0.3 s per run); the same file with --hook on the base hook exit 1 (6 FAIL); guardrails.test.sh exit 0 (670 ok); guardrails-bypass.test.sh exit 0 (224 ok, review 143 ok)
- **Next:** N89 in-place editors on a record
- **Git:** lane/guard-review-2-0923b @ 1764e01, 4 uncommitted

### 2026-09-23T20:34:18.303Z

- **State:** N89 done: sed -i (every spelling), perl -i/-pi, gawk -i inplace, ex, ed and sponge aimed at a record, CLAUDE.md or AGENTS.md deny with the record-protection reason; the same editors on other files and sed without -i stay allowed; editors added to the prefilter
- **Evidence:** bash scripts/guardrails-review2.test.sh exit 0 (30 ok); the same with --hook on the base hook exit 1 (16 FAIL); guardrails.test.sh exit 0 (670 ok); guardrails-bypass.test.sh exit 0 (it now runs review2); guardrails-timing.test.sh exit 0
- **Next:** N90 shells fed from a pipe, a decoder or a file
- **Git:** lane/guard-review-2-0923b @ d2728e3, 5 uncommitted

### 2026-09-23T20:38:17.314Z

- **State:** N90 done: a shell with no -c string reading from a pipe or its input, sh -s, a shell given a file that is not a committed unmodified script under scripts/, source, '.', eval of $( ) or a variable, xargs handing input to a shell, env -S and exec sh ask with a reason saying the guard cannot read what the shell will run; git | cat and | grep stay allowed
- **Evidence:** bash scripts/guardrails-review2.test.sh exit 0 (66 ok); guardrails.test.sh exit 0 (670 ok); guardrails-bypass.test.sh exit 0; guardrails-timing.test.sh exit 0 (16 ok)
- **Next:** N91 any write to the client settings file asks
- **Git:** lane/guard-review-2-0923b @ 33451e9, 4 uncommitted

### 2026-09-23T21:07:18.594Z

- **State:** N91 done: any write, copy over, move over or removal of .claude/settings.json or settings.local.json asks whatever it holds, under any path prefix and with protectRecords off; reads stay allowed; the two N70 negatives in guardrails-review.test.sh now expect ask
- **Evidence:** bash scripts/guardrails-review2.test.sh exit 0 (95 ok); guardrails.test.sh exit 0 (670 ok); guardrails-bypass.test.sh exit 0 (review 224 ok)
- **Next:** N92 globs that can match a record
- **Git:** lane/guard-review-2-0923b @ 4c98288, 5 uncommitted

## Handoff

- **State:** N91 done: any write, copy over, move over or removal of .claude/settings.json or settings.local.json asks whatever it holds, under any path prefix and with protectRecords off; reads stay allowed; the two N70 negatives in guardrails-review.test.sh now expect ask. Evidence: bash scripts/guardrails-review2.test.sh exit 0 (95 ok); guardrails.test.sh exit 0 (670 ok); guardrails-bypass.test.sh exit 0 (review 224 ok).
- **Next:** N92 globs that can match a record
- **Blocked:** nothing
- **Watch out:** nothing known
