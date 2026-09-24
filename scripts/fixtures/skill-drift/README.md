# Skill copy fixture

Kind: Reference.

Read by `scripts/skill-drift.test.mjs` (N15, backlog B76). `installed/` stands for an installed plugin's folder (the test writes an `installed_plugins.json` naming it); `project/claude-skills/` is copied to a temporary repository's `.claude/skills/`. It is not kept as `.claude/skills/` here, so no session working in this repository reads these as skills.

- `alpha`: the project's copy differs from the installed one, so the session-start block names it.
- `beta`: the two copies are byte for byte the same, so nothing is said.
- `own`: no installed plugin has a skill of that name; it is the project's own and is never compared.
