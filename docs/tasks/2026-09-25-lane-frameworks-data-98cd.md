# Task: Lane frameworks-data

Kind: Living. Task record.

- **ID:** 2026-09-25-lane-frameworks-data-98cd
- **State:** merged
- **Branch:** lane/frameworks-data-0925
- **Owner:** unassigned
- **Updated:** 2026-09-25T05:16:25.452Z

## Request

LANES.md, dispatched 2026-09-25: the items below are this lane's whole scope, and work that is not among them belongs to another lane.

## Acceptance criteria

- [x] N1. [FEATURE] Frameworks as data: scripts/frameworks-convert.mjs (new), packs/base/plugins/workflow/frameworks/*.json (new), scripts/frameworks.test.mjs (new): a plain-Node converter with no YAML dependency (a minimal reader for the three shapes MojoComply uses: framework, crosswalk, evidence map; block mappings, sequences, quoted and folded scalars, comments; refuse anything else with the line number) that reads a MojoComply checkout's frameworks/{hipaa-security-rule,hipaa-privacy-breach,part2-overlay,ftc-safeguards,ny-dfs-500,nist-csf-2}.yaml (path set via FRAMEWORKS_SOURCE_DIR -- kept out of this repo, since it is a personal machine path; see scripts/frameworks-convert.mjs's own header) and the matching crosswalks/*-to-nist-csf-2.yaml (shapes: engine/src/schema.ts:13-71 meta, :110-128 control, :95-108 applicability, :185-211 crosswalk; only libraries whose meta.status is approved), plus scoping/applicability.yaml into frameworks/scope-kb.json with the YAML's own keys unchanged (scoring at :30-37, signals :60-250, frameworks :256 on, candidates :500 on), and writes one JSON file per library and per crosswalk carrying meta.sources as provenance and an `attribution` string naming the public-domain source; health-wellness and legal-safeguarding are converted only if their control text is original wording (read their meta.note and sources; say which way it went); soc2-tsc and pci-dss-v4 are never converted (AICPA and PCI SSC copyright; the reason goes in the report for docs/security-catalog-sources.md, main-only). The test: the converter is deterministic (run twice, byte-identical), each JSON validates against a schema the test holds (ids unique, every control has a citation, every crosswalk control_id exists in its library, every csf id exists in the spine), the refusal on a malformed sample names the line, and the committed JSON equals a fresh conversion (so the committed data and the converter cannot drift). Add a size pin for the converter in scripts/lint-shape.test.mjs the way other pinned files are listed, if that file pins by name. Done looks like: `node scripts/frameworks-convert.mjs --check` exits 0 on the committed data and 1 when a JSON is edited by hand (evidence: `FRAMEWORKS_SOURCE_DIR=<MojoComply checkout> node scripts/frameworks-convert.mjs --check` exits 0 against the 16 committed JSON files, and 1 after hand-editing one; `node scripts/frameworks.test.mjs` passes 87 checks, 0 failed (2 source-dependent checks report NOT RUN when FRAMEWORKS_SOURCE_DIR is unset); `node scripts/lint.test.mjs`, `node scripts/lint-shape.test.mjs` and `bash scripts/scrub-check.sh` all pass on the new files; no size pin needed in scripts/lint-shape.test.mjs, since its RUNTIME_RE only covers packs/*/plugins/*/runtime/*.mjs and this converter lives under scripts/, which that file does not pin by name; health-wellness and legal-safeguarding judged original wording and converted, soc2-tsc and pci-dss-v4 never converted -- reasoning in scripts/frameworks-convert.mjs's own header and in this lane's report for docs/security-catalog-sources.md).

## Decisions

not yet written

## Checkpoints

### 2026-09-25T04:55:26.035Z

- **State:** N1 frameworks-as-data converter, test, and JSON output complete and passing
- **Evidence:** node scripts/frameworks.test.mjs: 87 ok 0 fail (2 NOT RUN without FRAMEWORKS_SOURCE_DIR); node scripts/frameworks-convert.mjs --check: exit 0 on committed data, exit 1 after a hand edit; node scripts/lint.test.mjs, node scripts/lint-shape.test.mjs, bash scripts/scrub-check.sh: all pass
- **Next:** hand off to integration branch: docs/security-catalog-sources.md needs the soc2-tsc/pci-dss-v4 exclusion reasoning (main-only, not written by this lane)
- **Git:** lane/frameworks-data-0925 @ 7f6fb4a, 19 uncommitted

## Handoff

- **State:** N1 frameworks-as-data converter, test, and JSON output complete and passing. Evidence: node scripts/frameworks.test.mjs: 87 ok 0 fail (2 NOT RUN without FRAMEWORKS_SOURCE_DIR); node scripts/frameworks-convert.mjs --check: exit 0 on committed data, exit 1 after a hand edit; node scripts/lint.test.mjs, node scripts/lint-shape.test.mjs, bash scripts/scrub-check.sh: all pass.
- **Next:** hand off to integration branch: docs/security-catalog-sources.md needs the soc2-tsc/pci-dss-v4 exclusion reasoning (main-only, not written by this lane)
- **Blocked:** nothing
- **Watch out:** nothing known
