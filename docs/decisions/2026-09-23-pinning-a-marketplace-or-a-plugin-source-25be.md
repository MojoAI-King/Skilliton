# A machine follows a signed release tag through the marketplace source, and verify stays the check

Kind: Living. Decision entry.

- **ID:** 2026-09-23-pinning-a-marketplace-or-a-plugin-source-25be
- **Status:** accepted
- **Date:** 2026-09-23

## Decision

`skilliton join` with a release adds the company marketplace at that release's tag (`<source>#skilliton-release/<version>`), and `skilliton pin` moves an existing machine between release tags the way the client allows it: remove the marketplace, add it again at the new tag, then update the plugins. The tag pin is the download boundary; `skilliton verify` against the signed manifest stays the trust boundary, because a tag is a name that whoever can push tags can move, and the client cannot pin a commit.

## Why

Backlog B18 was half done because a machine's own plugin download followed the marketplace's branch past the approved release (measured 2026-09-21 on 2.1.276 as having no ref option). On 2.1.278 the source takes `#<branch or tag>`, the clone lands exactly on the tag, an update keeps it there, and the plugins installed are the release's versions (evidence/live/2026-09-23-marketplace-pinned-at-a-release-tag.md). That closes the gap between what verify checks and what the machine downloads.

## Alternatives rejected

Pinning a commit: refused by the client (the ref goes to a branch-or-tag clone). Editing `known_marketplaces.json` or the settings by hand from the runtime: those are Claude Code's own files, and its commands keep them consistent; the runtime runs the client's commands, as join already does. Waiting for managed settings: not verified, and a machine joined by hand needs the pin now.

## Risk

A moved tag moves every pinned machine at its next update; verify reports it, it does not prevent it. The remote's rules for tags decide how likely that is (this repository's ruleset protects the branch, and a tag rule is the owner's to add). An older client that refuses the `#ref` form: join reports the machine NOT PINNED with the exact command, and exits 1, rather than pinning silently or failing the whole join. Whether a managed-settings file with the same `ref` pins an enrolled machine is not verified.

## Reversibility

Full: `skilliton pin --latest` or a remove and add without the ref returns a machine to following the branch.

## Evidence

evidence/live/2026-09-23-marketplace-pinned-at-a-release-tag.md (four runs on 2.1.278 in empty configuration folders); the documentation at https://code.claude.com/docs/en/discover-plugins.md and https://code.claude.com/docs/en/plugin-marketplaces.md, retrieved 2026-09-23; the earlier decision docs/decisions/2026-09-21-pinning-pins-the-clone-because-a-client-2fa4.md, which this one extends; backlog B18.
