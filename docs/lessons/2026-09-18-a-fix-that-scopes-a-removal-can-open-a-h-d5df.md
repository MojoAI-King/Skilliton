# A fix that scopes a removal can open a hole the removal was closing

Kind: Living. Lesson entry.

- **ID:** 2026-09-18-a-fix-that-scopes-a-removal-can-open-a-h-d5df
- **Status:** accepted
- **Date:** 2026-09-18

## What broke

A review found that taking `GIT_CONFIG_NOSYSTEM` and every `GIT_TRACE*` out of every git call had broken the
isolation that every test in this repository relies on: each test sets `GIT_CONFIG_NOSYSTEM=1` to keep the machine's
own system configuration out of what it measures, and the runtime under test was now ignoring it. The fix was to
scope all seven variables to the one call that reaches a network. The next review round showed what that let back
in: `GIT_TRACE=<path>` makes git create that file and append to it, on every local call, and on Windows
`GIT_REDIRECT_STDOUT` closes or redirects git's own handles, so every Skilliton command reported a working
repository as unreadable.

## The mechanism

The two variables had been put in one list because they were found together, not because they do the same thing.
`GIT_CONFIG_NOSYSTEM` changes which configuration file is read, which matters only where the machine's own
configuration is part of the answer. The others write a file or move a stream, which matters everywhere. Scoping the
list to the call where the first one mattered carried the other six along with it.

## The fix

`CONFIG_FOR_A_NETWORK_CALL` in `packs/base/plugins/workflow/runtime/lib/journal.mjs` holds two names and no more:
`GIT_CONFIG_NOSYSTEM` and `GIT_ATTR_NOSYSTEM`. `GIT_CURL_VERBOSE`, `GIT_REDIRECT_STDIN`, `GIT_REDIRECT_STDERR`,
`GIT_REDIRECT_STDOUT` and anything matching `/^GIT_TR(ACE|2)/` are removed from every call, and the comment says
that the two exceptions exist for the tests and for nothing else.

## The rule

A list is not a category. Before scoping a removal, ask of each name separately what it does when it is present:
if one of them can write a file, move a stream, or start a program, it does not belong in the same scope as one that
only chooses a configuration file. When a fix narrows a defence to make a test work, the test's need is the whole
justification, and only the names that serve it may travel with it.

## What now enforces it

`scripts/preflight.test.mjs`, "the variables a project must not be able to hand a git call are taken out, each one
named here": two lists written out by name, one asserted absent from every call and one only from the network call.
Moving a name between them fails the test, and shortening the runtime's own list does too, because the test does not
read it.
