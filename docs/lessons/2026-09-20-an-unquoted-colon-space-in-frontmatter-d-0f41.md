# An unquoted colon-space in frontmatter drops the whole block

Kind: Living. Lesson entry.

- **ID:** 2026-09-20-an-unquoted-colon-space-in-frontmatter-d-0f41
- **Status:** accepted
- **Date:** 2026-09-20

## What broke

`packs/base/plugins/workflow/agents/verify-item.md`, one of the three agents shipped in the workflow plugin, would have loaded with no metadata at all: no `model`, no `effort`, no `maxTurns`, no tool list, not even the description that decides when the agent is chosen. The file looked correct on screen. The packaging test passed it. Nothing in the repository reported a problem.

`claude plugin validate packs/base/plugins/workflow` caught it, and said what would happen: "Nested mappings are not allowed in compact mappings at line 2, column 14 ... At runtime this agent loads with empty metadata, all frontmatter fields silently dropped."

## The mechanism

The description read:

```
description: Check one item from a pile of notes against the code ... and return one verdict: already shipped, conflicts with a recorded decision, real and buildable, or cannot tell.
```

An unquoted YAML scalar cannot contain a colon followed by a space. The parser reaches `verdict: already` and reads it as the start of a nested mapping inside the compact mapping it is already in, which YAML does not allow. The document fails to parse, and the loader treats a frontmatter block that did not parse as no frontmatter, rather than as an error worth stopping for.

The reason the packaging test missed it is worth keeping separately: the test read frontmatter by splitting each line on its first colon. That is not a YAML parser, and on this line it produced a perfectly reasonable `description` key with a long value. **A parser that is more forgiving than the real one hides exactly the bugs it is there to find.**

## The fix

Double-quote the value: `description: "Check one item ... and return one verdict: already shipped, ..."`, at `packs/base/plugins/workflow/agents/verify-item.md` line 3. A quoted scalar may contain colons freely.

Then the check, in the shared `frontmatter(text, label)` reader in `scripts/packs.test.mjs`: any value that is not quoted and contains `": "` fails the test, with a message that says why ("YAML reads it as a nested mapping and the whole frontmatter is dropped; wrap the value in double quotes"). A scan of every shipped skill and agent found no other instance.

## The rule

1. A frontmatter value containing a colon followed by a space is double-quoted. This holds for skills and agents alike, and descriptions are where it bites, because a description is the one field written as a sentence.
2. Run `claude plugin validate <plugin folder>` after changing any shipped frontmatter. Note that `--strict` is not a flag on every version; plain `validate` is. It is the only tool here that reads the file the way the client does.
3. When a hand-rolled parser stands in for a real one in a test, it must be stricter than the real one, never more forgiving.

## What now enforces it

`scripts/packs.test.mjs`, in the frontmatter reader used by both the skills loop and the agents loop, with the self-test case "unquoted colon in a description" proving the check can fail. CI runs both the test and `claude plugin validate`.
