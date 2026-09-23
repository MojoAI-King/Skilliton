# The whole-history audit reads committed HEAD, so it runs after the commit and before the push

Kind: Living. Lesson entry.

- **ID:** 2026-09-23-the-whole-history-audit-reads-committed-455c
- **Status:** accepted
- **Date:** 2026-09-23

## What broke

CI failed on a7bc8f6 at "The audit over every file this repository has ever changed", although the same audit had passed locally moments before the push.

## The mechanism

`skilliton audit --range <root>..HEAD` reads each file at the range's head commit, never the working tree. The local run happened before the commit, so the line it later flagged (packs/base/plugins/guardrails/hooks/guard-bash.sh:541, a question that names the flag it compares with, matching the verification-off rule) was not in HEAD yet.

## The fix

e8e156e added the inline marker `# skilliton-audit: allow verification-off <reason>` on that line. The order of the last step is now commit, audit, push.

## The rule

After `git commit`, run `node scripts/skilliton.mjs audit --range "$(git rev-list --max-parents=0 HEAD)"..HEAD` and read its exit status on its own line before `git push`. An audit run before the commit describes a tree nobody pushed.

## What now enforces it

CI runs the same audit on every push (.github/workflows/checks.yml). Locally nothing forces the order yet: `skilliton audit install --pre-push` writes a hook that reports on the range being pushed (it never blocks). Nothing else yet.

