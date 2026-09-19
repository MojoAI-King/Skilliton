# Live check: join sets up the owner's machine from the published repository

Kind: Reference. Output of `skilliton join` run 2026-09-18 22:24 EDT on the machine that builds this repository, with the editor-bundled Claude Code 2.1.276 (`--claude <the bundled binary>`), against the GitHub marketplace `MojoAI-King/Skilliton` at commit f8a935c. Company name `mojoai`; the signers file held one public key (its principal is written as `<principal>` here) and was given to join from outside the repository. Home paths are written as `<home>`. The preview was read first (six changes, 38 machine checks ok, the same note about release tags); the run below is the `--apply`.

```
skilliton join
company: mojoai
skills repository: <home>/Desktop/Skilliton (commit f8a935c, 0 release tag(s))
marketplace: skilliton from GitHub MojoAI-King/Skilliton
plugins: context-hygiene, workflow, guardrails

machine checks: 38 ok (each folder was tested with one file, removed again; node packs/base/plugins/workflow/runtime/skilliton.mjs preflight shows them all)

release signers:
  will add          <home>/.config/skilliton/trust/mojoai.allowed_signers (1 signer(s), sha256 1308f23c9182)
Claude Code (<the bundled binary>, home <home>/.claude):
  will add          marketplace skilliton
  will add          plugin context-hygiene@skilliton
  will add          plugin workflow@skilliton
  will add          plugin guardrails@skilliton
terminal command:
  will add          <home>/.local/bin/skilliton, which runs <home>/Desktop/Skilliton/scripts/skilliton.mjs
note: <home>/Desktop/Skilliton has no release tags yet, so verify will not find an approved release until your company signs one and you fetch its tags (git -C <home>/Desktop/Skilliton fetch --tags).

recorded <home>/.config/skilliton/joined/mojoai.json
trusted the release signers: <home>/.config/skilliton/trust/mojoai.allowed_signers
Claude Code: added marketplace skilliton (GitHub MojoAI-King/Skilliton)
Claude Code: installed context-hygiene@skilliton
Claude Code: installed workflow@skilliton
Claude Code: installed guardrails@skilliton
wrote the terminal command <home>/.local/bin/skilliton

verify, Claude Code: not every company plugin is VERIFIED (0 VERIFIED; 3 UNKNOWN VERSION). Install or update from an approved release, then run verify again.
  UNKNOWN VERSION context-hygiene 0.3.0
  UNKNOWN VERSION workflow 0.8.0
  UNKNOWN VERSION guardrails 0.4.0

Set up, with attention needed above. To take it back out: node packs/base/plugins/workflow/runtime/skilliton.mjs join --undo --company mojoai --apply
```

Exit code 1 (attention: set up, verify not clean). `skilliton verify --client claude-code` run again on its own gave the same three lines, with the note that the repository has no `skilliton-release/<version>` tags at all, and that the two plugins from other marketplaces on this machine were not checked. `claude plugin list` through the bundled binary then showed `context-hygiene@skilliton 0.3.0`, `guardrails@skilliton 0.4.0` and `workflow@skilliton 0.8.0`, each at user scope and enabled, next to the two plugins that were already there. The client's install record gives each of the three the marketplace commit `f8a935c9b546` and an install time of 2026-09-19T02:24 UTC; the marketplace record points at `<home>/.claude/plugins/marketplaces/skilliton`. The join receipt records the marketplace, the trust file's full hash, the three installs and the launcher's hash, so `join --undo` can take it back out.

What this shows: on a machine that already had Claude Code and two other marketplaces, join adds the company marketplace from GitHub, installs and enables the three plugins the template names, trusts the signers file, writes the launcher and records a receipt, in one command, with nothing needing administrator rights. verify tells the truth about the state of the repository: there is no signed release, so nothing is VERIFIED, and join says so rather than rounding up.

What it does not show: a VERIFIED result (backlog B6, a signed release, is the owner's to make); a fresh machine with no Claude Code configuration (the company release rehearsal covers a fresh `CLAUDE_CONFIG_DIR`); whether the client pulls a newer marketplace commit on its own after `main` moves (the client documents a check after each session start with a delay of up to ten minutes; the installed commit above is the one to compare against on the next day's first session, or after `claude plugin marketplace update` by hand); and any session behavior, which the rehearsal and the owner's interactive session record separately.
