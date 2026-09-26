# Skilliton becomes a private repository

Kind: Living. Decision entry.

- **ID:** 2026-09-26-skilliton-becomes-a-private-repository-ebc3
- **Status:** accepted
- **Date:** 2026-09-26

## Decision

All of Skilliton becomes private: the repository on GitHub (MojoAI-King/Skilliton) is switched from public to private, and everything the company adds to it, the fleet harness, licensed framework libraries, evidence collection and the auditor packet, lives in this one repository instead of a second private one. The owner chose this on 2026-09-26 over a separate private repository beside a public base and over MojoComply's repository. It takes effect when the owner changes the repository's visibility, which is the owner's step (a GitHub setting, outward-facing and not undone cleanly); until then the repository is public and the rules for public material still hold.

## Why

The owner's goal is one harness for every company computer and developer, with compliance built in. A public base plus a private repository would have kept the open-source story at the cost of two repositories, two marketplaces and an extension point the public side does not have yet (decision 39ef found that a second plugin cannot add a `skilliton` command, a collector or shared code). One private repository removes that boundary, lets licensed framework text live beside the engine under each framework's own terms, and matches how the company will use the tool: internally, on its own machines.

## Alternatives rejected

- A separate private repository beside a public Skilliton: two things to release, sign and install, and a public/private boundary through the middle of the compliance feature.
- MojoComply's repository as the private home: its files and history hold client folders, and every company machine would install from it.

## Risk

What changes when the repository goes private, each to check before or right after the switch:

- **The branch rule.** Ruleset 23792740 (no deletion, no force-push, signed commits on main) is what protects main. Whether GitHub enforces rulesets on a private repository owned by a personal account depends on the account's plan; GitHub's pages read on 2026-09-26 did not state it plainly, and this session could not read the plan (its token has no billing scope). Unverified. The check after the switch: `gh api repos/MojoAI-King/Skilliton/rules/branches/main` must list deletion, non_fast_forward and required_signatures; an empty list means main is unprotected and the plan must change before anyone relies on it.
- **CI minutes.** Actions on a private repository draw from the account's included minutes, and Windows runners count more than Linux ones; `checks.yml` runs on every push (Ubuntu) and `windows.yml` on pushes too. How many minutes the plan includes was not read here.
- **Every machine needs GitHub access to install and update.** A private marketplace is cloned with the machine's own Git credentials. Installing from a private repository with signed tags is measured (evidence/live/2026-09-21-private-repository.md), but for device management each machine needs a read credential or each person a GitHub sign-in; that is part of decision 2026-09-26-the-fleet-is-every-company-computer-harn-e1d4.
- **The public site.** skilliton.dev shows install commands against the public repository; they stop working for anyone outside the company. What the site should say is the owner's call; this session does not edit the site.
- **What is already out stays out.** Every release up to 1.5.0 was published under the MIT licence; anyone who has a copy keeps those rights. Going private stops new publication, it does not withdraw the old.
- Measured on 2026-09-26: the repository has 0 stars and 0 forks, so no public fork is left behind.

## Reversibility

MODERATE. Visibility can be switched back; with 0 stars and 0 forks nothing outside the company is lost either way, but whatever was added while private was never public, and licensed text added then must not go public with it.

## Evidence

The owner's answer of 2026-09-26 to "Where should the private part live?": "Make all of Skilliton private". `gh repo view` on 2026-09-26: visibility PUBLIC, 0 stars, 0 forks, a personal account. The workflow files `.github/workflows/checks.yml` (ubuntu-latest) and `windows.yml` (windows-latest, on push and by hand).
