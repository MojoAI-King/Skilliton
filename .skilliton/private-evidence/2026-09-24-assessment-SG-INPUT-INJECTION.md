# Assessment note: SG-INPUT-INJECTION

Kind: Reference. Evidence note for one security record, written 2026-09-24 by a build session, for the owner to countersign. Paths are repository-relative; runtime/ means packs/base/plugins/workflow/runtime/.

Control: Validate input and keep untrusted data out of queries and interpreters. Expected: the entry points that
accept untrusted input with the validation each applies, and tests of injection attempts against database queries and
against rendered or encoded output. Assessment recorded: gap.

## What is evidenced

- Arguments: runtime/lib/core.mjs parseArgs refuses a value given to a flag, a missing or empty value, a separate value
  starting with two hyphens, an option given twice and an unknown option.
- runtime/commands/usage.mjs checks the shape of --since before git is asked anything.
- Hook input: the guardrails hook (packs/base/plugins/guardrails/hooks/guard-bash.sh, CMD_MAX_BYTES) asks at once,
  unread, when a command text is over 64 KB; runtime/lib/session-hooks.mjs caps a prompt at 65536 characters.
- Records and catalogs: runtime/lib/security-io.mjs textFieldProblem refuses control and format characters and
  secret-shaped values; relativePath refuses unsafe paths. runtime/lib/security.mjs md() escapes Markdown characters
  in the generated report and findings.
- Tests: scripts/security-evidence.test.mjs "null identifiers and terminal control text are rejected in catalogs" and
  "secret-shaped input and parser errors never echo values"; scripts/security-record-refusals.test.mjs "note: every
  text-field rule is named, and the value is never echoed"; scripts/usage.test.mjs "--since is refused when it is not
  a revision, before git is asked anything"; scripts/guardrails-timing.test.sh "65537 bytes asks";
  scripts/guardrails.test.sh "a git command of 4000000 characters (over the 64 KB cap, asks unread)".

## What is missing

- No test puts Markdown, HTML or terminal escape text through md() or renderReport and checks it comes out escaped;
  core.mjs forDisplay only decodes bytes for the terminal and escapes nothing.
- There is no database, so the query clause does not apply; nothing in the repository says so yet.
- There is no single list of the entry points that accept untrusted input with the validation each applies; the list
  above was assembled for this note.
