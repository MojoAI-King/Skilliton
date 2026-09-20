# The client event behind each of the three working routines

Kind: Living. Decision entry.

- **ID:** 2026-09-20-the-client-event-behind-each-of-the-thre-f6c2
- **Status:** accepted
- **Date:** 2026-09-20

## Decision

The three routines of area 01 batch 04 run on these client events. Each line names the event, where it is confirmed,
and what this repository does with it.

**1. The dispatch suggestion: `UserPromptSubmit`.** The Claude Code hooks reference (read 2026-09-20 at
`https://code.claude.com/docs/en/hooks`, which is where `docs.claude.com/en/docs/claude-code/hooks` now redirects)
defines the event as firing "When you submit a prompt, before Claude processes it". Its input carries the field
`user_prompt`, "the user's input text". For output it says of exit code 0 that "Claude Code adds plain-text stdout as
context that Claude can see and act on", and it gives the structured field `additionalContext`, "Text to add as
context to Claude before processing the prompt". `skilliton hook user-prompt-submit` prints the structured form, so
the note is labelled with the event it belongs to rather than arriving as loose text. The reference also says exit
code 2 "Blocks prompt processing and erases the prompt": this hook never exits 2 and never sets `updatedInput`, so it
cannot lose or rewrite what the person typed.

**2. The compaction snapshot: `PreCompact` plus `SessionStart` with source `compact`.** The reference defines
PreCompact as firing "Before context compaction" and lists the SessionStart sources as `startup`, `resume`, `clear`,
`compact`, `fork`. Both were already wired in the workflow plugin's `hooks/hooks.json`, and both have been seen
running here, not only read about: see Evidence.

**3. The after-merge maintain suggestion: the existing `Stop` hook, one more rule.** No new event and no new hook.
A merge commit moves HEAD, HEAD is part of the journal fingerprint (`fingerprintOf` in `runtime/lib/journal.mjs`
hashes HEAD together with the porcelain status), so a batch landing on the integration branch already changes the
state the Stop reminder measures, even when the working tree is clean. `mergesSince` counts merge commits between the
baseline event's commit and HEAD, and `stopReason` adds one sentence naming `/workflow:maintain` when it finds any.

## Why

Each routine was matched to the event that already carries the fact it needs, rather than to a new mechanism.

The dispatch suggestion has to be given before work starts, which is what UserPromptSubmit is for: any later event
would be advice arriving after the code was written. It is advice and never a block, because the counting rule is
structural (a numbered line, a bulleted line, or a sentence opening with an imperative verb) and a structural rule
will sometimes be wrong. The cost of a wrong count is then one sentence the session can argue with, never a prompt
that was erased.

The after-merge suggestion is a rule inside the Stop hook because that is where the fingerprint comparison already
lives, and because the alternative would put a file in the user's `.git/hooks` or in their git configuration. Nothing
Skilliton installs should write there: a git hook is invisible in the plugin's own records, survives uninstalling the
plugin, and would run for every person and every tool sharing that checkout, not only for the session that asked for
it. The owner chose this on 2026-09-20 when the routine was scoped.

## Alternatives rejected

- **A git `post-merge` hook for routine 3.** Rejected as above: it writes outside the plugin, it outlives the plugin,
  and it fires for everyone using the checkout. The Stop rule fires for the session that did the merging.
- **Plain stdout instead of `additionalContext` for routine 1.** The reference documents both. The structured form
  names the event it answers, which is what the Stop hook already does with its own JSON, so the two hooks read the
  same way in a transcript.
- **Counting every sentence as an item for routine 1.** Six sentences of explanation are the common prompt; six
  sentences of orders are not. A verb list is a real limit, stated in `runtime/lib/session-hooks.mjs`, and it is the
  right limit for advice that can never block.
- **A separate `dispatch-suggest` command or hook file.** The event belongs to the same `skilliton hook` command as
  the other four, so one entry point keeps the input parsing, the failure posture and the exit contract in one place.

## Risk

The counting rule can miss an item whose verb is not in the list, and can count an instruction sentence that was not
a separate piece of work. A miss costs a suggestion that was not given; a false count costs a sentence of advice. The
hook adds a note on a path that runs on every prompt, so its cost is paid every time: it counts first and only
touches Git and the configuration when the count is at least one, and the hooks.json timeout is 10 seconds rather
than the 15 the other hooks use.

Whether Claude Code delivers UserPromptSubmit to a plugin hook in a real session has not been seen here yet. The
event, its input field and its output fields are documented as quoted above, and the hook's own side is proved by
fixture tests, but the delivery is unverified until the live sighting named in the report card's owner pass.

## Reversibility

Remove the `UserPromptSubmit` block from `packs/base/plugins/workflow/hooks/hooks.json` and the routine stops, with
no state to unwind: the hook writes only its own journal line. The Stop rule is reverted by dropping the `merges`
argument in `commands/hook.mjs`; the reminder then says nothing about merges and behaves exactly as before.

## Evidence

- The hooks reference, read 2026-09-20, for the UserPromptSubmit lines quoted above, the PreCompact line, and the
  SessionStart source list.
- Routine 2 seen running: rehearsal L6 on Claude Code 2.1.276, filed at
  [evidence/rehearsals/2026-09-19-live-clients-run-4/SUMMARY.md](../../evidence/rehearsals/2026-09-19-live-clients-run-4/SUMMARY.md).
  A session compacted on its own, the PreCompact hook ran with trigger `auto`, a SessionStart with source `compact`
  followed it in the same session, its response in the stream carried the Project state, and the model went on
  reading. Headless only: the same path in an interactive session is unverified ([docs/CLIENTS.md](../CLIENTS.md)).
- Routine 1 and routine 3 proved on this side by fixture tests in `scripts/lifecycle.test.mjs`: the counting table,
  the threshold read from `dispatch.minItemsForLanes`, the journal record, silence outside a project, the merge
  sentence, the ordinary commit that is not a batch, and the window the merge check could not read. Each of those
  rules has a mutation check that breaks it deliberately and shows the assertion failing.
