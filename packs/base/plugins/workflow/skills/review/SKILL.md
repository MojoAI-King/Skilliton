---
name: review
description: Review the uncommitted changes in plain English for someone who is not a developer. Says what changed, flags what could break (deleted or weakened tests, config and environment files, migrations, dependencies, auth code, secret-looking files, very large files, debug leftovers), reports what was actually tested, and gives a verdict of READY TO COMMIT, NEEDS ATTENTION, or STOP. Use before committing or opening a pull request, or when the user asks "is this safe to commit", "what did we change", or "review my changes". It never commits.
---

# review: what changed, what could break, what was checked

Written for someone who is not a developer: plain words, grouped by purpose, and no diff pasted into the conversation. This skill reads and reports. It never stages, commits, pushes, or edits anything.

## 1. Get the shape first, cheaply

- `git status --short`
- `git diff --stat` (not staged) and `git diff --cached --stat` (staged: what the next commit will contain)
- `git diff --numstat` and `git diff --cached --numstat` for lines per file; a binary file shows `-`
- New files (`??`) have no diff: check a file's size with `wc -c` before reading it, and summarize a new folder instead of listing every file
- `git diff --check` and `git diff --cached --check` for leftover conflict markers and whitespace errors

If nothing changed, say so and stop.

## 2. Read only what you need

- One file's diff at a time: `git diff -- <file>` or `git diff --cached -- <file>`. Over about 300 changed lines, read it in parts or search it instead.
- **Never paste a diff, or a large part of one, into your reply.** Describe it.
- **Do not open lockfiles or generated files** (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `poetry.lock`, `uv.lock`, `Cargo.lock`, `Gemfile.lock`, `go.sum`, `composer.lock`, minified or bundled files, `dist/`, `build/`, source maps). Note that they changed, and whether their manifest (`package.json`, `pyproject.toml`, ...) changed with them.
- Search added lines instead of reading everything: `git diff -U0 | grep -E '^\+\+\+ |^\+.*(console\.log|debugger|TODO|FIXME)'` (and again with `--cached`); the `+++` lines show which file each hit is in. New files are not in that output, so search them directly.
- **Secret-looking content: never print the value.** Only line numbers may reach the conversation. Per changed file: `grep -niE 'BEGIN [A-Z ]*PRIVATE KEY|AKIA[0-9A-Z]{16}' <file> | cut -d: -f1`, and for a quoted value of 8 or more characters assigned to a key, secret, token, or password name: `grep -niE "(api[_-]?key|secret|token|passw(or)?d)[\"']?[[:space:]]*[:=][[:space:]]*[\"'][^\"'[:space:]]{8,}" <file> | cut -d: -f1`. Unquoted values (`.env` style) are caught by the file name instead.

## 3. Write the review in exactly these sections

### What changed
Plain language, grouped by purpose ("the sign-in page now checks the email format", "two new tests for that"), not file by file. When it matters, say which parts are staged and which are not. Lockfiles and generated files get one line.

### What could break
One bullet per risk, naming the file:
- **Tests deleted or weakened:** a test file removed, checks removed, tests switched off (`.skip`, `xit`, `@pytest.mark.skip`, `t.Skip`), or expected values edited to match new output.
- **Config or environment files:** `.env*`, `*.config.*`, `settings*.json`, Docker files, CI workflows, deploy files.
- **Database migrations:** `migrations/`, `*.sql`, schema files; say whether the change can be undone.
- **Dependency changes:** packages added, removed, or upgraded; a lockfile changed without its manifest, or the reverse.
- **Auth or permission code:** sign-in, sessions, tokens, roles, permissions, access checks, CORS.
- **Files that look like secrets:** `.env`, `*.pem`, `*.key`, `id_rsa*`, `credentials*`, or a secret-looking line (file and line number only).
- **Very large files:** over about 1 MB, or thousands of added lines in one file.
- **Debug leftovers:** `console.log`, debugging `print(`, `debugger`, `TODO`, `FIXME` on or near changed lines.
- **Conflict markers or whitespace errors** reported by `git diff --check`.

If none apply, write "Nothing flagged."

### What was checked
Only what ran **in this session**, with its real result, for example "`npm test`: 42 passed, 0 failed, after the last edit". If nothing ran, write **not tested**. Never claim a pass you did not see; a run from before the last edit does not cover the current changes.

Find the project's test command: `package.json` scripts (`test`, `lint`, `typecheck`), a `Makefile` (`test`, `check`), `pyproject.toml` or `pytest.ini` (`pytest`), `go.mod` (`go test ./...`), `Cargo.toml` (`cargo test`), or what `README.md`, `CLAUDE.md`, or `AGENTS.md` say. Name it and offer to run it. If there is none, say so.

### Verdict
The section's first line is exactly one of `**STOP**`, `**NEEDS ATTENTION**`, or `**READY TO COMMIT**`, then a colon and the reason in one sentence. Nothing else in the review is written in that bold form.
- **STOP** (then the list): committing now could do harm that is hard to undo. A secret-looking file or value; conflict markers; tests seen failing in this session; tests deleted, switched off, or weakened without a reason the user agreed to.
- **NEEDS ATTENTION** (then the list): anything else flagged above, or **any change that can affect how the code behaves and was not tested after the last edit**.
- **READY TO COMMIT**: nothing flagged, and one of these is true, stated as the reason: the tests ran in this session after the last change and passed; or the change cannot affect behavior (only comments, documentation, or whitespace), which you checked in the diff rather than assumed.

## 4. Offer the next step

Ask one question that fits the verdict: run the tests (name the command), write the commit message, or fix the flagged items (name them). **Never commit, stage, or push on your own**; the user decides.
