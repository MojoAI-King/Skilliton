# Assessment note: SG-SECURITY-LOGGING

Kind: Reference. Evidence note for one security record, written 2026-09-24 by a build session, for the owner to countersign. Paths are repository-relative; runtime/ means packs/base/plugins/workflow/runtime/.

Control: Log security events well enough to investigate them. Expected: the list of security events the application
logs, where the logs are kept and who can read them, and sample entries for sign-in and denied-access events with
sensitive values masked or left out. Assessment recorded: gap.

## What exists

- The journal, runtime/lib/journal.mjs: one JSON line per event in the git folder of each clone (skilliton/journal.jsonl,
  never committed), written with the default file mode. JOURNAL_EVENTS holds only lifecycle events (session-start,
  session-end, pre-compact, stop, checkpoint, the reminders, maintain); text fields are cut to 200 characters.
  scripts/lifecycle.test.mjs "the journal survives corrupt lines, and lastEvents counts them".
- The guardrails hook (packs/base/plugins/guardrails/hooks/guard-bash.sh, emit_decision) prints each deny or ask
  decision to the client and keeps no record of it; scripts/guardrails.test.sh checks that the printed reason never
  holds a secret ("reason does not contain the secret value" and related cases).
- The delivery gate's rejection (runtime/lib/delivery.mjs reject) is shown to the person pushing and stored nowhere.

## What is missing

- No list of logged security events, of where they are kept, or of who can read them.
- Denied-access events (guardrail blocks and holds, gate rejections) are not logged, so there are no sample entries.
- There is no sign-in, so that clause does not apply; nothing in the repository says so yet.
