# A hook that runs on every prompt cannot say it is unavailable

Kind: Living. Lesson entry.

- **ID:** 2026-09-20-a-hook-that-runs-on-every-prompt-cannot-8958
- **Status:** accepted
- **Date:** 2026-09-20

## What broke

A pinned test did, which is how the question surfaced. The lifecycle suite has a case reading "outside a git
repository every hook prints one line and exits 0", and it used `user-prompt-submit` as its example of an *unknown*
event while pinning the exact four-event message the command prints. Adding the real event made both halves of that
test wrong at once, and reading why made the design problem visible: the new hook was about to reuse `locate()`, the
helper the other four hooks share, which prints `[workflow] Skilliton project state is unavailable: ...` on stdout.

## The mechanism

Stdout from a hook that exits 0 is added to the conversation; stderr from the same hook reaches only the debug log.
For a hook that runs once per session that trade is right, because the one line is how a person learns the project
state was not read. For a hook that runs on **every prompt** it is the opposite: a person working in a folder that is
not a Git repository would have that same sentence injected into context on every turn for the whole session, paid
for every time, saying nothing new after the first.

## The fix

`locateQuietly` in [packs/base/plugins/workflow/runtime/commands/hook.mjs](../../packs/base/plugins/workflow/runtime/commands/hook.mjs),
used only by `user-prompt-submit`: same walk to the Git top level, nothing on stdout, and an unexpected failure
reported on stderr and then allowed. The hook also counts the prompt's items before it touches Git or the
configuration at all, so the common prompt costs one pass over a string. The help text says the difference out loud:
every hook prints one line outside a repository "except user-prompt-submit, which runs on every prompt and so says
nothing at all".

## The rule

Before a hook is registered, ask how often its event fires, and treat anything on a per-prompt or per-tool-call event
as a cost paid every turn. On those events, nothing reaches stdout unless it is the note the hook exists to give.
Reusing the helper the session-level hooks share is exactly the wrong move, because its whole job is to be visible.

## What now enforces it

Two fixture tests in `scripts/lifecycle.test.mjs`: one asserts the hook writes nothing at all outside a project, and
the "outside a git repository" case keeps its pinned list of events, which is what forced the new event to be
declared rather than slipped in. `scripts/lifecycle.test.mjs` also pins the sorted event keys of
`packs/base/plugins/workflow/hooks/hooks.json`, so a hook cannot be registered without a test saying it is real.
