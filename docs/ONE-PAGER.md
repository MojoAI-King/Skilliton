# context-hygiene: how we work here

(Template. Write it twice: once for someone's first week with no jargon, once for the maintainer with paths and commands. Same facts.)

## 1. What this pack does, in one sentence

## 2. What changes on your machine the moment you install it
Be exact: which files, which settings, which hooks.

## 3. What you'll notice day to day
The quota status line. Shorter session starts. Test output landing in `.gate/<lane>.log` instead of the conversation.

## 4. What you're still responsible for
The habits the hooks cannot enforce, named as habits, not guarantees: end finished work with a handoff, do not read huge files raw, batch independent checks.

## 5. Who to ask, and how to propose a change
Open a pull request against the pack. CI validates it; a reviewer approves; a release pins it.

## 6. Why not build this yourself?
You can. This exists so you do not start from zero. It came out of a real, measured problem, including a measurement error we caught and corrected. Fork it and make it yours.
