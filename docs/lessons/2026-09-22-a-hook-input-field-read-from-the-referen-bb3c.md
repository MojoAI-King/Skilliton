# A hook input field read from the reference and never captured live made a feature that never fired

Kind: Living. Lesson entry.

- **ID:** 2026-09-22-a-hook-input-field-read-from-the-referen-bb3c
- **Status:** accepted
- **Date:** 2026-09-22

## What broke

The dispatch note, shipped on 2026-09-20 and covered by fixture tests, never appeared in a real session. A headless run with six numbered chores left no `dispatch-suggested` event in the journal.

## The mechanism

`parseHookInput` in `runtime/lib/session-hooks.mjs` read the prompt from `user_prompt`, the field name the hooks reference gave when it was read. Claude Code 2.1.278 sends it as `prompt`. With the field absent, the hook took its "no prompt text" path, which is silent by design because the hook runs on every prompt. Every fixture test built its input with the same wrong name, so the tests agreed with the code and not with the client. Decision O27 had named the open question as whether a plugin hook receives the event at all. The event was always delivered; the input shape was never checked.

## The fix

workflow 0.20.0 reads `prompt`, then `user_prompt` (`parseHookInput`). The test helper `promptHook` in `scripts/lifecycle.test.mjs` sends `prompt`, and one case keeps `user_prompt` working. The measurement is a temporary project hook in a fixture whose command saves its own stdin, `cat > <file>`.

## The rule

Before a hook's input is trusted, capture one real input from the client and build the fixtures from that capture, not from the reference's prose. A hook that is silent when a field is missing needs a live sighting of its positive case before it counts as shipped.

## What now enforces it

The live note `evidence/live/2026-09-22-dispatch-automation-live.md` and the client matrix row now say measured, with the field name. Nothing checks the other hooks' inputs against a live capture automatically; the session-start, stop, pre-compact and session-end inputs were each seen working live earlier, which is weaker than a capture of their fields.
