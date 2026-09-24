# Assessment note: SG-DEPENDENCY-RISK

Kind: Reference. Evidence note for one security record, written 2026-09-24 by a build session, for the owner to countersign. Paths are repository-relative; runtime/ means packs/base/plugins/workflow/runtime/.

Control: Keep third-party components inventoried, current, and checked for known vulnerabilities (at most 30 days
old). Expected: an inventory of direct and transitive dependencies and where each comes from, and a dated check of
that inventory against known vulnerabilities, with the update time frames the project agreed. Assessment recorded: gap.

## What exists

- No package dependencies: there is no package.json at the root or in any plugin; the only one tracked is the fixture
  scripts/fixtures/demo-app/package.json. scripts/lint.test.mjs rule no-dependencies fails on any other, with the
  self-test cases "a package.json in the repository fails" and "a package.json in a plugin fails". (The brief named
  scripts/footprint.test.mjs; that suite checks no network, no admin rights and nothing left running, not packages.)
- The components that remain: Node.js 22 or later and git (README.md, INSTALL.md), and two GitHub Actions in
  .github/workflows/checks.yml and windows.yml (actions/checkout and actions/setup-node), each pinned to a commit with
  a version comment.

## What is missing

- No single inventory lists Node, git and the two actions with where each comes from.
- No dated check of those components against known vulnerabilities exists (no npm audit, no Dependabot configuration,
  no advisory review note), so nothing here can be under 30 days old.
- No update time frames are agreed or written down.
