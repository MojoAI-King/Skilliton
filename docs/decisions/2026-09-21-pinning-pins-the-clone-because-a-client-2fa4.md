# Pinning pins the clone, because a client's plugin download cannot be pinned

Kind: Living. Decision entry.

- **ID:** 2026-09-21-pinning-pins-the-clone-because-a-client-2fa4
- **Status:** accepted
- **Date:** 2026-09-21

## Decision

`skilliton pin` moves the company skills clone between signed release tags, and `join` pins that clone before it writes
anything. It does not pin a client's own copy of a plugin, and it does not claim to. The clone is what the marketplace
source and the launcher point at: it is the runtime `skilliton` runs, the catalog a client reads when it adds the
marketplace, and the manifest `verify` checks an installed plugin against. Moving it is the whole of what is on offer,
and the help text, docs/CONTRACTS.md section 13 and the sentence `join` prints all say exactly that much.

Two rules make the pin mean something. It follows the signature, not the ref: it checks out the commit the verified tag
object names, never the tag name, because a tag name follows wherever that ref points now. And `--release` takes a
plain `MAJOR.MINOR.PATCH` version and nothing else, so there is no spelling of a branch, a commit or a tag name that
moves a clone.

## Why

Batch 08-03 asks that the install path pin to a signed tag and that update move between tags only. The obvious reading
is that a client installs one commit of a plugin. That reading is not available: `claude plugin marketplace add` has no
ref, tag or branch option, and `marketplace update` takes none either (measured 2026-09-21 on 2.1.276). A client
downloads whatever the marketplace source points at now.

The honest thing left is to pin the source. Pinning the clone gives a signature-checked commit for everything Skilliton
itself runs, and `verify` already reports a download that does not match an approved release, so the two together cover
the ground the batch was aiming at without anybody having to believe a capability that does not exist.

## Alternatives rejected

**Claim the client install is pinned.** It would be a sentence nobody could act on and a check nobody could run. The
repository's own rule is that an unverified capability is named as unverified.

**Vendor the release into the client's plugin folder ourselves**, writing the files a marketplace install would have
written. It would put Skilliton in the business of maintaining an undocumented layout that two clients write
differently and that either may change, and `verify` reads those same records, so a bug there would be invisible to the
only check that could catch it.

**Pin by rewriting the marketplace source to a per-release copy.** It multiplies clones, leaves every old copy on disk
with nothing that removes them, and still cannot stop a client updating from the source it was given.

**Record the pin in the join receipt.** The receipt is machine state under `~/.config`; a pin is a property of one
clone. Recording it there would mean a receipt naming a clone that has since been deleted, an undo obligation for
something that goes away with the folder, and (on this tree) a change to `lib/join.mjs`, which the size ratchet pins at
603 lines and does not let grow. The record is `<git dir>/skilliton-pin.json` instead, so it goes away when the clone
does.

## Risk

A pinned clone sits on a detached HEAD, which is unfamiliar and looks like an accident. The command says so in the
sentence it prints and gives the `git checkout <branch>` that undoes it.

A clone can be pinned while the client's installed plugins are from a different release. That is the gap this decision
accepts, and `verify` is what reports it; `join` runs `verify` last for that reason.

`seen` catches a moved tag only for tags the clone already held when it was pinned. A tag rewritten before this clone
ever fetched it is not detectable here; the signature is what covers that case.

## Reversibility

Reversible with nothing to undo elsewhere: delete `<git dir>/skilliton-pin.json` and check out a branch. Nothing under
`~/.config` is written, so there is no machine state to clean up, and removing the clone removes the pin with it.

## Evidence

`packs/base/plugins/workflow/runtime/lib/pin.mjs` and `runtime/commands/pin.mjs` (workflow 0.15.0), wired into
`runtime/commands/join.mjs`. `scripts/release.test.mjs` pins a clone at the commit a signed tag names and writes the
record; refuses an unsigned release by name, an unapproved newest release (naming the older approved one rather than
choosing it), a tag re-made on another commit, a deleted tag, a changed tracked file, a branch name, a commit id, a tag
name, a two-part version, an unknown version, a withdrawn release and a bare `--apply` that names no release, each with
the clone left where it was; moves a clone up a release, back down and to the newest with `--latest`; and refuses
`join` on an unsigned newest tag and on a moved tag before any client is touched. `scripts/join.test.mjs` covers a
clone with no release tags and `--no-pin`.

The measurement behind the scope: `claude plugin marketplace add --help` and `claude plugin marketplace update --help`
on 2.1.276, 2026-09-21, neither of which offers a ref, tag or branch.
