# New-builder rehearsal (M5)

Kind: Living. The protocol for PLAN.md milestone M5: a real person who has not used Skilliton follows the documentation to prepare a project, build, review, resume after an interruption, receive an approved update and recover from a blocked change, while a facilitator measures what happened. An assistant role-playing a beginner does not count; this milestone stays open until a person has done it.

## Who takes part

- **The builder:** someone who has never used Skilliton. The rehearsal is most informative with a person who does not write code for a living, and still valid with a junior developer; record which. Refer to them only as a participant label (P1, P2) in anything committed to this public repository.
- **The facilitator:** prepares the environment, reads the steps aloud, and records measurements. The facilitator does not coach. When the builder is stuck for more than five minutes, or asks for help, the facilitator helps and records the intervention word for word.
- **A reviewer:** reviews the builder's finished change afterwards and records how long the review took and what it found.

## What the facilitator prepares

1. A machine account where Claude Code is installed and logged in, with Node.js 18 or later and git. The builder uses their normal terminal or editor.
2. A practice company skills repository: a clone of this repository with a release signed by a practice key (see docs/RELEASING.md once it exists; until then the release rehearsal script shows the commands), and the practice trust file.
3. A small practice application repository with a working test command, a delivery policy (`.skillgate/delivery.json`), and a shared bare repository with the delivery gate installed, so pushes to `main` are checked.
4. A one-page task card for the builder in plain language, for example: "People should be able to mark a to-do item as done, and done items should show with a strike-through. Keep the existing tests passing." Write the acceptance criteria the facilitator will score against before the session, and do not show them to the builder.
5. A timer and the observation sheet below.

## The steps (read aloud, one at a time)

1. **Join.** "Follow the README to get the company's tools and open the practice project." (Expected: marketplace added, plugins installed, `skillgate doctor` and `skillgate status` read.)
2. **Prepare.** "The project should be set up the way the company works. Ask the assistant to do that." (Expected: `skillgate prepare` previewed and applied, harness instructions present.)
3. **Describe the work.** Hand over the task card. "Ask the assistant for this in your own words."
4. **Build.** Let the builder work with the assistant until they believe the task is done.
5. **Interruption.** At a moment the facilitator chooses mid-build, close the assistant session without warning. "Start a new session and carry on."
6. **Review and submit.** "Get the change ready to share and push it to the shared repository."
7. **A blocked change.** The facilitator has prepared a second small change that passes on its own but breaks the tests once combined with the builder's work. "Push this change too." (Expected: the delivery gate rejects it; the builder understands why and recovers.)
8. **Receive an update.** The facilitator publishes an approved release with one improved skill and a project migration. "The company says there is an update. Get it."
9. **Recover.** "Something looks wrong with your tools." (The facilitator has changed one byte in an installed plugin file.) Expected: `skillgate verify` reports TAMPERED and the builder reinstalls.

## Observation sheet (one row per step)

| Step | Minutes | Interventions (count, and each one word for word) | Errors or wrong turns | Requirement misses (against the hidden acceptance criteria) | Did the assistant's account match reality? | Builder confidence 1 to 5 |
|---|---|---|---|---|---|---|

After the session also record:

- **Restart accuracy:** after step 5, what the new session said about where things stood, compared with the actual files, branch and last checkpoint.
- **Reviewer effort:** minutes the reviewer spent, what they had to ask the builder, and what they found that the review summary missed.
- **Integration repairs:** fixes needed before the change could merge.
- **Enforced versus instructed:** which behaviors happened because a hook ran and which because the assistant followed instructions; anything instructed that did not happen.
- **Client and versions:** Claude Code version, plugin versions (`skillgate verify` output), operating system.

## Recording the result

Write the sanitized observation sheet and notes to `evidence/rehearsals/<date>-new-builder/`: participant labels only, no names, no screenshots with personal details, no private repository content. Update PLAN.md M5 with what was measured, and DECISIONS.md with anything the session showed should change. A rehearsal with many interventions is a successful measurement, not a failed milestone; the milestone closes when the measurements exist and the owner has reviewed them.
