# A refusal that names one missing flag at a time, on a machine that had already joined

Kind: Living. Lesson entry.

- **ID:** 2026-09-21-a-refusal-that-names-one-missing-flag-at-0eb8
- **Status:** accepted
- **Date:** 2026-09-21

## What broke

The owner asked how to enable Skilliton in a repository, was told `skilliton join --apply` then `skilliton prepare`, and hit two refusals in a row: first "join needs --company", then, after guessing a company name, "join needs --signers". The Mac had already joined as `mojoai` (`~/.config/skilliton/joined/mojoai.json`), and nothing said so. The guessed name was a different company, so the next step would have started a second setup beside the first. Run afterwards in preview, `join --company mojoai` on that machine still did not say it had joined; it refused on the release pin instead, for two uncommitted record files in the clone.

## The mechanism

`run` checked `--company` and `join` checked `--signers`, each with its own `refuse`, so a person saw one missing thing per attempt and never the shape of the whole command. Neither path read the join folder, so the one fact that would have ended the exercise ("this machine already joined") was never on the screen. Enabling Skilliton in a repository is `prepare`, and a machine joins once; the command that was being retried was the wrong command, and every message it gave was locally true.

## The fix

`runtime/commands/join.mjs`: every missing flag is named in one refusal, with where each comes from and a pointer to docs/ONBOARDING.md step 1 and docs/RELEASING.md; the refusal and the run both name the companies whose receipts are in the join folder, say that a project is set up with `prepare --dir <project>`, say when a run repeats an existing join, and warn before a second company. `join --undo` keeps its own check. README.md opens with the two roles and the two commands. Workflow plugin 0.15.4.

## The rule

A refusal names everything that is missing, not the first thing found, and says where each comes from. A command that is run once per machine says so when it has already been run, before it says anything else. When the likely mistake is running the wrong command, the refusal names the right one.

## What now enforces it

`scripts/join.test.mjs`: "join names every missing flag at once, says what this machine already joined, and warns before a second company", which runs `join` bare, after a real join, for the same company and for a second one, and asserts each message. Nothing sweeps the other commands for one-flag-at-a-time refusals; that is a hand check per command, the same limit B47 records for `--apply`.
