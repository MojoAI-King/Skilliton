# Skillgate: Master Plan (v3)

Kind: Living. The build contract; Claude Code reads it every session. Build window: September 16, 8:00 a.m. to September 23, 8:00 a.m. Eastern.

v3 replaces v2 on September 16, after the owner steered the product (Section 0). v2 is in git history (commit `bf07bee`) for anyone who needs the earlier reasoning.

---

## 0. What changed in v3, and why

v2 made a usage-savings pack the product and treated packaging as plumbing. The owner's direction on September 16 is broader and clearer:

**Skillgate is a ready-made way of working for a whole company's AI-assisted development.** It ships an opinionated base skill set (keep the codebase healthy, spend tokens well, never lose context between sessions or people, review work in plain language, block the git mistakes that hurt) that makes Claude Code safe and fast for everyone, including the non-technical people now building with vibe-coding tools. A company forks the repository, keeps the base, adds its own skills, and every new hire gets the whole environment in one onboarding step. Improvements then arrive automatically.

What that changes:
- **The base skill set is the product.** The usage investigation (Section 6) becomes the evidence behind one base plugin, not the headline.
- **Fork and extend is the distribution model.** A company's fork is its own skill marketplace. Base packs stay read-only in the fork so upstream improvements merge cleanly.
- **Onboarding is a feature, not a document.** One step gives a new hire the marketplace, auto-update, the base plugins, and the instructions block that tells the model when to use which skill.
- **Auto-update raises the trust bar.** When one merge reaches every developer's machine within a session, release pinning, verification, and the security review (Section 9) matter more than in v2, not less.

What did not change: nothing silent, no unverified capability claims, no savings figures that the corrected meter did not produce and a second check did not confirm, and no client material in this repository.

---

## 1. The one sentence

Skillgate is a forkable, ready-made way of working for AI-assisted development: a base skill set that keeps codebases healthy, spends tokens well, and never loses context, which a company extends with its own skills and hands to every developer, technical or not, in one onboarding step.

---

## 2. Who it is for

| Person | What they need | What Skillgate gives them |
|---|---|---|
| **Tech lead** (owns how the company builds) | One place to define "how we work here" that actually changes behavior | A fork that is their company's skill marketplace; `new-skill` and `import` to package the skills they already rely on; release and verify to control what ships |
| **Developer** | Good defaults without reading a wiki; their own skills left alone | One onboarding step; namespaced company skills that never collide with personal ones; updates that arrive by themselves |
| **Non-technical builder** | To build without breaking things or getting stressed | Guardrails that stop the dangerous git mistakes and explain why; a plain-English review before committing; a handoff so work is never lost |

---

## 3. What Skillgate does

**Base skills (the harness).** Behavior that ships in the box. Where a behavior must always happen, a hook enforces it. Where it needs judgment, a skill guides it and triggers from its description, so nobody has to remember a command. Every behavior is labelled **enforced** or **instructed**, and nothing instructed is described as guaranteed.

**Fork and extend (the package).** The repository is a Claude Code plugin marketplace. A company forks it, adds `packs/<company>/plugins/<plugin>/`, and never edits `packs/base/`. Company skills are namespaced by Claude Code (`/<plugin>:<skill>`), so they cannot collide with a developer's personal skills in `~/.claude/skills/`.

**Onboard (one step).** A new hire either opens a company repository that carries the team settings (Claude Code offers the marketplace and plugins on trust) or runs one command. `skillgate harness` writes the instructions block into `CLAUDE.md` and `AGENTS.md`; `skillgate doctor` says in plain language what is working and what is not.

**Keep current (auto-update).** The team settings turn on Claude Code's own marketplace auto-update. Every plugin change bumps its version, because installed copies only update when the version changes. Updates are checked after a session starts and apply to the next session; the docs and the onboarding one-pager say so.

**Trust (release and verify).** A release binds an approval to an exact commit. `skillgate verify` checks what is installed on a machine against the release record: VERIFIED, TAMPERED, UNKNOWN VERSION, or WITHDRAWN.

**Where it runs.** Built for Claude Code first, and portable to Codex where Codex documents the same mechanism: skills use the open Agent Skills format both tools read (Codex discovers them in `.agents/skills/` and `~/.agents/skills/`), the harness block goes into `AGENTS.md` as well as `CLAUDE.md`, and Codex hooks accept the same deny decision shape. Codex requires each hook to be reviewed and trusted once, and its IDE extension has no plugins, so for Codex the skills are linked as plain folders. Each of these is stated per feature and exercised before it is claimed.

---

## 4. Scope this week

**In:**
- The base pack: `context-hygiene`, `workflow` (dispatch, maintain, handoff, review), `guardrails`.
- Onboarding: team settings template, harness block, `skillgate doctor`, `harness`, `project-settings`, `new-skill`, `import`.
- Proof that the fork-and-extend loop works: a rehearsal fork adds a company skill, releases it, and a second machine receives it by auto-update.
- Release, verify, and tamper detection for installed copies.
- The security review (Section 9), extended to auto-update and skill import.
- Real use in the owner's own software, and a fresh install by a non-technical second person using only the README and one-pager.
- The usage evidence (Section 6), still open where it was open.

**Out, deliberately:**
- A web dashboard, accounts, or a hosted service.
- Mandatory fleet-wide enforcement. Managed settings can force a marketplace and plugins; the docs explain how, and building an enforcement product is out.
- Tools other than Claude Code and Codex.
- Any claim that this controls a model's maximum context window. It controls what gets loaded and paid for.
- Client material of any kind. Examples are generic.

---

## 5. The base pack

| Plugin | Skill or hook | Enforced or instructed | Why it exists |
|---|---|---|---|
| `context-hygiene` | SessionStart hook: inject one bounded checklist section | Enforced | A one-line bug once injected a whole lessons file into every session (Section 6) |
| `context-hygiene` | status line: log real quota (applied by `scripts/setup.mjs`) | Enforced once applied | Real metered use is the only number that decides whether anyone runs out |
| `context-hygiene` | skill: never load large files raw, end work deliberately, subagents cost real money | Instructed | Measured causes of cache-write cost |
| `workflow` | skill `dispatch`: notes into verified parallel lanes with a coverage ledger that must sum | Instructed | Large batches of notes lose items and collide in merges |
| `workflow` | skill `maintain`: living docs, resume marker, plain-English decisions, two-file lessons | Instructed | Work done in a conversation vanishes when the conversation ends |
| `workflow` | skill `handoff` plus SessionStart hook showing the latest `RESUME HERE` | Hook enforced, writing instructed | The next session or person starts from the state, not from zero |
| `workflow` | skill `review`: plain-English risk review of the working tree | Instructed | Non-developers need to know what they are about to commit |
| `guardrails` | PreToolUse hook: deny force-push to protected branches, `--no-verify`, secret files; ask before destroying uncommitted work | Enforced | The mistakes that cost teams the most are a handful of git commands |

The motivating example for the whole pack: before Skillgate, one in-house skill existed in about sixty copies across project folders in six different versions, and nobody could say which was current. A marketplace with versions and auto-update makes that impossible.

---

## 6. The flagship evidence: context and cost hygiene

Built from a real, ongoing investigation on a live client project. The investigation corrected itself mid-flight, and that correction is part of why the evidence is worth shipping.

**Verified twice and unchanged:** a one-line `awk` bug in a SessionStart hook injected far more of a lessons file than intended, because `{f=1} f` sets a flag and prints to the end of the file instead of stopping at the next heading. Measured on the originating file: 102,941 bytes down to 19,233 (September 15). The shipped hook had a second, silent bug (an exact heading match that found nothing); it is fixed and its test now exercises the shipped script.

**What was wrong in the first measurement:** a 3.28x accounting error, caught by an independent model cross-check. Claude Code writes several JSONL records per response carrying the same cumulative usage; summing every record instead of deduplicating by request and message id inflated everything. A reported $1,568.88 for one window corrected to $478.40. Several structural claims flipped: subagents were about 13% of spend, not 1%; gate output was about 4%; a claimed 46% saving was withdrawn.

**What the corrected measurement suggests, with uncertainty attached:** cache writes are the largest cost component, driven by large single tool results and by returning to a large context after the cache lifetime lapsed. Thirteen of twenty-two large writes followed a gap past the lifetime; the rest remain unattributed.

**Still open:** the meter (`scripts/token-cost.mjs`) passes 42 hand-computed fixture checks but does not yet reproduce the investigation's own figure for September 14 to 15 (DECISIONS.md O2). No baseline is recorded with an untrusted meter.

### How claims get checked, in three tiers
- **Tier 1, real quota.** The status line logs `rate_limits.five_hour` and `rate_limits.seven_day` when the payload carries them (logged as null, never 0, when absent). The per-model weekly bar in `/usage` is not in the payload and is recorded by hand.
- **Tier 2, a frozen baseline** committed before anything changes, with the meter version that produced it. Blocked on O2.
- **Tier 3, comparisons of similar work,** with completion quality, runtime, and interventions recorded beside quota. One batch supports "demonstrated" or "not yet demonstrated", nothing stronger. "Batch" gets a written definition before the first comparison (O3).

### Scorecard
| Fix | Counter | Baseline | Target |
|---|---|---|---|
| Hook fix | Starting context tokens | Reproduce from fixtures; measure with `claude plugin details` | No number until measured |
| No large file reads | Results over 50KB per batch | 433 to 476KB reads observed | Zero over 200KB |
| Idle-gap discipline | Cache writes of 50K+ tokens per batch | 26 events, 7.59M tokens | Under 5 |
| Idle-gap discipline | Share following a lifetime-lapsing gap | 13 of 22 | Under 3 |
| Gate wrapper | Gate bytes entering context | About 214KB of 5.48MB | Under 20KB |
| Subagent discipline | Subagent share of spend | 13% | Flat, same work done |

**The failure condition, stated in advance:** if the Tier 3 counters move across several comparable batches and Tier 1 quota does not, the reconstructed cost model is not tracking what the plan meters, and the work rebuilds on Tier 1 alone.

### The honesty rule, non-negotiable
No dollar figure or percentage saving on a card, in the README, in a one-pager, or in the recording unless the corrected meter produced it and it was cross-checked. Say plainly what is known (the hook fix), what is still being narrowed (cache-write causes), and what tool exists so nobody has to trust anyone's arithmetic (the meter and its fixtures).

---

## 7. Onboarding

**The new hire's path, simplest first:**
1. **Zero commands:** the company commits `.claude/settings.json` from `templates/project-settings.json` (generated by `skillgate project-settings`) into its repositories. Opening and trusting one in Claude Code offers the company marketplace, with auto-update on and the base plugins enabled. Documented behavior; exercised on a clean machine on Day 3.
2. **One command:** `claude plugin marketplace add <company>/<fork>` then install the plugins, for people outside a company repository.
3. **Then, once per repository:** `skillgate harness --apply` writes the instructions block into `CLAUDE.md` and `AGENTS.md`; `node scripts/setup.mjs --apply` adds the quota status line; `skillgate doctor` reports what is working in plain language.

**The one-pager per plugin,** same structure every time: what it does in one sentence; what changes on your machine (exact files, settings, hooks); what you will notice day to day; what you are still responsible for (instructed habits, named as habits); who to ask and how to propose a change; why not build this yourself. Written twice in tone: a first-week version with no jargon, and a maintainer version with paths and commands.

---

## 8. Packaging, updates, and trust

- Each pack lives at `packs/<pack>/plugins/<plugin>/` and is listed in `.claude-plugin/marketplace.json`.
- **Every plugin change bumps the plugin's `version`;** installed copies only update when it changes.
- A proposal is a pull request. CI runs `claude plugin validate --strict`, the repository's tests, `scripts/scrub-check.sh --history`, and `claude plugin eval` where a plugin has behavior to test, and commits the result under `evidence/<commit-sha>/`.
- A release binds an approval to an exact commit SHA and content hash. The released marketplace entry is pinned by `sha`, because a ref-only pin is silently mutable.
- `skillgate verify` hashes what is installed and compares it with the release record: VERIFIED, TAMPERED, UNKNOWN VERSION, or WITHDRAWN. Withdrawing a release removes it from the catalog; it does not disable copies already installed, and is never described as doing so.
- `claude plugin eval` runs in isolation from personal settings and hooks. A passing eval proves a skill steers the model; it proves nothing about coexistence on a real machine. The fresh installs (Days 3 and 6) are the test of that, and each ends with a clean removal.
- Personal skills are never touched. The pack governs what the company ships, not what an individual does on their own.

---

## 9. Security review

**Scope statement, verbatim in the report:** this is a targeted security review of Skillgate's own release, update, import, and installation paths, performed in disposable repositories and environments. It is not a penetration test of the evaluator, any client, or any production system, and it is not independent certification.

| # | Attempt | Expected result | What it teaches |
|---|---|---|---|
| A1 | A pack whose eval scores perfectly while its hook reads a dummy secret from the environment and writes it out | Eval passes; the hook still ran, as the user | A passing test suite is not a safety guarantee |
| A2 | Approve commit A, push commit B to the branch; install from a ref-only entry and a SHA-pinned entry; modify a file in the installed copy of A | Ref-only installs B; SHA-pinned keeps A; verify reports VERIFIED, UNKNOWN VERSION, and TAMPERED for the three states | A branch pin is not an approval; unapproved and tampered are different failures |
| A3 | A manifest path that tries to escape the plugin directory | Rejected by the platform loader | Confirm native controls hold before claiming credit |
| A4 | Release without a passing review, and release attempted from an identity that should not hold release credentials | Branch protection refuses the merge; the release job refuses without an approved environment and never exposes the credential to the eval job | Authorization is checked by the system that receives the action |
| A5 | A withdrawn release, still installed, run again | It still runs; verify reports WITHDRAWN | Withdrawal is not revocation |
| A6 | A malicious hook merged into a company fork with auto-update on | Measure how fast it reaches a second machine, and whether SHA pinning plus verify catches it | Auto-update turns one bad merge into every machine's problem; the release gate is the control |
| A7 | `skillgate import` of a personal skill containing a secret-shaped string and a client name | Import refuses, names the file and rule, never prints the secret | The easiest leak is a helpful skill copied without reading |
| A8 | Guardrails bypass attempts: compound commands, quoting, `git -c`, aliases | Documented as caught or not caught, per case | A guard is only as good as the cases it was tested against; say which were not |

Report structure: scope, threat model, each case's setup and result, fixes and retests, and a closing list of what was not tested and why.

---

## 10. Schedule with gates

**Day 1 (September 16), done except as noted.** Meter fixture test passes; hook fix packaged and its test exercises the shipped script; status line tested (present, absent, jq missing, log unwritable); public repository scrubbed and pushed; v3 direction set. Open and owner-dependent: meter reproduction (O2), the live status-line session check, the hand-recorded `/usage` numbers, and observing the SessionStart hook in a live session (O6).

**Day 2 (September 17). The base pack is real.** `workflow` (dispatch, maintain, handoff, review) and `guardrails` merged with their tests; `skillgate` CLI (`doctor`, `harness`, `project-settings`, `new-skill`, `import`); every plugin validates with `--strict`; guardrails proven to block in a live Claude Code session, not only in fixtures; the harness block applied to this repository itself. First `claude plugin eval` cases for `review` and `handoff`.
Demo: a live session where a force-push to main is blocked with a plain-language reason, a review of a real working tree, and a handoff that the next session shows automatically.

**Day 3 (September 18). The fork-and-extend loop.** A rehearsal fork adds a company plugin with `new-skill` and `import`; release pins it by SHA; a clean machine or user joins through the team settings with auto-update on; a new company skill arrives by auto-update; `skillgate verify` passes, then catches a tampered file.
Demo: fork, add, release, auto-update, verify, tamper. This is the minimum credible submission.

**Day 4 (September 19). Real use.** The base pack in the owner's own software for a full working day; Tier 3 comparison where the meter allows; friction recorded and fixed. Codex support stated per feature from verified documentation.

**Day 5 (September 20). Security day.** A1 through A8 in disposable repositories. Fix what is fixable. Draft the report.

**Day 6 (September 21). A non-technical second person** installs the company environment fresh on their own machine using only the README and the one-pager, builds something small, commits it through review and guardrails, writes a handoff, then removes everything cleanly and confirms their configuration is back to what it was. Every point where they got stuck is fixed; the friction log is part of the submission.

**Day 7 (September 22). No new work.** Recording, the note, the security report, limitations, a final pass on every one-pager for a reader who was not in the room, and an explicit statement of what Tier 1 showed: demonstrated, not yet demonstrated, or contradicted, with the batch count behind it.

---

## 11. What you will teach them

1. **A skill copied is a skill forked.** One in-house skill in sixty copies across six versions, nobody sure which was current. Distribution with versions is not bureaucracy; it is how a team knows what it is running.
2. **The bug that quietly taxed every session,** and the second bug hiding in its fix: a test that certified a copy of the code instead of the code that shipped.
3. **The first measurement was wrong, and catching it is the lesson.** A 3.28x accounting error caught by an independent cross-check, and a meter that still refuses to be believed until it reproduces a known figure.
4. **Enforced versus instructed.** Instructions steer a model; hooks bind it. A product that tells a non-technical team it is "safe" has to say which is which.
5. **A passing test is not a safety guarantee** (A1), and **auto-update is a supply chain** (A6).

---

## 12. Submission package

- Runnable: the base pack and the onboarding CLI, installable with one marketplace add, plus the release and verify plumbing.
- A rehearsal company fork showing fork, extend, release, auto-update, verify.
- The one-pagers, in first-week and maintainer forms.
- Recording, eight to twelve minutes: the drift problem, the base pack in a live session (guardrail block, review, handoff), the fork-and-extend loop, the security cases, the non-technical person's install, and the honest state of the usage evidence.
- The note: what it is, what you would do next, what you learned.

---

## 13. Do not

- Build a web dashboard or anything with a login.
- Rebuild `claude plugin eval`, `claude plugin init`, or marketplace auto-update. Use them.
- Describe an instructed behavior as enforced, or a documented behavior as verified before it has been run.
- Claim this changes a model's maximum context window.
- Put a dollar figure or percentage saving anywhere that the corrected meter did not produce and a cross-check did not confirm.
- Call the security review a penetration test of the evaluator or any client.
- Put client material, client names, or personal names anywhere in this repository. Run `scripts/scrub-check.sh --history` before every push.
- Edit `packs/base/` in a company fork; extend beside it.
- Change a plugin without bumping its version.
- Let a guardrail ship so wide that its first false positive gets it switched off.
- Conclude from one batch that a fix did or did not matter.

---

## 14. Verified facts this plan relies on (as of September 16, 2026)

From official Claude Code documentation, quoted by a research pass, unless marked as run here:
- **Run here:** Claude Code 2.1.273 (the editor-bundled binary) has `claude plugin eval`, `claude plugin details` (component inventory and projected token cost), and `claude plugin init`. The terminal binary on this machine is 2.1.92, which has none of the three.
- **Run here:** `claude plugin validate --strict` passes for `context-hygiene` and `workflow` on 2.1.273.
- A project's `.claude/settings.json` can declare `extraKnownMarketplaces` (with `autoUpdate`) and `enabledPlugins`; after a person trusts the folder, the marketplace is added. Plugins from an external source still need an install; plugins with relative paths inside the marketplace can be enabled directly.
- Managed settings can allowlist or block marketplaces (`strictKnownMarketplaces`, `blockedMarketplaces`) and force `enabledPlugins`; nothing below managed settings overrides them.
- Marketplace auto-update is on by default for the official marketplace and off by default for others; it is toggled per marketplace. If a plugin sets `version`, installed copies update only when it changes. Checks run after a session starts, with a random delay of up to ten minutes; `claude plugin update` says a restart is required to apply.
- Git plugin sources accept `ref` and `sha`; when both are set, `sha` wins.
- Plugin skills are always namespaced (`/plugin:skill`); personal skills live in `~/.claude/skills/`, project skills in `.claude/skills/`. Plugin skills require `name` in frontmatter. `${CLAUDE_SKILL_DIR}` resolves to a skill's own folder.
- Plugins can declare `dependencies` on other plugins, and `userConfig` options exposed to hooks as `CLAUDE_PLUGIN_OPTION_<KEY>`. `CLAUDE_PLUGIN_DATA` is a persistent per-plugin data directory.
- PreToolUse hooks receive `tool_name` and `tool_input.command` for Bash and can deny with `hookSpecificOutput.permissionDecision` and a reason. SessionStart stdout is added to the model's context; no size cap is documented. Default command hook timeout is 600 seconds and can be set per hook.
- Plugin hooks and MCP servers run as the user, outside the eval sandbox; a passing eval does not certify that a plugin's hooks are safe.
- A plugin's `settings.json` supports only a small set of keys, and a `CLAUDE.md` inside a plugin is not loaded as project context, which is why the harness block and the status line are applied by explicit, reversible commands.
- The status line payload carries `rate_limits.five_hour` and `rate_limits.seven_day` on Pro and Max plans after the first response; observed present on this machine on September 16. The model-specific weekly window is not in the payload.
- **Codex (official OpenAI documentation, fetched September 16):** skills follow the open Agent Skills standard (agentskills.io) with required `name` and `description`; Codex scans `.agents/skills` from the working directory up to the repository root and `~/.agents/skills` for the user, follows symlinked skill folders, and does not merge same-name skills. The skills list is capped at 2% of the context window. `AGENTS.md` is read from `~/.codex` and from the repository root down to the working directory, capped by `project_doc_max_bytes` (32 KiB by default; the docs disagree on whether that cap is per file or combined). Codex hooks include `SessionStart` (stdout added as context) and `PreToolUse` (deny via `permissionDecision`), load from `~/.codex/hooks.json` or a trusted repository's `.codex/hooks.json`, and run only after the person reviews and trusts each hook's exact definition. Codex sets `CLAUDE_PLUGIN_ROOT` and `CLAUDE_PLUGIN_DATA` for compatibility. `codex plugin marketplace add owner/repo` exists; plugins are not available in the Codex IDE extension. Codex does not read `CLAUDE.md` at runtime. **Run here:** Codex CLI 0.154.0-alpha is bundled with the desktop app and the IDE extension on this machine.
- **Not yet verified by running:** the `ask` permission decision; auto-update end to end on a clean machine; team settings on a clean machine; any Codex behavior above.
