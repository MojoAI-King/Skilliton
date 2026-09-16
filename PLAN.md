# Skillgate: Master Plan (v2)

Prepared September 15, 2026, final revision September 16, 2026 (clock start). Build window: September 16, 8:00 a.m. to September 23, 8:00 a.m. Eastern.
This file is meant to live at the root of the Skillgate repository so Claude Code reads it every session.

This version replaces the earlier trust-chain-first draft. The product changed after real conversation and one real data point (Section 5). Section 0 explains what changed and why, so nobody building from this file wonders why it looks different from the first brief.

---

## 0. What changed, and why

The original brief framed Skillgate as a governance and approval system for AI skills: propose, review, approve, release, verify. That system still exists in this plan, but it moved from the headline to the plumbing.

The actual product is simpler to say and easier to feel the value of: a company packages the skills that make its engineers work well, ships that pack to every developer's coding tool, the pack keeps their AI behavior healthy and cheap automatically, and new hires learn "how we work here" from a doc that ships in the same box. The trust chain is what makes that safe to hand out company-wide. It earns its place; it just isn't the pitch anymore.

The other change: a real, measured token-burn investigation on a live client project (Section 5) turned out to be exactly the kind of skill this product should ship first. It has a working, twice-verified fix, a corrected measurement method with tests, and a mechanism that generalizes to any team using Claude Code. That becomes the flagship pack, not an example.

One more correction, folded in after this file was first drafted: the investigation behind that flagship pack had a 3.28x accounting error in its first pass, caught by an independent model cross-check, not by re-reading the same script harder. Section 5 reflects the corrected version. Catching and owning that error became part of the pack's own story, not a footnote to hide.

---

## 1. The one sentence

Skillgate is how a company packages the skills, guardrails, and habits that make its AI coding tools work well, ships them to every developer's environment so the behavior is automatic rather than tribal knowledge, and gives new hires a way to learn the company's practices while the tooling is already enforcing them.

---

## 2. Why this is the right project for this assessment

| Assessment rule | How this plan meets it |
|---|---|
| Solve a real problem, in a cool way | The problem is real and already cost real money (Section 5). The cool part is that the fix ships as an installable pack instead of a one-off cleanup. |
| Build it as if it would be in use | The flagship pack is not hypothetical. It is derived from a real investigation on a real, running project, with a second person installing it fresh. |
| Sharp, unusual answer to a small problem | Not "AI governance for enterprises." One narrow claim: install this pack, your team's AI stops wasting context and money, and here is how you check whether it actually did. |
| Teach us something | The token-burn investigation itself is a teaching moment (Section 11), and it is one most people evaluating AI tooling have not personally measured. |
| Survive a real user | The pack has to work for someone who never reads a rule and just uses their editor. That is why enforcement lives in hooks and settings, not in a document people are supposed to follow. |

---

## 3. The three things Skillgate does

**Package.** A company authors skills (behavioral instructions, small helper scripts, hooks, plus a setup step for the settings a plugin cannot carry) and Skillgate turns them into a versioned, installable pack using Claude Code's native plugin and marketplace system. One command line installs the whole pack into a developer's environment, whatever editor they sit in (Claude Code directly, or Claude Code running inside VS Code or Cursor). Skillgate itself ships the same way it asks companies to ship their own packs: as a forkable starter repo, not a hosted product a company depends on someone else to run. Fork it, make it yours, extend it. That is the intended path, not a workaround.

**Harness.** The pack does not just suggest good behavior, it enforces or automates as much of it as the platform allows: a skill that tells the AI what to do when context gets large (with an optional snippet the setup step offers for the project's own `CLAUDE.md`), a session-start hook that loads exactly the checklist it should and nothing more, a gate wrapper that keeps test output out of the context window while preserving the real result, a status line that logs real quota usage so nobody is flying blind, and a drift check that says when the settings file and the running session disagree. This is the part that makes the product feel like it is "working better for people of all skill levels" without anyone having to be disciplined about it.

One technical fact governs how this is built (verified in the plugins reference): a plugin can carry skills, agents, hooks, MCP and LSP servers, and its own `settings.json` supports only the `agent` and `subagentStatusLine` keys. A `CLAUDE.md` inside a plugin is not loaded as project context. So the hook and the skill install by themselves, but the main-session status line, any model or effort default, and project instructions do not. Those go through a small, explicit setup step (`skillgate setup`) that shows the proposed changes, backs up the existing files, applies only with consent, and can undo itself. Installation makes the system work; it does not silently rewrite a developer's configuration.

**Onboard.** A one-pager per pack: what it does, why, and how to work within it, written so a brand-new hire and a ten-year veteran both get something out of it. It is meant to be up on someone's second monitor during their first week, not buried in a wiki.

Packaging is the mechanism. Harness is the value. Onboard is what makes the value transferable to a person instead of just a machine.

---

## 4. Scope this week

**In:**
- One flagship pack, built from Section 5, shipped, installed by a second person, with before-and-after evidence.
- The onboarding one-pager for that pack.
- The packaging and verification plumbing (Section 8), enough to prove the chain works, not enough to be a product on its own.
- A security review of that plumbing (Section 9), because the evaluator asked for one directly.
- If time allows after Day 4: a second, smaller pack to prove the system generalizes beyond the flagship.

**Out, deliberately:**
- Unrelated client automation work. Separate build, separate week. Not touched here.
- A web dashboard, accounts, or a hosted service.
- Fleet-wide mandatory enforcement across an organization, autonomous self-approval, a marketplace business.
- Any claim that this controls a model's maximum context window. It does not, and saying so would be a mistake in front of a security-literate evaluator. What it controls is how much context gets loaded and paid for on every request, which is the thing that actually costs money.

---

## 5. The flagship pack: Context and Cost Hygiene

Built from a real, ongoing investigation on a live client project, not a hypothetical. The investigation corrected itself mid-flight, and that correction is part of what makes this pack worth shipping rather than a liability to hide.

**What is verified, independently, twice, and has not moved:** a one-line `awk` bug in a SessionStart hook was injecting far more of a lessons file into every session than intended, because `{f=1} f` sets a flag and then prints to end of file instead of stopping at the next heading. Measured before and after, on two separate passes: 102,941 bytes down to 19,233 bytes. Nothing deleted, the source file untouched. This is the one number in the whole investigation that has been checked twice and hasn't changed. It ships as the pack's first, unambiguous win.

**What was wrong, and matters more than the fix itself:** the first pass at measuring total spend, which mechanism was expensive, and what the likely saving would be contained a 3.28x accounting error, caught by an independent model reviewing the same transcripts. The cause: Claude Code writes several JSONL records per response and each carries the same cumulative usage total, and summing every record instead of deduplicating by request and message id inflated everything downstream. A reported $1,568.88 for one window corrected to $478.40. A month-long session reported at $22,959 corrected to roughly $7,183. Several structural claims flipped outright: subagents were reported near 1% of spend and were actually 13%; a claim that a particular hook could not modify tool output turned out to be false; a theory that gate output dominated cost turned out to be about 4% of it; a claimed 46% saving was withdrawn as unsupported.

**What the corrected measurement shows, as findings with their uncertainty attached:** cache writes, not fresh input or output, are the largest cost component. The evidence points at two causes: large single tool results (reads or writes in the hundreds of kilobytes) forcing a full context rebuild, and sessions left idle long enough for the cache's time-to-live to lapse before returning to a large context. Thirteen of twenty-two large writes followed a gap past the TTL; several others followed short gaps with no obvious large result, and those remain unattributed. Fixing the arithmetic did not establish every causal story, and the pack's docs say so. The two supported causes are addressable by specific, narrow behavior: never load a large file into context raw, summarize or grep it from disk instead; end finished work with a short handoff note rather than leaving a large context warm and walking away for hours.

**What is still open, and correctly labeled open:** the true size of any saving. Reconstructed dollars are not the plan's own subscription meter, and the honest position, stated inside the investigation itself, is that the size of the win is unknown until a corrected measurement script runs for a full batch and is checked against real quota consumption, not against its own earlier draft.

### How the pack's own claims get checked, in three tiers

**Tier 1, the only number that decides whether anyone runs out.** The status line does not just display quota, it logs it: every refresh appends quota percentages to a local file, because that is actual metered consumption and no reconstruction of spend can substitute for it. What is now verified about the payload: on Pro and Max plans it carries `rate_limits.five_hour` and `rate_limits.seven_day` (each with `used_percentage` and `resets_at`), only after the first response in a session, and users have reported the object going missing entirely at times. What it does not carry, per an open issue from September 3: the model-specific weekly bar that `/usage` shows as a third line. If the ceiling hit on September 15 was that per-model window, the status line cannot see it. So Tier 1 is two logged numbers plus one hand-recorded number, and the log treats an absent field as unavailable, never as zero.

**Tier 2, a frozen baseline, committed before anything changes.** Run the corrected meter over a window before the pack ships anything, and commit the result as `docs/USAGE_BASELINE.md` with the exact script version that produced it. A baseline written after the change is not a baseline.

**Tier 3, per merged batch, not per day.** The work is batch-shaped, and a day-over-day comparison is confounded by how heavy any given day happened to be. The metric is quota percentage points per merged batch, not per calendar day. But one batch is not a controlled unit either: two batches differ in complexity, other account activity shares the same quota, reset boundaries fall wherever they fall, and a small real effect can hide inside the resolution of a percentage. So Tier 3 is repeated comparisons of similar work, and every comparison records completion quality, runtime, and interventions beside quota. Reduced context is only a win if the developer still got the necessary result.

**The scorecard**, so a null result is attributable rather than mysterious. Every counter below comes from the plan's own transcripts, not from a reconstruction:

| Fix | Counter | Baseline | Target |
|---|---|---|---|
| Hook fix | Starting context tokens | Reproduce from fixture: original awk vs repaired awk on the same lessons file | The first draft estimated about 27K from bytes/4; do not state a number until re-measured with `claude plugin details` or `count_tokens` |
| No large file reads | Results over 50KB per batch | 433 to 476KB reads observed | Zero over 200KB |
| Idle-gap discipline | Cache writes of 50K+ tokens per batch | 26 events, 7.59M tokens | Under 5 |
| Idle-gap discipline | Share following a TTL-expiring gap | 13 of 22 | Under 3 |
| Gate wrapper | Gate bytes entering context | About 214KB of 5.48MB | Under 20KB |
| Subagent discipline | Subagent share of spend | 13% | Flat, same work done |

**The failure condition, stated in advance and sized honestly.** After one batch, if the Tier 3 counters move and Tier 1 quota does not, the correct label is "quota benefit not yet demonstrated," not "the fixes did not matter." One batch cannot carry that conclusion. If the pattern holds across several comparable batches, with other account activity and reset boundaries accounted for, then the reconstructed cost model is not tracking what the plan actually meters, and the work should rebuild on Tier 1 alone rather than keep optimizing a proxy. No published formula translates cost to plan consumption, so this is a live possibility, not a formality, which is why Tier 1 is logged from Day 1: to make the question answerable in days rather than weeks. A fix that moves its own counter but never moves the number that actually matters is a fix that did not matter, and this scorecard is what makes the difference visible instead of silent.

**The hook is already fixed, so tomorrow's baseline is not its "before."** Preserve both awk forms as fixtures with a sample lessons file and a test that runs them side by side, so the before-and-after is reproducible by anyone. The Tier 2 baseline then covers the state after the hook fix, and measures the effect of everything that ships next.

### What this pack ships as

- `skills/context-hygiene/SKILL.md`: the behavioral rules that survived correction (end sessions deliberately rather than clearing mid-task or letting a large context idle past the cache time-to-live; never load a large file raw, summarize or grep it on disk; batch independent shell commands; fan-out reads belong in subagents, which are real cost, not free workers).
- `hooks/session-start-checklist.sh`: the fixed, bounded version of the awk script. The one component shipped with full confidence.
- `scripts/token-cost.mjs`: a corrected usage meter, deduplicated by request and message id, walking subagent transcripts, with an explicit timezone. It ships with a fixture set of synthetic transcripts with known expected totals (duplicate records, separate requests, subagent records, each cache-usage category) and a test that asserts them, so "we corrected our measurement" is something a stranger can verify by running one command, not something they take on the word of a second model that read the same transcripts. Then it reproduces a real window. Shipping the meter and its tests, not just a number it once produced, is the point.
- `hooks/statusline-quota.sh`: a status line that logs the two quota windows the payload carries (`five_hour`, `seven_day`), records an absent object as unavailable, and prints a standing reminder that the per-model weekly window has to be read from `/usage` by hand. Any reconstructed dollar figure, if shown at all, is labeled reconstructed and secondary.
- `hooks/config-drift-check.sh`: flags when a settings file's declared model or version does not match what the running session actually reports, since this investigation caught exactly that kind of silent drift by accident.
- `scripts/gate.mjs`: wraps the existing test or verify command rather than duplicating a second list of checks that will drift from it, preserves the real exit status, writes complete output to a log, and prints one deterministic summary. This is what the scorecard's "gate bytes entering context" counter measures.
- `scripts/setup.mjs`: the setup step. Shows the diff it would make to `~/.claude/settings.json` (status line) and offers the `CLAUDE.template.md` snippet for the project's own `CLAUDE.md`, backs up before writing, applies only on `--apply`, and restores from backup on `--undo`. Because a plugin cannot set these itself, this is what turns "installed" into "working."
- `CLAUDE.template.md`: a trimmed, table-shaped snippet a team merges into its project `CLAUDE.md` via the setup step, kept honest about which rules in it are enforced by a hook and which depend on a person choosing to follow them. Behavioral rules that must load into the model's context ship in the skill, not here.

### The honesty rule for this pack's evidence, non-negotiable

Do not put a specific dollar figure or percentage saving on this pack's evidence card, in the README, in the one-pager, or in the recording, unless it was produced by the corrected meter and cross-checked the way this investigation was cross-checked. The story of catching a 3.28x error reads as more credible in front of a security-literate evaluator than a clean, unverified number ever would. Say plainly what is known for certain (the hook fix), what is still being narrowed (cache-write causes), and what tool exists so the customer never has to trust anyone's arithmetic (the corrected meter).

---

## 6. Second pack, if time allows (optional, Day 4 onward)

`wording-guard`: enforces a client's restricted-wording list (phrases the product may never use in its copy) in AI-produced copy. Kept in the plan because its acceptance check is a zero-cost regex over produced text, which makes it cheap to prove and a good second data point that the packaging system generalizes past the flagship. Cut without guilt if Days 1 through 3 run long.

---

## 7. The onboarding one-pager

One page, per pack, structured the same way every time so a person who has read one has read them all:

1. What this pack does, in one sentence.
2. What changes on your machine the moment you install it (be exact: which files, which settings, which hooks).
3. What you'll notice day to day (the quota status line, shorter session starts, gate output landing in a log file instead of the conversation).
4. What you're still responsible for (the behavior-dependent habits from Section 5, named as habits, not guarantees).
5. Who to ask, and how to propose a change to the pack.
6. The question a technical evaluator or a skeptical engineer asks first: why not build this ourselves. Answer it directly, in the README, not just in a sales conversation: you can, this exists so you do not start from zero, it is time-tested against a real measured problem with real numbers behind it, and forking it to make it yours is the intended path, not a fallback.

Written twice in tone, not content: a "for your first week" pass with no jargon, and a "for the person maintaining this" pass with the file paths and commands. Same facts, different reader.

---

## 8. Packaging and plumbing (condensed from the original plan)

This section exists to make Package and Harness safe to hand to a whole company, not to be the pitch.

- Each pack lives at `packs/<pack>/plugins/<plugin>/`, installed through Claude Code's native plugin and marketplace system (`.claude-plugin/marketplace.json`, `/plugin marketplace add`, `/plugin install`).
- A proposal is a pull request. CI runs `claude plugin validate` and, where the pack has behavior to test, `claude plugin eval`, and commits the result under `evidence/<commit-sha>/`. Claude Code's own eval command already produces the with-plugin vs without-plugin comparison; Skillgate does not rebuild that.
- A release binds an approval to an exact commit SHA and content hash, not a branch name. The marketplace entry is pinned by SHA, not just by ref, because a ref-only pin is silently mutable.
- `skillgate verify` hashes what actually got installed on a machine and compares it against the release record: VERIFIED, TAMPERED, UNKNOWN VERSION, or WITHDRAWN. Withdrawing a release removes it from the catalog; it does not, and must never be described as, disabling copies already installed elsewhere.
- `claude plugin eval` runs in isolation: no personal or project settings, hooks, or `CLAUDE.md` load. A passing eval proves the skill steers the model; it proves nothing about whether the setup step, an existing status line, and a developer's own hooks coexist on a real machine. The fresh-install walkthrough (Day 6) is the only test of that, and it must end with a clean removal (`skillgate setup --undo`, `claude plugin uninstall`). For any eval run against client material, pass `--no-publish` and review the report before anything reaches the public repo.
- Where the commands live: `setup`, `gate`, and the meter exist today as `scripts/*.mjs`. `evidence`, `release`, and `verify` are built on Days 2 and 3 and do not exist at clock start. Nothing in this plan should be read as claiming they already work.
- Personal skills outside the pack are never touched. This is what keeps "harnessing" from feeling like surveillance: the pack governs what the company ships, not what an individual does on their own.

---

## 9. Security review

The evaluator asked directly for penetration testing and a security review of how skills are packaged and distributed. Keep this section even though it is not the headline.

**Scope statement, verbatim in the report:** this is a targeted security review of Skillgate's own release and installation path, performed in disposable repositories and environments. It is not a penetration test of the evaluator, any client, or any production system, and it is not independent certification.

**Attack cases:**

| # | Attempt | Expected result | What it teaches |
|---|---|---|---|
| A1 | A pack whose eval suite scores a perfect result while its hook reads a dummy secret from the environment and writes it out | Eval passes. The hook still ran, because hooks execute as the user, outside the eval sandbox. | A passing test suite is not a safety guarantee. |
| A2 | Approve at commit A, push commit B to the same branch, install from a ref-only entry and from a SHA-pinned entry; then modify a file in the installed copy of A | Ref-only entry installs B. SHA-pinned entry keeps installing A (the docs say the pinned commit is checked out directly; that is the protection working, not a refusal). `skillgate verify` reports three distinct states: approved A installed = VERIFIED; unapproved B installed = UNKNOWN VERSION; A's files modified after install = TAMPERED. | A branch pin is not an approval, and "unapproved" and "tampered" are different failures with different remedies. |
| A3 | A path in a plugin manifest that tries to escape the plugin directory | Rejected by the platform's own loader. | Confirm native controls actually hold before claiming credit for them. |
| A4 | Release attempted without a required review passing, and separately, an attempt to run the release workflow from a branch or identity that should not hold release credentials | Branch protection refuses the merge. The release job itself, under environment protection, refuses to run without an approved deployment and never exposes the publish credential to the eval job. Branch protection alone proves nothing about who can publish; the actual workflow and its credentials are what get tested. | Authorization is checked by the system that receives the action, never by what a screen displays. |
| A5 | A withdrawn release, still installed, run again | It still runs. `verify` reports WITHDRAWN. | Withdrawal is not revocation; never imply otherwise in the docs. |

Report structure: scope, threat model, each case's setup and result, fixes and retests, and a closing list of what was not tested and why.

---

## 10. Schedule with gates

**Day 0 (the evening of September 15; anything not done rolls into the first hour of Day 1).** Confirm `claude --version` is 2.1.269 or later and that `claude plugin eval --help` responds. Confirm your machine's sandbox backend. Decide the CLI language (TypeScript, for the Node-native fit with the plugin ecosystem, per our earlier conversation) and the license. Reply to the evaluator naming September 16 as the clock start.

**Day 1.** In this order. Run the meter's fixture test and make it pass. Reproduce the known real-window figures with it. Only then commit the Tier 2 baseline (`docs/USAGE_BASELINE.md`) with the meter's script version, before anything else changes. Run `scripts/setup.mjs` (show, apply, undo, confirm byte-identical, apply again and leave it on) so the status line is logging `five_hour` and `seven_day`; if the payload lacks them on your account, note that in the baseline and record by hand. Record the per-model weekly percentage from `/usage` by hand regardless. Pull the fixed hook and the trimmed `CLAUDE.md` shape out of the live client-project investigation and into the `context-hygiene` pack structure. Commit both awk forms as fixtures and run the side-by-side hook test so the before-and-after is reproducible. Write the onboarding one-pager's first draft.
Demo: the committed baseline, the passing meter test, the packaged hook fix verified with a fresh session, the status line logging `five_hour` and `seven_day`, and the per-model weekly number recorded by hand from `/usage`.

**Day 2.** Harden `scripts/setup.mjs` against a settings file that already has a status line (chain, don't clobber) and wire the gate wrapper (`scripts/gate.mjs`) into the pack. Start `skillgate evidence` and the release record writer. Test the gate wrapper both ways: a passing run prints one summary line, a deliberately broken run prints the failure and a log path and exits non-zero. Open the pack as a pull request; CI runs validate and, where applicable, eval; evidence is committed against the PR's commit SHA.
Demo: `setup --apply` then `setup --undo` leaving the settings file byte-identical, the status line logging a real quota read, and the gate wrapper catching a real failure.

**Day 3.** Merge, release, pin by SHA. Fresh install on a clean machine or directory. `skillgate verify` passes. Tamper a file in the installed cache; `verify` catches it.
Demo: install to verify to tamper, the full loop. This is the minimum credible submission; everything after this is additive.

**Day 4.** Put the pack into real use on ongoing client-project work: the first real batch since the Tier 2 baseline. Run the Tier 3 comparison and check every row of the scorecard against it, recording completion quality, runtime, and interventions beside quota. One batch yields "demonstrated" or "not yet demonstrated," nothing stronger. If time allows, start the `wording-guard` pack as the second proof point.

**Day 5.** Security day. Run A1 through A5 in a disposable repo. Fix what is fixable. Draft the report.

**Day 6.** A second person installs the pack fresh on their own machine, using only the one-pager and the README, runs the setup step, gets useful behavior, then removes it cleanly (`setup --undo`, `plugin uninstall`) and confirms their configuration is back to what it was. Fix every point where they got stuck. That friction log, including the removal, becomes part of the submission.

**Day 7.** No new work. Recording, the note, the security report, a limitations section, final pass on the one-pager for an inheritor who was not in the room this week, and an explicit statement of what Tier 1 showed: demonstrated, not yet demonstrated, or contradicted, with the batch count behind it. The submission stands on the honesty of that statement, not on which of the three it is.

---

## 11. What you will teach them

1. **The bug that was quietly taxing every session.** A one-line `awk` mistake injecting far more of a lessons file into every session than intended. Concrete, fixable, verified twice, and it happened on a real project.
2. **Your own first measurement was wrong, and catching it is the actual lesson.** A 3.28x accounting error in how token usage was summed, caught by an independent model cross-check rather than by re-reading the same script. Several confident claims from the first pass, including which mechanism was expensive and by how much, did not survive. Teaching evaluators that verifying your own tooling's claims matters more than the size of a savings number is a stronger moment than a clean, unchecked statistic would have been.
3. **A passing test is not a safety guarantee.** A1 from the security review, live: a pack that scores perfectly on its eval while its hook quietly reads a secret. Passing behavior tests and being safe are different claims.
4. **The failure condition was written down before the result was, and sized to what one week can prove.** The scorecard states in advance what would eventually prove the cost model wrong: proxy counters moving, repeatedly, while the real quota number does not. It also states what one batch can say, which is only "demonstrated" or "not yet." Naming the disproof before running the test, and refusing to overclaim from a single run, is what turns a measurement into something other than a marketing claim.

---

## 12. Submission package

- Runnable: the pack, installable with one marketplace add and one install command, plus the plumbing behind it.
- The one-pager, in both its first-week and maintainer forms.
- Recording, eight to twelve minutes: the real cost investigation and the bug, the packaged fix, install, verify, tamper, the security case, the second install by someone else.
- The note: what it is, what you would do next (a second and third pack, an org-wide adoption view, per-team customization of the harness rules), what you learned (Section 11, plus anything that surprised you this week).

---

## 13. Do not

- Build a web dashboard or anything with a login.
- Rebuild `claude plugin eval`. Use it.
- Claim this changes a model's maximum context window. It changes what gets loaded and paid for.
- Put any specific dollar figure or percentage saving on a card, in the README, or in the recording that was not produced by the corrected meter (`scripts/token-cost.mjs`) and cross-checked. The investigation's first pass was wrong by 3.28x; treat every number from it as provisional until re-measured.
- Call the security review a penetration test of the evaluator or any client.
- Touch unrelated client automation work this week.
- Let a gate ship wide enough that its first false positive gets it disabled.
- Trust or publish any fix's effect before the Tier 2 baseline is committed and Tier 1's quota logging path is confirmed working. A baseline written after the change is not a baseline.
- Say or imply that installing the plugin configures everything. It installs the skill and the hook. The status line, any defaults, and project instructions are applied by the setup step, visibly and reversibly, or not at all.
- Conclude from one batch that the fixes did or did not matter. One batch supports "demonstrated" or "not yet demonstrated" and nothing stronger.

---

## 14. Verified facts this plan relies on (as of September 16, 2026)

- `claude plugin eval` exists from Claude Code v2.1.269 onward: runs a plugin's behavior against test cases, compares with-plugin and without-plugin results, and writes a JSON and HTML report.
- Git-based plugin sources accept both a ref and a SHA; when both are set, the SHA is the effective, immovable pin.
- The plugin loader and marketplace validator reject manifest paths that try to escape the plugin directory.
- Plugin hooks and MCP servers run as the user, outside the eval sandbox; a passing eval suite does not certify that a plugin's hooks are safe.
- The dollar and token figures originally drafted for Section 5 were checked and found wrong by 3.28x, due to a JSONL deduplication error; Section 5 above reflects the corrected investigation as of September 15. Treat even the corrected figures as provisional until `scripts/token-cost.mjs` runs clean and reproduces them independently.
- The status line payload carries `rate_limits.five_hour` and `rate_limits.seven_day` on Pro and Max plans (each with `used_percentage` and `resets_at`), appearing after the first response of a session; users have reported the object absent at times, so the logger treats a missing field as unavailable. The model-specific weekly window shown as a third bar in `/usage` is not in the payload (open issue, September 3, 2026) and must be recorded by hand.
- A plugin's `settings.json` supports only the `agent` and `subagentStatusLine` keys, and a `CLAUDE.md` at the plugin root is not loaded as project context. Main-session status line, defaults, and project instructions require the setup step.
- A SHA-pinned git plugin source checks out the pinned commit directly, so it keeps installing the approved commit after the branch moves; it does not refuse. Verified in the marketplace docs; this corrects an earlier draft of A2.
- `claude plugin details <name>` reports a plugin's always-on and on-invoke token cost using the `count_tokens` API. Use it, not bytes divided by four, for any token figure on a card.
