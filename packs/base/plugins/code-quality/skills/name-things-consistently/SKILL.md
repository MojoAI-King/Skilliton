---
name: name-things-consistently
description: Use when one idea in a codebase goes by several names, when a rename is asked for, or when naming something new. Settles on one name per concept and makes the rename complete, covering the identifier and its string form, config keys, command flags, error text a user reads, file and folder names, and the docs. Also says which names must not be renamed because they cross a boundary you do not own, and how to stop the old name coming back.
---

# One concept, one name, everywhere it appears

Two names for one thing cost more than an ugly name. Every reader has to learn that they are the same, every search finds half the places, and the third name arrives because the next person could not tell which of the two was current.

A rename is cheap. A **half finished** rename is worse than either name alone, because now the codebase says both and means one.

## Decide once

1. **Count the names before you pick one.** List every spelling of the concept and how many places use each. The most common is often the winner, but not always, and the point of counting is that the choice gets made once, by a person, on purpose.
2. **Prefer the word the users and the domain already use** over the one an old implementation happened to pick.
3. **Write the decision down** where the next person will hit it, in the project's own records. A name chosen in a pull request comment is a name that gets relitigated.

## Then make it complete

A rename is not done until all of these say the new name.

- The identifier, and **the string form of it** beside the identifier: keys, lookups, event names, log fields, test names.
- Every spelling variant of the concept: the hyphen, underscore, camel and capitalized forms.
- **Config keys, command flags and environment variable names.** These are the ones that get missed, and each one is a user visible break, so it gets a note and, where the project supports one, a deprecation path.
- **Error and status text a person reads.** A message that still says the old word teaches it to every user who hits it.
- File names and folder names.
- The docs, the README and the comments.

Run the search for the old name one more time when you think you are done, across the whole repository and not only the source, and paste what it printed.

## What not to rename

Some names are not yours. A wire format field, a database column, a public API parameter, a vendor's payload, a persisted event, a published package export. Renaming one of those is a breaking change dressed as tidying, and it breaks people who never see your commit.

Keep the outside name exactly as it is, and **map it to your name at the boundary**, in one place, with a comment saying which side owns it. One translation point is readable. A codebase that translates in forty places has two names again.

## Stop the old name coming back

A rename with nothing holding it decays. Add the smallest thing that fails when the old name returns: a line in the project's existing name or lint check, a grep in the pre-commit or the pipeline, a banned words list. Without it, the next session reintroduces the old name in good faith, because it is still in the git history, still in someone's editor, still in an old branch.

If an alias has to stay for compatibility, give it an expiry and a note saying what removes it. A permanent alias is two names with extra steps.

## What to report

The name you chose and why, the count of places changed per kind (code, config, messages, docs), the names you deliberately left alone with the boundary that owns them, the final search output for the old name, and the check you added so it stays gone.
