# Contributing

Kind: Living.

Skilliton is MIT-licensed and takes changes by pull request. A change carries the behaviour, its test, and any migration a prepared project would need.

## Run the checks

```bash
node scripts/checks.mjs            # every check CI runs, one step at a time, verdict per step, logs under .git/skilliton/checks/
node scripts/checks.mjs --list     # the steps, without running them
node scripts/checks.mjs --only lint
```

The runner reads the list from `.github/workflows/checks.yml`, so there is one list. Most checkers carry a `--self-test` that plants a defect and requires red; a change to a checker keeps that true. `docs/MAINTAIN.md` lists the same commands one by one with what each one holds.

## What a change needs

- **A test that can fail.** New behaviour comes with a test in `scripts/`; a changed refusal comes with the test that reads its message.
- **Preview before write.** A command that writes takes `--apply` and writes nothing without it; a refusal exits 2 and says "Nothing was written". Exit codes: 0 complete, 1 attention, 2 refused, 3 the operation failed.
- **A plugin change bumps the plugin.** Edit anything under `packs/base/plugins/<plugin>/` and raise `version` in that plugin's `.claude-plugin/plugin.json`; installed copies update only when it changes. A change to `packs/base/plugins/workflow/templates/harness.md` reaches every prepared project as a migration; say so in the change.
- **The contracts.** A new command, format or exit code is added to `docs/CONTRACTS.md` in the same change.
- **A record.** A decision worth keeping is one file: `skilliton record decision "<title>" --apply`, then fill it in. A lesson the same way.

## What the checks refuse

No em or en dashes (the scrub check). No client, evaluator or personal names (the scrub check with a private denylist). No savings, cost or token claim anywhere unless `scripts/token-cost.mjs` produced it and the owner cross-checked it (PLAN.md sections 6 and 8). No runtime file over 600 lines except the pinned ones, which may only shrink. No `console.log` in a runtime, no unused import, no `package.json` outside the fixtures, no export nothing reaches.

## Company-specific skills

They belong in your own pack beside `packs/base/`, never inside it: `new-plugin <plugin> --pack <company> --apply`, then `new-skill` or `import`. That is what keeps an upstream merge from touching them. A skill earns its place with an eval case that tells a run with it from a run without it; `docs/not-shipped.md` shows three that did not.
