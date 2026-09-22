# Live check: install, update and verify from a private repository, 2026-09-21

Kind: Reference. A throwaway private repository under the owner's GitHub account held a copy of this repository renamed with `company init --name throwaway`, with three signed releases (0.9.1, 0.9.2, 0.9.3) made and signed on this machine. A clean Claude Code configuration (`CLAUDE_CONFIG_DIR` pointing at an empty folder, binary 2.1.278) added the marketplace from that private repository, installed `workflow@throwaway`, verified it, then took a real update. Everything below is pasted from the scripted runs' logs. This file answers item 1 of docs/areas/08-make-it-yours/batch-02-private-repository.md and B31.

## Credentials, named by location only

- The push to the private repository and Claude Code's clone of it used HTTPS with GitHub's credential helper from the `gh` login (`gh auth git-credential`), scoped to the process with `GIT_CONFIG_*` variables. Nothing was written to the global git configuration.
- The machine's SSH key belongs to a different GitHub account than the one that owns the private repository, so the first attempt over SSH was refused ("Repository not found"); that is a fact about this machine, recorded here so the next person does not repeat it.
- One push over HTTPS died mid-transfer with a TLS error from libcurl ("bad record mac") and succeeded on retry. Transient; noted.

## What happened

```
=== clean Claude Code configuration: marketplace add from the PRIVATE repository over https ===
✔ Successfully added marketplace: throwaway (declared in user settings)
=== install workflow@throwaway ===
✔ Successfully installed plugin: workflow@throwaway (scope: user)
  ❯ workflow@throwaway
    Version: 0.15.6
=== verify against the private clone ===
approved    0.9.1       signed by <owner> (ED25519 SHA256:U+Y1xXL7...); manifest-sha256 5fb0ee1d98ba; commit 05daf39da07a
Summary: 3 approved, 0 unapproved, 0 withdrawn.
VERIFIED         workflow 0.15.6 [user]: release 0.9.2; all 135 files match
```

The three plugins not installed in that configuration read NOT INSTALLED, as they should; only `workflow` was installed on purpose.

The update, after a third release (workflow bumped to 0.15.7, release 0.9.3 signed and pushed):

```
=== installed before ===
    Version: 0.15.6
=== update ===
✔ Successfully updated marketplace: throwaway
✔ Plugin "workflow" updated from 0.15.6 to 0.15.7 for scope user. Restart to apply changes.
=== installed after ===
    Version: 0.15.7
=== verify after the update ===
VERIFIED         workflow 0.15.7 [user]: release 0.9.3; all 135 files match
```

## What this proves, and what it does not

- Proves: a private repository works as a company marketplace over HTTPS with a credential the machine already holds; install, a real version update and `verify` against the signed release all behave as they do for a public repository.
- Does not prove: SSH access to a private repository (the key on this machine belongs to another account), a fine-grained token with read-only scope (the `gh` login was used), or Codex against a private repository.

## The throwaway repository

`skilliton-throwaway-private`, private, under the owner's account, deleted once this file and the batch tick were committed. The clean configuration folder and the clone were under the session's scratch folder and are gone with it.
