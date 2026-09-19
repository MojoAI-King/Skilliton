# Live check: which skilliton a running session resolves

Kind: Reference. Output of `which -a skilliton` and a PATH read, run 2026-09-19 00:33 EDT inside a live Claude Code session in this repository on the machine that builds it (the editor-bundled Claude Code 2.1.276, model Fable 5.1), read-only. Home paths are written as `<home>`. The session had started before `skilliton join` installed the plugins on this machine (join ran 2026-09-18 22:24 EDT, `evidence/live/2026-09-18-join-this-machine.md`).

```
$ which -a skilliton
<home>/.local/bin/skilliton

$ echo "$PATH" | tr ":" "\n" | grep plugins
<home>/.claude/plugins/cache/cloudflare/cloudflare/1.0.0/bin
<home>/.claude/plugins/cache/claude-plugins-official/stripe/0.1.0/bin
<home>/.claude/plugins/marketplaces/cloudflare/bin
<home>/.claude/plugins/marketplaces/claude-plugins-official/external_plugins/stripe/bin
```

What it shows:

- The command a session resolves is the terminal command that `skilliton join` wrote into `<home>/.local/bin`, the route the harness block now names first.
- The installed workflow plugin (cache 0.8.0 from commit f8a935c) does carry `bin/skilliton`, but no Skilliton plugin `bin/` folder was on this session's PATH, while two other marketplaces' plugin `bin/` folders were.
- The plugins were installed after this session began. The likely cause, unverified here, is that the client computes the Bash tool's PATH at session start. The test is a session started after the install: `evidence/live/2026-09-19-path-in-a-new-session.md`.
