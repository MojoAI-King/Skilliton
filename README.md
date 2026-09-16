# Skilliton

This repository is Skilliton. The product inside it is **Skillgate**.

Kind: Living.

**Skillgate is being built as a forkable development autopilot for teams using AI coding tools.** A company defines how it wants to build software once, then gives every contributor the same starting environment, project records, working habits, and checks. People describe the work they need; the assistant helps carry it through without requiring them to know which skill to invoke.

The full product prepares repositories, preserves decisions and unfinished work, gathers security evidence, connects changes to trusted team checks, and delivers company-approved improvements. Parts work today; the complete lifecycle is still being integrated.

[PLAN.md](PLAN.md) is the canonical direction and roadmap. [CONTRACTS.md](docs/CONTRACTS.md) distinguishes implemented interfaces from target contracts. [AUTOPILOT_INTEGRATION.md](docs/AUTOPILOT_INTEGRATION.md) guides adaptation of the included standalone prototype to the existing CLI and workflows. [HANDOFF.md](docs/HANDOFF.md) records the next work. [Start here](docs/AUTOPILOT_START_HERE.md) indexes all implementation material and the saved [build goal](docs/BUILD_GOAL.md).

## The workflow we are building

| Step | What the contributor experiences |
|---|---|
| Prepare | The project gets the instructions and records it needs: status, backlog, roadmap, decisions, lessons, handoffs, and security evidence. Existing project history is preserved. |
| Build | The assistant helps define a task, chooses an appropriate workspace, and follows the company's workflow during normal coding. |
| Remember | Decisions, progress, and unfinished work are saved as work proceeds, so another session or person can resume from recorded state. |
| Check | Review explains the change and its risks. Security observations link to supporting evidence. Trusted checks determine whether the change may merge. |
| Improve | A lesson becomes a proposed workflow change, is tested and reviewed, and reaches the team through an approved release. |

Project records are useful inputs for a board or roadmap; a web dashboard is not required for the workflow to work. Usage and context hygiene are supporting capabilities, not the core product or a prerequisite for this roadmap.

## What works today

| Component on the main branch | Current behavior and limits |
|---|---|
| `workflow` plugin | `dispatch` organizes work; `maintain` updates living documents; `handoff` saves a resume note; `review` explains changes and gives a verdict. These are instructions to the assistant. A session-start hook displays an existing handoff, but does not ensure one was written or is current. |
| `guardrails` plugin | An enabled Claude Code hook checks Bash-tool command text for supported risky git operations and secret-shaped commits. It can block or request confirmation. Its documented parsing limits apply; it is not protection for every terminal command or a server-side merge gate. |
| Onboarding CLI | `doctor`, `harness`, `project-settings`, `new-skill`, and `import` inspect setup, write managed instructions and settings, and package company skills. |
| `context-hygiene` plugin | Provides a bounded session-start checklist and working habits. A separate optional setup adds a quota status line. No usage-savings claim is made. |
| Tests and evaluation evidence | Fixture tests and packaging checks run in CI. Separate model evaluations measure selected skill scenarios; `scripts/evidence.mjs` summarizes those results. This is not evidence of a customer's security compliance. |

**Standalone prototype, included in this checkout:** repository preparation and project security evidence are available in `scripts/prepare.mjs` and `scripts/security-evidence.mjs`, with their tests and `scripts/autopilot-demo.mjs`. They were imported from `23aae41`; the existing onboarding commands below do not yet invoke them. See [source, usage and remaining integration](docs/AUTOPILOT_START_HERE.md). The prototype preserves observations and detects changes to their recorded source files, artifacts, and control definitions. It is a partial starter mapping, not a complete security assessment.

**Still to integrate or prove:** automatic lifecycle execution, preparation within onboarding, broader framework applicability and gap tracking, trusted application merge checks, approved release verification, safe project-file migrations, and the full company-fork/update rehearsal. Codex has not had a fresh end-to-end rehearsal here. See the [plan](PLAN.md) for acceptance gates.

## Start with the current build

Requirements: Claude Code, Node.js (CI uses 22), git, bash, and `jq` for the hooks that need it. The [one-pager](docs/ONE-PAGER.md) explains daily use and the maintainer's responsibilities.

**For the company maintainer:** fork this repository and clone the fork. Keep company plugins beside `packs/base/`. The current CLI adds skills to an existing plugin; it does not create the plugin container. First create `packs/<company>/plugins/<your-plugin>/.claude-plugin/plugin.json` with its name, version, description and license, and register its source in `.claude-plugin/marketplace.json` using the existing plugins as examples. Then add or import skills:

```bash
node scripts/skillgate.mjs new-skill <your-plugin> <skill-name>
node scripts/skillgate.mjs import <existing-skill-folder> --into <your-plugin>
```

Import checks for secret-shaped strings, personal paths, and names from your configured denylist. A name scan depends on supplying that list.

From the company fork, preview settings and instructions for each product repository, then apply them:

```bash
node scripts/skillgate.mjs project-settings --dir <project-folder> --marketplace-repo <your-org>/<your-fork>
node scripts/skillgate.mjs project-settings --dir <project-folder> --marketplace-repo <your-org>/<your-fork> --apply
node scripts/skillgate.mjs harness --dir <project-folder>
node scripts/skillgate.mjs harness --dir <project-folder> --apply
```

This writes team settings and a managed block in `CLAUDE.md` and `AGENTS.md`. It does not yet create the full project record structure described above.

**For a contributor:** use the company's onboarding instructions when opening and trusting its repository. The explicit install path is:

```bash
claude plugin marketplace add <your-org>/<your-fork>
claude plugin install guardrails@skillgate
claude plugin install workflow@skillgate
claude plugin install context-hygiene@skillgate
```

These names assume the fork retains the `skillgate` marketplace name. From a clone of that fork, check one project:

```bash
node scripts/skillgate.mjs doctor --dir <project-folder>
```

Start a fresh session and check the handoff and guardrails notices. A maintainer must investigate missing or unverified checks; installation alone does not demonstrate the full workflow. The optional quota status line has its own preview and setup:

```bash
node scripts/setup.mjs
node scripts/setup.mjs --apply
```

## How improvements reach a team

The intended path is: **earned lesson -> proposed change -> regression or behavior test -> company review and approved release -> rollout**. Companies review upstream changes into their fork. Individual sessions can propose improvements; they do not silently rewrite company policy.

Three different updates have different responsibilities:

- **Plugins:** current team settings request native marketplace auto-update. Plugin changes need version bumps. Release approval, pinning, verification, and a fresh receiving-machine rehearsal remain work in the plan; turning on auto-update does not provide those controls by itself.
- **Repository instructions and structure:** today a maintainer reruns `harness` to refresh its managed block. Automatic, versioned migrations for prepared repositories are planned. They must preserve human-written content and project history, report conflicts, and support recovery.
- **Product code:** application behavior changes still follow the product repository's normal review and merge process. A skill update is not permission to rewrite or deploy an application.

Security mappings follow the same discipline: findings and evidence accumulate, while changes to framework versions, applicability, and required checks remain reviewable. Missing, stale, and unassessed evidence must stay visible; a framework reference is not proof of compliance.

## Check the current implementation

```bash
node scripts/packs.test.mjs
bash scripts/guardrails.test.sh
bash scripts/handoff-hook.test.sh
node scripts/skillgate.test.mjs
node scripts/setup.test.mjs
bash scripts/hook-fixture.test.sh
bash scripts/statusline.test.sh
node scripts/token-cost.test.mjs
node scripts/evidence.test.mjs
bash scripts/scrub-check.sh --self-test
```

[CI](.github/workflows/checks.yml) also validates packaging. Live guardrail probes and model evaluations require an account and incur usage; they are separate from credential-free CI. Recorded results live under `evidence/` and apply to the scenarios and versions tested. See the [integration plan](docs/AUTOPILOT_INTEGRATION.md) for prototype validation and the combined rehearsal still required.

Before publishing, run `bash scripts/scrub-check.sh --history` with your private `SKILLGATE_DENYLIST`. Without a denylist, the name scan is incomplete and exits 2; current CI permits that result with a warning. A green CI run is not proof that the private name scan ran.

## Contributing and license

Propose changes through a pull request with the affected behavior, relevant tests, and any migration impact. Company-specific skills belong beside the base pack. Plugin changes require a version bump. The [plan](PLAN.md), [decisions](DECISIONS.md), and [contracts](docs/CONTRACTS.md) keep implementation and claims aligned.

MIT. See [LICENSE](LICENSE).
