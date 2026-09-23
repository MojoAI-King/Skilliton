# A record's header line is one templated string, not a hardcoded Kind: prefix

Kind: Living. Decision entry.

- **ID:** 2026-09-23-a-record-s-header-line-is-one-templated-7207
- **Status:** proposed
- **Date:** 2026-09-23

## Decision

Every record this runtime writes still opens with a line like `Kind: Living.`, but the text is no longer the literal
string `"Kind: "` baked into each writer. `.skilliton/config.json` can set `prepare.recordHeader`, a one-line, control
character free string of at most 200 characters that contains the token `{kind}` (default `"Kind: {kind}"`). One
helper, `formatRecordHeader(header, kindText)` in `lib/config.mjs`, substitutes the kind sentence into that template;
every writer (task records, decisions, lessons, status, backlog, handoff and their archives, the security and records
READMEs, the dispatch lane brief, the propose command's proposal header) calls it with `project.recordHeader` (or the
default when no project is in hand, as in `commands/propose.mjs` writing into a possibly unconfigured target repo).
The one reader that has to recognize the header line without knowing its kind text (`lib/handoff.mjs`
`prependArchive`, finding where a handoff archive's own header ends) takes a `headerPrefix` derived from
`recordHeaderPrefix(header)`, the fixed text before `{kind}`, instead of matching the literal word `Kind`.

## Why

A prepared project's records are meant to read as this project's own convention, not Skilliton's signature; some
teams keep a house style (for example `>` blockquote lines, or a different label word) and previously had no way to
apply it without hand-editing every generated file after the fact and then keeping that edit in sync by hand.

## Alternatives rejected

Post-processing every generated file's first content line after prepare wrote it: this only covers files a project
regenerates once, not entries created continuously by `task start` and `record decision`/`record lesson`, and it
would silently stop matching a differently-worded header the moment `doc()`'s wording changed.

A separate configuration key per writer (one for tasks, one for decisions, one for the status record, and so on):
rejected as needless surface area for one line that is the same shape everywhere; a single template with one
substitution token keeps one thing to validate and one thing to document.

## Risk

Low. The default template renders byte-identical to the fixed string this runtime always wrote (a test asserts it),
so an unconfigured project is unaffected. A project that configures an unusual header (for example one with no
visible `Kind`-like word at all) makes its own records harder for a human skimming many projects to recognize by eye,
but that is the same tradeoff as any other house style choice, and the runtime itself still reads its own records
correctly either way.

## Reversibility

Fully reversible: removing `prepare.recordHeader` from a project's configuration reverts every future write to the
default `"Kind: {kind}"` immediately, and it does not rewrite records already on disk (nothing here is a migration).

## Evidence

`scripts/record-header.test.mjs` (new): config validation (must contain `{kind}`, one line, no control characters, at
most 200 characters), `formatRecordHeader`/`recordHeaderPrefix` unit behavior, every `project-files.mjs` template
compared byte-for-byte against its default rendering with only the header line differing, and an end-to-end run of
`prepare`, `task start`, `record decision` and `record lesson` in a project configured with `"> {kind}"`, showing the
line on every scaffolded record and every new entry, and the unconfigured case byte-identical to before.
