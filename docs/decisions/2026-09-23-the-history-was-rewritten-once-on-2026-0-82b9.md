# The history was rewritten once, on 2026-09-23, to remove the AI co-author trailers

Kind: Living. Decision entry.

- **ID:** 2026-09-23-the-history-was-rewritten-once-on-2026-0-82b9
- **Status:** accepted
- **Date:** 2026-09-23

## Decision

Every commit on `main` from 2026-09-16 to 2026-09-23 carried a `Co-Authored-By` trailer naming the AI model that helped write it (311 of 374 commits). On 2026-09-23 the owner had those trailer lines removed from every commit message on `main`, in one rewrite, run by the owner from a terminal. Nothing else changed: every tree is byte-identical to the tree it replaced (the tree hash at the tip, cadd88a0190a, is the same before and after), the commit count is the same (374), and the three release tags were re-signed at the rewritten commits with the same key and the same manifest hashes. Attribution for this repository is Mojo AI Services, LLC, in the licence, the plugin manifests and the commit messages alike. This is the one history rewrite this repository has had, and the owner does not plan another.

## Why

The owner's attribution rule is that the work is attributed to the company, not to a tool. The trailers contradicted that rule in the one place a reader sees first: the contributor list a hosting service derives from co-author lines. Removing them going forward (no trailer on any commit since the morning of 2026-09-23) left 311 older commits saying the opposite; only a rewrite changes those.

## Alternatives rejected

- Leave the trailers and state the attribution in the licence and README only: the contributor list still names the tool.
- A mailmap file: hosting services do not read it for their contributor list.
- Squash the history to one commit: loses the record of how the work was built, which the report card, the lessons and the task records cite by commit.

## Risk

Every commit hash cited in a document written before the rewrite points at a commit that no longer exists on `main`. The living documents were updated in the same commit as this entry with the mapping below; archived documents and task records keep their old hashes, and this table is how to follow one. The old objects stay in the bundle backup the rewrite made first (`~/Desktop/Skilliton-backups/pre-rewrite-<timestamp>.bundle`, outside the repository). Every other checkout of this repository has to be reset to the new `main`; the lane folders under the lanes root were detached to the new tip.

| Before | After | Cited by |
|---|---|---|
| a61a778 | 87521c8 | the commit the three cold reviews read (CHANGELOG, THREAT_MODEL) |
| 1f9f041 | 4bf1402 | the 1.1.0 manifest commit and tag |
| 62dcdf5 | 39777a5 | the tree the 1.1.0 checks ran on |
| c42d193 | 872c67a | the handoff before the reviews |
| 095d59c | e5cc2c6 | the 1.0.0 manifest commit and tag |
| b0dc663 | 9036586 | the 0.9.0 manifest commit and tag |
| e8e156e | fd4dc3a | the audit-marker lesson |
| cb8e49e | 1d4e44f | the lint-ratchet lesson |
| f1623ad | 19d0f48 | the docs-branch lesson |

## Reversibility

Reversible from the bundle backup until it is deleted: `git fetch <bundle> main` restores the old history beside the new one. Reverting on the hosting service would be a second force-push, which the branch rule forbids by default.

## Evidence

The rewrite script's own report, pasted by the owner: 374 commits before and after, trailers 311 before and 0 after, tree at HEAD unchanged, the three tags re-signed and `release list` reading 3 approved, 0 unapproved, 0 withdrawn. Checked again from the integrating session: `git diff origin/main main --stat` empty before the push, `scripts/scrub-check.sh --history` exit 0, `git tag -v skilliton-release/1.1.0` good signature.
