# Live check: the plugin bin folder is on PATH in a session started after the install

Kind: Reference. One headless run of Claude Code 2.1.92 (the copy on this machine's PATH; the bundled 2.1.276 was not on PATH) on 2026-09-19 at 01:08 EDT, from a scratch folder outside any Git repository, with `--output-format stream-json --include-hook-events --allowedTools Bash --max-turns 3 --model claude-haiku-4-5-20251001`. Home paths are written as `<home>`. A first run with the default model was refused by the API (`claude_code_version_too_old`, the 2.1.92 binary does not support the default model); the hook events below appeared in that run too, so the plugin loading is not model-dependent.

The stream carried, before the `init` event, five `SessionStart:startup` hook responses with exit 0, in this order:

```
[context-hygiene] SKILLITON_LESSONS not set or file missing; injecting nothing. (Reported, not silent.)
[workflow] No handoff yet in this repo. When you finish a stretch of work, run /workflow:handoff so the next session can pick up.
[guardrails] on: force-push to protected branches, --no-verify, and secret files are blocked.
<cross-project-lessons> ... (this machine's own SessionStart hook, not a plugin)
[workflow] Skilliton project state is unavailable: <scratch folder> is not inside a Git repository.
```

So the user-installed Skilliton plugins loaded headless (the workflow plugin's two SessionStart hooks, the guardrails and the context-hygiene hooks all ran), which is the condition for trusting the rest. Then the model ran the one Bash command and reported its output verbatim:

```
$ which -a skilliton; echo ---; echo "$PATH" | tr ":" "\n" | grep -n plugins
<home>/.local/bin/skilliton
<home>/.local/bin/skilliton
<home>/.local/bin/skilliton
<home>/.claude/plugins/marketplaces/skilliton/packs/base/plugins/workflow/bin/skilliton
---
23:<home>/.claude/plugins/cache/cloudflare/cloudflare/1.0.0/bin
24:<home>/.claude/plugins/cache/claude-plugins-official/stripe/0.1.0/bin
25:<home>/.claude/plugins/marketplaces/cloudflare/bin
26:<home>/.claude/plugins/marketplaces/claude-plugins-official/external_plugins/stripe/bin
27:<home>/.claude/plugins/marketplaces/skilliton/packs/base/plugins/context-hygiene/bin
28:<home>/.claude/plugins/marketplaces/skilliton/packs/base/plugins/workflow/bin
29:<home>/.claude/plugins/marketplaces/skilliton/packs/base/plugins/guardrails/bin
```

What it shows:

- In a session started after `skilliton join` installed the plugins, the workflow plugin's `bin/` is on the Bash tool's PATH (entry 28), and `which -a` finds `skilliton` twice: the join launcher first (`<home>/.local/bin` is earlier on PATH, listed three times because the shell profile adds it more than once), then the plugin's own copy.
- The folder the client adds is under `plugins/marketplaces/<name>/...` for this marketplace (its plugins are relative sources inside the marketplace checkout), not under `plugins/cache/`; the other marketplaces get both. Which copy runs depends only on PATH order, and both are the same runtime version once the marketplace checkout and the launcher's clone are at the same commit.
- Together with `evidence/live/2026-09-19-which-skilliton-in-a-session.md` (the same read inside the session that was running when join installed the plugins: no Skilliton `bin/` on PATH), this settles the cause: the client computes the Bash tool's PATH at session start, so a plugin installed during a session reaches PATH in the next one. The interactive session in this editor is still the owner's to see; nothing here is a claim about it.
