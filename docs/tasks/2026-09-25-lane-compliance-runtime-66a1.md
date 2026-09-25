# Task: Lane compliance-runtime

Kind: Living. Task record.

- **ID:** 2026-09-25-lane-compliance-runtime-66a1
- **State:** in-progress
- **Branch:** lane/compliance-runtime-0925
- **Owner:** unassigned
- **Updated:** 2026-09-25T04:54:28.553Z

## Request

LANES.md, dispatched 2026-09-25: the items below are this lane's whole scope, and work that is not among them belongs to another lane.

## Acceptance criteria

- [x] N2. [FEATURE] Detection, `skilliton compliance scope`: packs/base/plugins/workflow/runtime/lib/compliance-scope.mjs (new), packs/base/plugins/workflow/runtime/commands/compliance.mjs (new), packs/base/plugins/workflow/runtime/skilliton.mjs (the GROUPS list at :22-67 gains `compliance`), packs/base/plugins/workflow/runtime/lib/config.mjs (the compliance section, :49 and :192-198 are where security's is read), scripts/compliance-scope.test.mjs (new), scripts/fixtures/compliance/ (new): a port of MojoComply's engine/src/scope.ts (files read :386-396: .mojocomply.yaml, CLAUDE.md, COMPLIANCE.md, README.md, README.txt, SECURITY.md, package.json at the root and package.json one level down in apps/, packages/, services/, workers/; the 512 KB cap, the negation window and at most 3 hits per signal :398-413 and :449-495; the 21 repo_scan detectors :131-382; the scoring and recommendation shape :654-672; the auto-record gate :694-701; the report shape :708-725) reading the knowledge base from frameworks/scope-kb.json; `scope` prints the proposal in plain words (frameworks, confidence, the file and line of each signal, the intake questions, the disclaimer) or `--json`; `scope --apply --decided-by <person>` writes .skilliton/compliance/scope.json (the readScope shape above, decidedAt now, in the past on read) with a backup, and refuses with exit 2 and nothing written when --decided-by is missing or empty; `scope` never writes anything else, never reads outside the project, and never reads MojoComply at run time. Fixture tests: a repository with planted phrases for each signal proposes the frameworks the knowledge base says (assert per signal), a clean look-alike (the phrase inside a negation window, or in a file the scanner does not read) proposes nothing, a file over the cap is skipped and named, and --apply without a person is refused. Done looks like: `skilliton compliance scope --json` on a fixture prints the same JSON twice.
- [x] N3. [FEATURE] The crosswalk and the sheet, `skilliton compliance sheet`: packs/base/plugins/workflow/frameworks/baseline-2-to-nist-csf-2.json (new: for each of the 15 controls in packs/base/plugins/workflow/catalogs/skillgate-baseline-2.json, the NIST CSF 2.0 subcategory ids it supports, a strength strong|partial, and a one-line reason; mark the file `"reviewed": false` with a `reviewedBy` field for the owner to fill), packs/base/plugins/workflow/runtime/lib/compliance-sheet.mjs (new), commands/compliance.mjs (`sheet [--json] [--apply]`), scripts/compliance-sheet.test.mjs (new): the projection reads scope.json, each in-scope library and its crosswalk from the plugin's frameworks/ folder, and the project's security records and applicability through the security module's own readers (lib/security.mjs: records :66-83, applicability :164-171, freshness in evaluateSecurity :285-348; never re-implement them), and for every framework control walks control -> csf ids (the library's crosswalk) -> baseline controls (the new crosswalk) -> records: state evidenced when every mapped baseline control has a current observed record, partial when some do or some are stale, not_started when none, not_applicable when the framework control's applicability gate or the baseline applicability says so; each row lists the record ids behind it and, when not evidenced, what a person must supply (the control's expected evidence types from the library); `sheet --apply` writes the file named by compliance.sheetFile between `<!-- skilliton:compliance-sheet:start -->` and `:end` markers with a backup, a title "Control record", the generated line, the disclaimer (assessment, never a certification), the independence line from compliance.builtByCompany, a "Frameworks in scope" table, a "Where the evidence stands" count line, the controls table (control, citation, state, evidence, needs a person), and an inputs fingerprint line, and prints how many rows changed; `sheet --json` prints computeSheet's result. Pure functions over their inputs, tested on a synthetic project (a temp repository with a catalog, two records, one stale, one applicability decision, a fixture library of six controls and a fixture crosswalk): every state appears at least once, the counts add up, a second --apply changes zero rows, and the file is byte-identical across two runs. Done looks like: the synthetic project's sheet names exactly which control needs a person and why.
- [ ] N4. [TOUCH] The banned-word check: scripts/compliance-words.test.mjs (new): fails when the sheet written by the N3 test, the text `compliance.mjs` prints, or any file under packs/base/plugins/workflow/frameworks/ contains the words "compliant", "certified", "certify" or "passes" (case-insensitive, whole words; the frameworks JSON may quote a regulation's own text, so for those files only the words "compliant" and "certified" are checked outside a `citation` or `requirement` field); it is a check that can fail: prove it by pointing it at a fixture that contains the word. Done looks like: the test's own self-check (`--self-test`) shows the failure, then the shipped run passes.

## Decisions

not yet written

## Checkpoints

### 2026-09-25T04:47:35.298Z

- **State:** N2 done: skilliton compliance scope (port of MojoComply scope.ts: 7 root files plus workspace manifests, 512 KB cap, negation window, 3 hits per signal, 21 detectors, scoring and recording gate) with --json and --apply --decided-by; config compliance section; fixture knowledge base
- **Evidence:** node scripts/compliance-scope.test.mjs: 11 pass, 0 fail, 1 skipped (the shipped scope-kb.json case, until the frameworks-data lane merges); lint, lint-shape, footprint, write-sites, skilliton, docs, names, packs, allowlist, config tests exit 0
- **Next:** N3: baseline crosswalk and compliance sheet
- **Git:** lane/compliance-runtime-0925 @ 253cf54, 8 uncommitted

### 2026-09-25T04:54:28.553Z

- **State:** N3 done: frameworks/baseline-2-to-nist-csf-2.json (15 controls, reviewed false, reviewedBy null) and skilliton compliance sheet [--json] [--apply] over lib/compliance-sheet.mjs (computeSheet, sheetStatus, writeSheet), reading records and applicability only through evaluateSecurity
- **Evidence:** node scripts/compliance-sheet.test.mjs: 6 pass 0 fail (every state, counts add up, second --apply changes 0 rows, byte-identical); compliance-scope, lint, lint-shape, deadcode, footprint, write-sites, skilliton, packs, docs, allowlist, names exit 0
- **Next:** N4: banned-word check
- **Git:** lane/compliance-runtime-0925 @ f0766da, 10 uncommitted

## Handoff

- **State:** N3 done: frameworks/baseline-2-to-nist-csf-2.json (15 controls, reviewed false, reviewedBy null) and skilliton compliance sheet [--json] [--apply] over lib/compliance-sheet.mjs (computeSheet, sheetStatus, writeSheet), reading records and applicability only through evaluateSecurity. Evidence: node scripts/compliance-sheet.test.mjs: 6 pass 0 fail (every state, counts add up, second --apply changes 0 rows, byte-identical); compliance-scope, lint, lint-shape, deadcode, footprint, write-sites, skilliton, packs, docs, allowlist, names exit 0.
- **Next:** N4: banned-word check
- **Blocked:** nothing
- **Watch out:** nothing known
