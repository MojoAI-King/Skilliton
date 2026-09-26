# The fleet is every company computer, harnessed the same way through device management

Kind: Living. Decision entry.

- **ID:** 2026-09-26-the-fleet-is-every-company-computer-harn-e1d4
- **Status:** accepted
- **Date:** 2026-09-26

## Decision

"The fleet" means every computer the company runs, developers' laptops and always-on machines alike, each harnessed the same way: the same signed release of the same skills, rules, guard and gate, pushed through the company's device management (Intune named by the owner), so that compliance stays accurate and current, conflicts are found and resolved sooner, security and tasks are done well, and token use and cost go the right way. The first milestone is therefore enrollment through device management (M12), not autonomous agents: a machine that device management sets up ends VERIFIED against the newest approved release with no developer command, and any repository a person clones is offered the harness at its first session (M8). Autonomous agents that take work on their own come after, and take it from GitHub issues.

## Why

The owner, asked what the first fleet machine should build: "I'd rather the fleet is just harnessed, that's all I really care about at the end of the day ... can the fleet be harnessed to have the right skills in place so it functions properly, and then it's pushed to all your computers and has the Intune stuff". Uniformity is the product; an always-on agent is one more kind of machine inside it. Most of the parts exist and are measured: one join file sets up a machine (marketplace, plugins, signers, the command on the path), `verify` reads every install against the signed manifest, `pin` holds a machine at a release, preflight names what endpoint security would block, and the session start offers preparation in a repository that has none.

## Alternatives rejected

- Autonomous agents first, on one always-on machine: it answers a question the owner did not ask first, and it would run on a harness that is not yet rolled out to the people it must match.
- A file in each repository as the agents' work queue: two machines editing the same file collide; GitHub issues let a person add work from a phone and let a machine take an item by assigning it to itself.

## Risk

- Nothing here is proved on a machine enrolled in Intune: the device-management half of M12 is measured on Linux only (B22), and a clean Mac and a Windows PC under a real tenant are the owner's to provide (B29, B30).
- A private repository (decision 2026-09-26-skilliton-becomes-a-private-repository-ebc3) means each enrolled machine needs a read credential for GitHub: a per-person sign-in, or one read-only credential that device management places. Which one is not decided; a machine credential is a secret and follows the secrets rules.
- B102 must be fixed first: `pin` drops a project's project-scope installs when it moves the marketplace, which on a fleet is every machine at every update.

## Reversibility

EASY. This orders the milestones; nothing is built by the decision itself.

## Evidence

The owner's answers of 2026-09-26 (the fleet pilot answer quoted above; "GitHub issues" for the work queue). PLAN.md v4 milestones M8 and M12 and their state; backlog B22, B29, B30, B102; evidence/live/2026-09-21-private-repository.md.
