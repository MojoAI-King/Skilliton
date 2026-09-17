# Machine rehearsal: one command per machine (M7)

Kind: Reference. Recorded 2026-09-17 by `scripts/rehearsals/machine.mjs`. Disposable folders, synthetic projects and throwaway keys only.

- **Claude Code:** 2.1.273 (Claude Code)
- **Codex:** codex-cli 0.154.0-alpha.6.2
- **GitHub step:** run when github.com is reachable
- **Node:** v25.8.1

| Step | Result | Evidence |
|---|---|---|
| J1 a company fork with its own name, a company plugin and signed release 1.0.0; a developer clones it | PASS | company init, new-plugin, new-skill exits 0 0 0; release create exit 0, sign exit 0; developer clone exit 0 with tags: skilliton-release/1.0.0 |
| J2 Claude Code already has the company marketplace and context-hygiene, installed by hand; join's preview shows them in place and writes nothing | PASS | hand install: marketplace add exit 0, context-hygiene exit 0; preview exit 0, shows the Claude Code marketplace in place and the plugins to add: true; machine folders unchanged: true |
| J3 join --apply installs on both clients, trusts the signers, writes the terminal command and ends with every plugin VERIFIED | PASS | join exit 0; VERIFIED lines 8 of 8 (4 on each client, including the plugin installed by hand); Claude Code installs acme-review@acme-skills, context-hygiene@acme-skills, guardrails@acme-skills, workflow@acme-skills; Codex cache acme-review, context-hygiene, guardrails, workflow; launcher executable: true; receipt records only what join added: true |
| J4 verify needs no --source afterwards: from the terminal command, and from the installed plugin's own copy | PASS | terminal command verify exit 0 (all 4 company plugin install(s) on this client are VERIFIED against approved releases.); installed copy verify --client codex exit 0, source from the join receipt: true |
| J5 a repeat join changes nothing and still verifies | PASS | repeat exit 0; nothing listed to add: true; machine folders unchanged: true |
| J6 join --undo previews without writing, then removes exactly what join added and keeps what was there before | PASS | preview exit 0, wrote nothing: true; undo exit 0; Claude Code keeps context-hygiene@acme-skills and marketplaces acme-skills; Codex cache empty, config names acme-skills: false; signers, terminal command, its folder and receipt removed: true |
| J7 refusals before any change: a shallow clone, a different signers file already trusted, and a marketplace of the same name from another source | PASS | shallow clone exit 2; different signers exit 2; marketplace from another source exit 2; machine unchanged by the three refusals: true |
| J8 GitHub source: join from a clone of MojoAI-King/Skilliton installs from GitHub on both clients, verify reports no approved release, and undo removes it | PASS | join exit 1 (1: installed, not approved); Claude Code marketplace source github, workflow at commit 1b626d1 = clone HEAD 1b626d1; Codex source is the GitHub URL: true; UNKNOWN VERSION lines 6 of 6; undo exit 0, both clients clean: true |

## Notes

- Every client home, the trust folder, the join receipts and the terminal command folder are inside the disposable workspace (CLAUDE_CONFIG_DIR, CODEX_HOME, SKILLITON_TRUST_DIR, SKILLITON_JOIN_DIR, --bin-dir); nothing on the machine running the rehearsal is changed.
- Measured limits of undo: Claude Code leaves empty enabledPlugins and extraKnownMarketplaces entries in its settings and keeps downloaded plugins under plugins/cache/, which verify does not count because it reads installed_plugins.json; Codex deletes each removed plugin's cache folder, which is its install record, and keeps the empty plugins/cache/<marketplace>/ folder.

Result: 8 of 8 steps passed.
