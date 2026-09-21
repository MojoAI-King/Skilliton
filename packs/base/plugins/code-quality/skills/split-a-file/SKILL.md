---
name: split-a-file
description: Use when a source file has grown past what a project allows or past what a reader can hold, and it has to be broken up. Splits a file as a move rather than a rewrite, so the same code runs afterwards, and proves it with the project's own tests run before and after. Also covers where to cut, what to do with the public surface, and why a size pin is lowered and never raised.
---

# Split a file without changing what it does

A split is a **move**. The same code runs afterwards, in a different place. Everything else you notice while moving it is a separate change for a separate commit.

That is the whole discipline, and it is hard because the code is open in front of you and the improvements are obvious.

## Before you cut anything

1. **Get a green baseline and write it down.** Run the project's tests and record the result, the count included. A split you cannot compare against is not a split, it is a rewrite with no reference.
2. **If nothing covers the file, say so first.** Offer to add a characterization test for the behavior you are about to move, or tell the user plainly that the split will be unproven. Do not move on in silence.
3. **Find the real ceiling.** A project that refuses the file usually names the limit in a lint rule, a config file or a pinned list. Read it, so you know what the file has to get under and what the rule will accept.

## Where to cut

- Cut along **what depends on what**, not along what kind of thing something is. A file of "all the types", a file of "all the constants" and a file of "all the helpers" still call each other in a circle, and you now have four files to read instead of one.
- Take the piece with the **fewest inbound references** first. It leaves the smallest hole.
- Name the new file after **what it does**, in the vocabulary the project already uses. `utils`, `helpers`, `common` and `misc` are the names a file gets when nobody decided what it holds; each one is a second oversized file waiting.
- A group of functions that share private state belongs together. If cutting it means exporting something that was private, that is the seam telling you it is the wrong seam.

## While you move

- **Move whole units, character for character.** Copy the text. Do not retype it, do not reformat it, do not rename a variable, do not fix the bug you just spotted, do not add the type annotation. Write the bug down and fix it next.
- **Keep the public surface.** Either re-export the moved names from the original file so nothing outside has to change, or update every import in the same change. Half of each is the state that breaks a build nobody can explain.
- A barrel file that re-exports everything puts the size straight back and hides the dependency you just untangled. Use one only where the project already does.
- **Do not leave a file that is nothing but imports.** If the original ends up empty, delete it and update the callers.

## Prove it

- Run the **same** tests and compare with the baseline, count and all. Same result, or the move changed behavior.
- Read the diff for lines that are neither "moved out of here" nor "moved into there". Every other line is something you did not mean to do.
- **Lower the pin, never raise it.** If the project pins this file's size, the number goes down after a split. Raising it is how the ceiling stops being a ceiling, and the file that got you here was pinned once too.
- Say what you ran and what it printed. "It should still work" is not a result.

## What to report

The seam you cut on and why, the new file names, the test result before and after, the pin's old and new value, and anything you deliberately left alone. If you found a real bug while moving, name it as a separate piece of work rather than fixing it here.
