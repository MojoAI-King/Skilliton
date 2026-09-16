# context-hygiene: how we work here

Kind: Living. First draft, Day 1; not yet walked by a second person.

Pack `context-hygiene`, part of Skillgate, from `https://github.com/MojoAI-King/Skilliton`. Author MojoAI, license MIT.
The same facts are written twice: Part 1 for your first week (plain language), Part 2 for the person maintaining this (paths and commands).

---

## Part 1: For your first week

### 1. What this pack does, in one sentence

It gives your AI coding assistant (Claude Code) a short, focused checklist at the start of each session and a few good working habits, and, after one extra setup step, shows you how much of your usage allowance you have spent.

### 2. What changes on your machine the moment you install it

There are two separate steps, on purpose.

- **Installing the pack** adds exactly two things: a set of written instructions the assistant can follow (called a "skill"), and a small script that runs when a session starts and hands the assistant one checklist section. That is all. Installing cannot change your personal settings.
- **The setup step** (run separately, by you) changes one setting: the information bar at the bottom of the Claude Code screen. It shows you the change before doing anything, saves a copy of your settings before writing, and can put that copy back. If you already have your own bar, it replaces it for now; a way to keep both is planned, not built.
- **The checklist** comes from a notes file your team points it at, using a setting your maintainer will show you how to set. If the file or the section cannot be found, the session start says so plainly instead of staying quiet.

> **Warning:** if you already have your own start-of-session script that loads the same checklist, installing this pack loads it twice. Turn one of them off.

### 3. What you'll notice day to day

- **The bottom bar** shows `5h` and `7d`: how much of your five-hour and seven-day allowance you have used. If Claude Code does not send those numbers, the bar says `quota: not in payload` instead of pretending it is zero. A private log of these readings is kept on your machine.
- **One limit the bar cannot see:** the per-model weekly limit shown when you type `/usage`. Check it there and write it down.
- **`HANDOFF?`** appears when the conversation is 60% full or more. That is your cue: finish the step you are on, write a short handoff note, and start fresh.
- **Session starts carry only the checklist section.** An earlier version loaded far more of the notes file than intended; this pack ships the fixed version.
- **Test output kept out of the conversation:** a tool for this exists but is not switched on yet. It is planned.

### 4. What you're still responsible for

These are habits, not guarantees. Nothing in the pack enforces them.

| Habit | In practice |
|---|---|
| End finished work with a handoff | Write what was done, what is next, and which files. Start fresh later, rather than leaving a big conversation idle for hours and coming back to it. |
| Never open a huge file whole | Search it, or look at a part of it. |
| Batch independent checks | Run several unrelated checks together in one go. |
| Use helper agents sparingly | Helper agents (subagents) cost real money. Use them only for a bounded job that can run on its own and report back a conclusion. |

### 5. Who to ask, and how to propose a change

Ask whoever maintains this pack on your team; Part 2 is written for them. To change the pack, open a pull request on the repository. Before it is merged it has to pass a safety check (no private names, no stray formatting, no personal file paths) and the tests. Pinning each release to an exact, unchangeable version is planned, not built.

### 6. Why not build this yourself?

You can. This exists so you do not start from zero. It came out of a real investigation into where an AI coding budget actually went, including a counting mistake the investigation caught in itself and corrected. The first fix it ships (a session-start script that loaded far more than it should, now bounded to the section it is meant to load) is the part that was measured most carefully. Forking it and making it yours is the intended path, not a fallback.

---

## Part 2: For the person maintaining this

Verification status of this page: the facts below were checked against the code and against today's shared build contract. The install commands and the setup round trip have not yet been walked end to end from a fresh clone by a second person.

### 1. What this pack does, in one sentence

A Claude Code plugin (skill plus SessionStart hook) with a separate, reversible `scripts/setup.mjs` that sets the main-session status line to a quota logger, because a plugin cannot set that key itself.

### 2. What changes on your machine the moment you install it

```bash
git clone https://github.com/MojoAI-King/Skilliton && cd Skilliton
claude plugin marketplace add ./
claude plugin install context-hygiene@skillgate    # skill + SessionStart hook only
node scripts/setup.mjs                             # show the proposed change; writes nothing
node scripts/setup.mjs --apply                     # back up, then set statusLine
```

| What changes | Path | Done by | Source |
|---|---|---|---|
| Skill | `packs/context-hygiene/plugins/context-hygiene/skills/context-hygiene/SKILL.md` | plugin install | `.claude-plugin/plugin.json` |
| SessionStart hook | `hooks/session-start-checklist.sh`, registered in `hooks/hooks.json` | plugin install | `hooks/hooks.json` |
| `statusLine` key (only that key) | `~/.claude/settings.json`, command = absolute path to `hooks/statusline-quota.sh` inside your clone | `setup.mjs --apply` | `scripts/setup.mjs` |
| Settings backup | `~/.claude/backups/skillgate/<timestamp>/settings.json` | `setup.mjs --apply` | `scripts/setup.mjs` |
| Quota log and key-discovery log | `~/.claude/skillgate/usage-log.jsonl`, `~/.claude/skillgate/statusline-keys-seen.log` | status line, each refresh | `hooks/statusline-quota.sh` |

Behavior, with the file each claim comes from:

- **Plugin limits** (`scripts/setup.mjs` header; PLAN.md Section 3): a plugin's own `settings.json` supports only `agent` and `subagentStatusLine`, and a plugin-root `CLAUDE.md` is not loaded. So the main status line and project instructions cannot come from install.
- **`setup.mjs`** (`scripts/setup.mjs`): with no flag it prints current and proposed `statusLine` and writes nothing. `--apply` refuses to touch a `settings.json` that is not valid JSON, does nothing if already applied, otherwise backs up and writes `statusLine` while keeping every other key. If a different `statusLine` exists it prints a NOTE and **replaces** it; chaining is planned for Day 2, not built. `--undo` copies the most recent backup over `settings.json` byte for byte, which also discards any edits made to that file since `--apply`. If no `settings.json` existed before `--apply`, the backup is an empty file and `--undo` restores an empty file rather than deleting it (whether Claude Code accepts an empty settings file is unverified).
- **The status line runs from your clone**, independent of the plugin install (`scripts/setup.mjs` resolves the path from its own location). Move or delete the clone and the status line breaks; re-run `--apply` from the new location.
- **SessionStart hook** (`hooks/session-start-checklist.sh`): reads the file named by the environment variable `SKILLGATE_LESSONS`, which the developer sets before starting Claude Code. Heading comes from `SKILLGATE_CHECKLIST_HEADING` (default `The new-app wiring checklist`), matched as a line prefix after `## `. Output is that section only, up to the next `## ` heading. A missing file or missing heading prints a visible `[context-hygiene]` notice, not silence. How SessionStart output is surfaced to the model on your Claude Code version is marked unverified in the script: confirm in a fresh session.
- **Double injection:** if a developer already has a personal SessionStart hook injecting the same checklist, the pack injects it a second time. Disable one.

### 3. What you'll notice day to day

- **Status line** (`hooks/statusline-quota.sh`, requires `jq`): shows `5h` and `7d` from `rate_limits.five_hour` and `rate_limits.seven_day` when the payload carries them, and `quota: not in payload` when it does not. Absent values are logged as `null`, never `0`. Appends ` HANDOFF? finish the step, write a handoff` when `context_window.used_percentage` is 60 or more. The per-model weekly limit from `/usage` is not in the payload; record it by hand (for example in `docs/USAGE_BASELINE.md`).
- **Known gap, read from code, not yet tested:** without `jq`, the log write fails with its error suppressed and the display falls back to the not-in-payload text. That reads as "no quota data" when the real cause is a missing dependency.
- **Bounded session start:** the hook fix reduced an over-injected block to the intended section. Reproduce the before and after with `bash scripts/hook-fixture.test.sh`.
- **Gate wrapper, not wired into the pack yet (Day 2):** `node scripts/gate.mjs --lane <name> --cmd "<your verify command>"` runs the command, writes full stdout and stderr to `.gate/<lane>.log` (relative to the current directory, gitignored), prints one summary line, prints the last 40 lines on failure, and exits with the command's own status (`scripts/gate.mjs`). The default command is `npm run verify`; this repo has no `package.json`, so pass `--cmd` here.
- **Drift check, nothing runs it automatically yet** (`hooks/config-drift-check.sh`, requires `jq`): run `bash packs/context-hygiene/plugins/context-hygiene/hooks/config-drift-check.sh` by hand. It prints the `model` declared in `~/.claude/settings.json`, the model and version in the newest transcript under `~/.claude/projects`, and the CLI version. It prints `DRIFT` only for a model mismatch (versions are printed, not compared), and it prints `DRIFT` whenever `settings.json` has no `model` key, because `(unset)` never matches a real model name.

### 4. What you're still responsible for

Habits, not guarantees. The skill states them to the model (`skills/context-hygiene/SKILL.md`); no hook enforces them.

| Habit | SKILL.md section |
|---|---|
| End finished work with a short handoff rather than leaving a large context idle past the cache lifetime | "Idle gaps are the other main cache-write cost" |
| Never load a large file raw; grep it or read a slice (`sed -n`, `head`, `tail`) | "Large results are the main cache-write cost" |
| Batch independent shell checks | "Shell discipline" |
| Subagents for bounded fan-out only; they cost real money | "Subagents are real cost, not free workers" |

### 5. Who to ask, and how to propose a change

Open a pull request on `https://github.com/MojoAI-King/Skilliton`. Before merge a PR must pass:

```bash
bash scripts/scrub-check.sh --history   # names, dashes, home paths, across every commit
node scripts/token-cost.test.mjs        # meter fixture totals
bash scripts/hook-fixture.test.sh       # original vs repaired session-start awk
```

`scrub-check.sh` needs its denylist outside the repo (`$SKILLGATE_DENYLIST`, default `~/.config/skilliton/denylist`); without it the name scan does not run and the script exits 2 with `INCOMPLETE`, not `PASS`. There is no CI configuration in the repo today, so the author and reviewer run these by hand. Release pinning by commit SHA is planned for Day 3 (`releases/SCHEMA.md` describes the record; the tool that writes it is not built).

**Removal:**

```bash
node scripts/setup.mjs --undo
claude plugin uninstall context-hygiene@skillgate
```

The logs under `~/.claude/skillgate/` and the backups under `~/.claude/backups/skillgate/` stay on disk; delete them by hand if wanted.

### 6. Why not build this yourself?

You can. This exists so you do not start from zero, and forking is the intended path. What you get that is checkable rather than taken on trust: the bounded hook with a side-by-side fixture test, and a usage meter (`scripts/token-cost.mjs`) with a fixture test of hand-computed totals, written after the originating investigation caught its own accounting error. Reproducing a real usage window with the meter is still open (`DECISIONS.md`, item O2), so this page makes no savings claim. When you fork, change the marketplace and author fields, the default checklist heading, and your own denylist.
