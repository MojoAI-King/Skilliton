---
name: remove-dead-code
description: Use when deleting code that looks unused, or when asked to clean up dead code, unused exports, old helpers or leftover files. Establishes that code is really unreachable before it is deleted, because searching for a name finds only the places that spell it the same way. Covers names built at runtime, names that live in data rather than code, names crossing a language boundary, and what to do when reachability cannot be proved.
---

Kind: Reference. Not shipped: its eval case could not tell a run with it from a run without it (docs/not-shipped.md). Kept for the record, outside every installable plugin.

# Delete it only once it is proved unreachable

Finding no caller is not the same as having no caller. A search finds the places that spell the name the way you spelled it, in the files you pointed it at. Everything else is still there, and it runs in production.

The cost is asymmetric. Leaving dead code costs a little confusion. Deleting live code costs an outage that nobody connects to a cleanup commit.

## What a search does not find

Check each of these before you decide something is dead.

- **Names built at runtime.** `handlers[kind]`, `require("./" + name)`, `getattr(obj, field)`, a factory keyed by a string, a router that turns a path into a function name. The name never appears whole in the source.
- **Names that live in data.** A config file, a JSON or YAML list, a feature flag, a routes table, a database row, a migration, a seed file, a queue message, a cron entry. The code that reads the data is very much alive.
- **Names crossing a language boundary.** A template, a shell script, a CI workflow, a Dockerfile, a SQL function, a stylesheet class, an infrastructure file. A search scoped to the source language walks straight past them.
- **Names spelled differently.** Case and separator variants of the same concept, and the string form beside the identifier form. Search both.
- **Exports past the boundary you own.** If it is published, someone outside this repository can be calling it and no search in here can see them. Deleting it is a breaking change, not a cleanup, and it gets a version note.
- **Reached only by tests.** That means the feature is dead and the test is alive. Say which you are deleting.
- **Reached only when something fails.** An error path, a fallback, a retry, a migration that runs once on old data. It is rare, not dead.

## How to work

1. **Widen the search past the source** before you narrow it. Search the whole repository, including data, docs, scripts and workflows, then narrow once you know what you are looking at.
2. **Search the string form too**, not only the identifier.
3. **Ask what deletes with it.** A function's only caller may become dead in turn. Do that pass deliberately rather than in one sweep.
4. **Delete in a commit that does only that**, so a revert is one command when the pager goes off.
5. **Run the tests and say which of them actually covered the deleted path.** A green suite that never touched it is not evidence.

## When you cannot prove it

Say so. "I could not find a reference, and here is where I looked" is a true statement and a useful one. "This is unused" is a claim about every place you did not search.

For a name you strongly suspect is dead but cannot prove, the honest options are to leave it with a note, or to log a warning on the path and come back once real traffic has had time to hit it. Choose one out loud rather than deleting quietly.

Commented-out code is a separate matter and does not need this ceremony. Version control has it. Delete it, and say in the commit that you did.

## What to report

What you deleted, the searches you ran quoted exactly, which of them covered non-source files, what the tests exercised, and anything you left behind with the reason. A list of deletions with no searches beside it is a claim, not evidence.
