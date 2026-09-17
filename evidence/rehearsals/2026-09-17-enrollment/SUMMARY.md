# Enrollment spike: company plugins from managed settings on a clean Linux machine (M12)

Kind: Reference. Recorded 2026-09-17 by `scripts/rehearsals/enrollment.mjs`. Disposable folders, synthetic projects and throwaway keys only.

- **Claude Code:** 2.1.274
- **Base image:** node@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5
- **Docker:** 29.5.2
- **Start length:** 30 seconds, then stopped
- **Skills repository commit (folder scenarios):** 466515c
- **GitHub commit installed:** e8ab467
- **Key source reported by the sessions:** ANTHROPIC_API_KEY

| Step | Result | Evidence |
|---|---|---|
| E1 a clean image with Claude Code 2.1.274, on a base pinned by digest, and an unprivileged user builds | PASS | 2.1.274 (Claude Code) on node@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5; no credential, no login, nothing mounted from the host |
| E2 control: a malformed managed drop-in stops Claude Code, so the drop-in folder is read | PASS | plugin list refused naming the drop-in: "Managed settings document could not be parsed as a JSON object; none of its settings are in effect. Fix or remove it."; a session start refused naming the drop-in: "Managed settings document could not be parsed as a JSON object; none of its settings are in effect. Fix or remove it." |
| E3 without a login nothing is installed: a GitHub marketplace is not registered, a folder marketplace is | PASS | GitHub: plugin list printed [] and registered no marketplace; GitHub: a headless start said "Not logged in · Please run /login", registered no marketplace and installed 0 plugin(s); GitHub, a new machine: an interactive start stopped at the first-run screen ("Let's get started", before any login), registered no marketplace and installed 0 plugin(s); folder, a new machine: a headless start said "Not logged in · Please run /login", registered the marketplace and installed 0 plugin(s) |
| E4 managed settings with the GitHub marketplace: start 1 registers, start 2 installs, start 3 is active | PASS | start 1: marketplace registered (autoUpdate true), 0 installed, session not active (no plugin skills or hooks); start 2: 3 installed (scope managed, commit e8ab467), session not active (no plugin skills or hooks); start 3: session active (8 plugin skills; SessionStart hooks succeeded for workflow, guardrails, context-hygiene). No developer command ran |
| E5 managed settings with a marketplace folder on the machine: start 1 registers, start 2 installs and is active | PASS | start 1: marketplace registered, 0 installed, session not active (no plugin skills or hooks; the init event still listed 3 plugin(s)); start 2: 3 installed (scope managed), session active (8 plugin skills; SessionStart hooks succeeded for workflow, guardrails, context-hygiene). No developer command ran. Claude Code documents the directory source as for development only |
| E6 a read-only plugin seed placed by root, its variable set in managed settings env: start 1 is not active, start 2 is | PASS | start 1: session not active (no plugin skills or hooks; the init event still listed 3 plugin(s)); start 2: session active (8 plugin skills; SessionStart hooks succeeded for workflow, guardrails, context-hygiene); the developer's marketplace record points into the seed (/opt/skilliton-seed/marketplaces/skilliton) with autoUpdate false. The seed build ran as root with no login |
| E7 a read-only plugin seed placed by root, its variable set in the process environment: start 1 is not active, start 2 is | PASS | start 1: session not active (no plugin skills or hooks; the init event still listed 3 plugin(s)); start 2: session active (8 plugin skills; SessionStart hooks succeeded for workflow, guardrails, context-hygiene); the developer's marketplace record points into the seed (/opt/skilliton-seed/marketplaces/skilliton) with autoUpdate false. The seed build ran as root with no login |
| E8 a first-login install run as the developer before any session: start 1 is active and the plugins become managed | PASS | first-login install succeeded with no login; before start 1: 3 plugin(s) installed with scope user; start 1: session active (8 plugin skills; SessionStart hooks succeeded for workflow, guardrails, context-hygiene); after start 1: 3 plugin(s) listed with scope managed |

## Notes

- Every session start used a placeholder API key and a model endpoint on the container's loopback that never answers. No model ran, no credential existed, and a claude.ai login was not measured (docs/BACKLOG.md B3).
- Without a login no plugin is installed: a headless start stops at "Not logged in" and an interactive start at the first-run screen. A GitHub marketplace is not registered before then; a folder marketplace is. On a real machine the developer's first login comes first; whether registration and installation then happen in that same first session is not measured.
- A start counts only when its init event names the pinned version and `timeout` stopped it. Activity is judged by plugin skills and SessionStart hook results, because the init event lists enabled plugins even when they have not loaded.
- A macOS clean account was not run. On macOS, managed settings live in a machine-wide folder, so placing them on the build machine would change the owner's own Claude Code sessions; it needs a separate Mac or a macOS virtual machine.
- `claude plugin marketplace add` reports the marketplace as declared in user settings, so first-login setup writes to the developer's settings; offboarding has to remove that entry.

Result: 8 of 8 steps passed.
