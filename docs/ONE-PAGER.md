# Skillgate: how your team works with AI

Kind: Living. Updated 2026-09-16 with the integrated build. What is proved and what is not is kept in [PLAN.md](../PLAN.md) section 7 and [CLIENTS.md](CLIENTS.md).

## For your first week

**Skillgate gives your coding assistant your team's way of working.** You describe what you want in your own words; you do not need to know skill names, branches or where notes go.

**What happens when you work:**

1. **You open a session.** It starts with the last handoff and a short project state: the task you were on, anything left unfinished, anything out of date. The assistant tells you where things stand.
2. **You ask for something.** The assistant turns it into a task with a clear definition of done, and for anything bigger than a small fix it works on a separate branch so the shared one stays safe.
3. **It builds and keeps notes.** Before changing anything it explains the change in plain words. When something is decided, checked or stuck, it records a checkpoint. If it tries to finish with changes it has not recorded, it is reminded to.
4. **It reviews before committing.** You get what changed, what could break, what was actually tested, and a verdict: READY TO COMMIT, NEEDS ATTENTION or STOP.
5. **You stop, or get interrupted.** A handoff note is saved. If the session simply ended, the next one is told it was interrupted and picks up from the last checkpoint.

**Some protections run by themselves.** Force-pushing over the shared branch, skipping the checks git runs, or committing something that looks like a password are blocked, with the reason and a safe next step. Throwing away uncommitted work needs your confirmation. When your team's shared repository has a delivery check, a change is only accepted when the combined result passes the tests.

**What these do not do:** they do not watch other terminals or tools, they do not make the code correct on their own, and a security evidence summary is never a certificate. Ask your maintainer when something is blocked and you think it should not be.

## For the person maintaining this

| You manage | Where | How you check it |
|---|---|---|
| The skills and plugins your team gets | your fork of this repository: `packs/base/` plus your own `packs/<company>/` | `node scripts/skillgate.mjs doctor`, `node scripts/packs.test.mjs` |
| What the assistant is told | `packs/base/plugins/workflow/templates/harness.md` | changes reach projects through `skillgate migrate` (preview, receipt, rollback) |
| Approved releases | `releases/<version>.json`, signed tags | `skillgate release list`; each developer runs `skillgate verify` |
| A project's records | the project's own `docs/`, `DECISIONS.md` and `.skillgate/` | `skillgate status --dir <project>` |
| Project security evidence | the project's `.skillgate/security/` | `skillgate security status --dir <project>` |
| What may merge | the project's `.skillgate/delivery.json` and the delivery check on the shared repository | [DELIVERY.md](DELIVERY.md) |

**The improvement loop:** a project records a lesson; `skillgate propose` copies it, scrubbed, to your fork; you change the skill or template and prove it with a test that fails before the change and passes after; you sign a release; developers update and verify; projects apply the template change with `migrate`. Nothing reaches your team's policy without your review.

**Keep three kinds of evidence apart:** skill evaluation results (`evidence/<commit>/`), project security evidence (each project's `.skillgate/security/`), and release approval (signed tags). One never stands in for another.

**Guides:** [RELEASING.md](RELEASING.md) for the fork and releases, [ONBOARDING.md](ONBOARDING.md) for your developers, [DELIVERY.md](DELIVERY.md) for merge checks, [CLIENTS.md](CLIENTS.md) for what each coding client supports.
