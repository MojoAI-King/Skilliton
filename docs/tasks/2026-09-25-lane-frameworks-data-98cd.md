# Task: Lane frameworks-data

Kind: Living. Task record.

- **ID:** 2026-09-25-lane-frameworks-data-98cd
- **State:** in-progress
- **Branch:** lane/frameworks-data-0925
- **Owner:** unassigned
- **Updated:** 2026-09-25T04:32:42.955Z

## Request

LANES.md, dispatched 2026-09-25: the items below are this lane's whole scope, and work that is not among them belongs to another lane.

## Acceptance criteria

- [ ] N1. [FEATURE] Frameworks as data: scripts/frameworks-convert.mjs (new), packs/base/plugins/workflow/frameworks/*.json (new), scripts/frameworks.test.mjs (new): a plain-Node converter with no YAML dependency (a minimal reader for the three shapes MojoComply uses: framework, crosswalk, evidence map; block mappings, sequences, quoted and folded scalars, comments; refuse anything else with the line number) that reads a folder under the home directory{hipaa-security-rule,hipaa-privacy-breach,part2-overlay,ftc-safeguards,ny-dfs-500,nist-csf-2}.yaml and the matching crosswalks/*-to-nist-csf-2.yaml (shapes: engine/src/schema.ts:13-71 meta, :110-128 control, :95-108 applicability, :185-211 crosswalk; only libraries whose meta.status is approved), plus scoping/applicability.yaml into frameworks/scope-kb.json with the YAML's own keys unchanged (scoring at :30-37, signals :60-250, frameworks :256 on, candidates :500 on), and writes one JSON file per library and per crosswalk carrying meta.sources as provenance and an `attribution` string naming the public-domain source; health-wellness and legal-safeguarding are converted only if their control text is original wording (read their meta.note and sources; say which way it went); soc2-tsc and pci-dss-v4 are never converted (AICPA and PCI SSC copyright; the reason goes in the report for docs/security-catalog-sources.md, main-only). The test: the converter is deterministic (run twice, byte-identical), each JSON validates against a schema the test holds (ids unique, every control has a citation, every crosswalk control_id exists in its library, every csf id exists in the spine), the refusal on a malformed sample names the line, and the committed JSON equals a fresh conversion (so the committed data and the converter cannot drift). Add a size pin for the converter in scripts/lint-shape.test.mjs the way other pinned files are listed, if that file pins by name. Done looks like: `node scripts/frameworks-convert.mjs --check` exits 0 on the committed data and 1 when a JSON is edited by hand.

## Decisions

not yet written

## Checkpoints

## Handoff

- **State:** not yet written
- **Next:** not yet written
- **Blocked:** not yet written
- **Watch out:** not yet written
