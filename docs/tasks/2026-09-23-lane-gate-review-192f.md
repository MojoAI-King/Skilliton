# Task: Lane gate-review

Kind: Living. Task record.

- **ID:** 2026-09-23-lane-gate-review-192f
- **State:** merged
- **Branch:** lane/gate-review-0923b
- **Owner:** unassigned
- **Updated:** 2026-09-23T20:18:08.807Z

## Request

LANES.md, dispatched 2026-09-23: the items below are this lane's whole scope, and work that is not among them belongs to another lane.

## Acceptance criteria

- [x] N83. [FEATURE] The gate protects the program that runs its checks: lib/delivery.mjs `evaluateUpdate` (line 350 at the base; the guarded list is built at line 379 from `policy.policyPaths` plus the policy file), new lib/delivery-protect.mjs: the policy gains an optional `protectedPaths` list (folders end with `/`, files exact); when it is absent, the default protects every file path that appears as an argument of a check command and exists in the pushed tree (for this repository `scripts/checks.mjs`) plus `.github/workflows/`. A pushed update that changes a protected path is accepted only when the commit that changes it is signed by an approver (the same allowed-signers list the policy signature uses; `git verify-commit` against it in the bare repository, the way the policy signature is verified today); otherwise the push is rejected with a reason naming the path and saying an approver's signed commit is needed, and nothing else in the push is evaluated first (fail before the checks run, so a rewritten check never executes). Reproduced at the base by the adversary: a push that rewrites scripts/checks.mjs to `process.exit(0)` beside a failing test is accepted. Tests in scripts/delivery-protect.test.mjs against a bare fixture repository with a temporary SSH key (scripts/delivery.test.mjs shows how): that push rejected naming the file; the same change in a commit signed by the approver accepted; a normal push accepted; a policy with an explicit `protectedPaths` honoured; a check command whose script is not in the tree does not crash the default. Done looks like: docs/DELIVERY.md and CONTRACTS section 14 sentences written out in LANE_REPORT.md for main.
- [x] N84. [TOUCH] The delivery gate's output reader bounds its partial line: lib/delivery.mjs lines 302 to 309 at the base keep `partial[key]` with no bound, while lib/gate.mjs lines 100 to 107 keep a LINE_LIMIT carry; apply the same bound (a line over the limit is kept as a line and the carry reset) as a same-line edit or through a helper in delivery-protect.mjs. Test: a check that prints 4 MB without a newline finishes with bounded memory and the tail still shows the last lines.
- [x] N85. [TOUCH] The skill writers refuse a hard-linked manifest: lib/skills-repo.mjs `proveInside` (the writers lane of the morning walked links but not `nlink`): a `plugin.json` or destination file with `nlink > 1` refuses with exit 2 and "Nothing was written", naming the file, the way lib/gate.mjs `hardLinked` (line 189) does. Test in scripts/skill-writers.test.mjs: a hard-linked plugin.json refuses; the version does not move.
- [x] N86. [TOUCH] The handoff hook does not follow a link: hooks/session-start-handoff.sh reads the file `handoff.file` names (default docs/HANDOFF.md) and prints its RESUME HERE section; when that path or any folder between the repository root and it is a symbolic link, print one line saying the handoff was not read because the path is a link, and nothing from the file. Test in scripts/hook-fixture.test.sh: a linked docs/HANDOFF.md pointing outside the repository prints the refusal and none of the outside file's text.
- [x] N87. [TOUCH] Evidence freshness reads content, not time: lib/security.mjs lines 222 to 248 at the base skip hashing when size and mtime match (documented in the comment). Hash every listed file every time the manifest is checked (the lists are small: sources of one control); keep size and mtime in the manifest as information; the status line says "content checked". Test in scripts/security-freshness.test.mjs: a 26-byte source changed from `answer = 42` to `answer = 43` with its mtime restored reads `stale`; an unchanged file reads `current`; a missing file reads `changed`.

## Decisions

not yet written

## Checkpoints

### 2026-09-23T19:51:33.166Z

- **State:** N83 done: lib/delivery-protect.mjs holds the files a check runs (default) or the policy's protectedPaths; an unsigned change is rejected before the archive is extracted or any check runs
- **Evidence:** node scripts/delivery-protect.test.mjs exit 0 (4 pass); node scripts/delivery.test.mjs exit 0 (15 pass); with the rule disabled the adversary test fails (the push was accepted)
- **Next:** N84 bounded line reader
- **Git:** lane/gate-review-0923b @ ef5e3a6, 8 uncommitted

### 2026-09-23T19:53:50.815Z

- **State:** N84 done: the delivery gate reads each check stream through lineReader (lib/delivery-protect.mjs), which keeps a carry over 400 characters as a line and resets it
- **Evidence:** node scripts/delivery-protect.test.mjs exit 0 (6 pass); with the bound removed the unit test fails (carry reached 4194304); node scripts/delivery.test.mjs exit 0 (15 pass)
- **Next:** N85 hard-linked manifest refusal
- **Git:** lane/gate-review-0923b @ 7112e6e, 4 uncommitted

### 2026-09-23T19:54:32.685Z

- **State:** N85 done: proveInside refuses a file on the way (plugin.json) with nlink > 1, exit 2, Nothing was written
- **Evidence:** node --test scripts/skill-writers.test.mjs exit 0 (6 pass); with the nlink check removed the new test fails
- **Next:** N86 handoff hook refuses a linked path
- **Git:** lane/gate-review-0923b @ 24a290a, 3 uncommitted

### 2026-09-23T19:56:04.684Z

- **State:** N86 done: the handoff hook checks every component of handoff.file with -L and prints one refusal line, nothing from the file, when one is a link
- **Evidence:** bash scripts/hook-fixture.test.sh exit 0 (Part 3 h1 h2 h3); the base hook fails h1 and h2; bash scripts/handoff-hook.test.sh exit 0 (129 checks); node --test scripts/allowlist.test.mjs exit 0
- **Next:** N87 evidence freshness hashes content
- **Git:** lane/gate-review-0923b @ bdab290, 3 uncommitted

### 2026-09-23T19:58:13.658Z

- **State:** N87 done: verifyManifest hashes every listed file every time; size and mtime stay in the manifest as information; the status Result line says content checked
- **Evidence:** node --test scripts/security-freshness.test.mjs exit 0 (3 pass); with the mtime skip restored the 26-byte test fails; security-evidence, collectors, security-record-refusals, security-propose, maintain-security-collectors, evidence tests exit 0
- **Next:** full checks, LANE_REPORT.md
- **Git:** lane/gate-review-0923b @ ee4fb12, 5 uncommitted

### 2026-09-23T20:03:26.387Z

- **State:** N83 follow-up: the policy-path rule moved into lib/delivery-protect.mjs beside the protected-path rule, sharing holdPaths with unchanged messages; evaluateUpdate 107 lines and delivery.mjs long lines 30, pins lowered in scripts/lint-shape.test.mjs
- **Evidence:** lint-shape, lint, deadcode, scrub exit 0; delivery-protect.test.mjs exit 0; delivery.test.mjs exit 0 (15 pass, the signature mutation now targets delivery-protect.mjs); delivery-integrity exit 0
- **Next:** full checks, LANE_REPORT.md
- **Git:** lane/gate-review-0923b @ ebd84df, 5 uncommitted

## Handoff

- **State:** N83 follow-up: the policy-path rule moved into lib/delivery-protect.mjs beside the protected-path rule, sharing holdPaths with unchanged messages; evaluateUpdate 107 lines and delivery.mjs long lines 30, pins lowered in scripts/lint-shape.test.mjs. Evidence: lint-shape, lint, deadcode, scrub exit 0; delivery-protect.test.mjs exit 0; delivery.test.mjs exit 0 (15 pass, the signature mutation now targets delivery-protect.mjs); delivery-integrity exit 0.
- **Next:** full checks, LANE_REPORT.md
- **Blocked:** nothing
- **Watch out:** nothing known
