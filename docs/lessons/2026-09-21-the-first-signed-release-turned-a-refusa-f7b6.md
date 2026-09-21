# The first signed release turned a refusal about the machine into one about the tag

Kind: Living. Lesson entry.

- **ID:** 2026-09-21-the-first-signed-release-turned-a-refusa-f7b6
- **Status:** accepted
- **Date:** 2026-09-21

## What broke

Minutes after release 0.9.0 was signed and pushed, CI went red on two commits in a row at step 49, `scripts/rename.test.mjs`: "join refuses a machine set up for the company under the earlier name, and changes nothing" expected the earlier-name refusal and got "the newest release ... 0.9.0, is not approved: it is signed by a key the trust file does not list". The verify fix in the second commit had nothing to do with it; the first commit, which only added the manifest, failed the same way.

## The mechanism

That test uses this repository itself as the skills repository and a throwaway signers file. Until this evening the repository had no release tag, so `join` found nothing to pin and went on to `planJoin`, where `refuseLegacySetup` raised the refusal the test expects. The moment a real signed tag existed, `planPin` ran first (it is deliberately decided before anything is written), found a newest release the throwaway signers cannot approve, and refused for that reason. Two refusals competed and the order decided which one a person saw: a fact about this machine (a receipt under the earlier name) was reported as a fact about the clone. The test was right to fail; the order was wrong.

## The fix

`runtime/commands/join.mjs` calls `validateCompany` and `refuseLegacySetup` (now exported from `runtime/lib/join.mjs`, no line added to that pinned file) before it reads the pin state. Only that one machine check moves; the rest of `planJoin` stays after the pin, because the first attempt to hoist the whole plan broke the release test whose fixture is a minimal skills repository with no templates. Workflow plugin 0.15.2.

## The rule

When two refusals can both be true, the one about the machine the person is sitting at comes before the one about the repository, and a test that pins that order is kept. A fixture that is the real repository changes whenever the repository does; the day the repository gains a first of anything (a tag, a release, a policy) is the day such a test finds out.

## What now enforces it

`scripts/rename.test.mjs` test 9, which now runs against a repository that has a signed release it cannot approve and still expects the earlier-name refusal, and `scripts/release.test.mjs` "join: the install path refuses an unsigned or moved release before it touches a client", which keeps the pin ahead of every client write. Both are CI steps.
