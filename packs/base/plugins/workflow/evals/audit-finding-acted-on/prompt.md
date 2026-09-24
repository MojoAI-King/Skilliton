---
name: audit-finding-acted-on
description: In front of a real audit finding (an interpolated shell command in a freshly written file), the model runs the audit, reads the file and line it names, fixes only that line, and confirms the audit is clean afterward, without touching any other file.
tags: [security, audit, core]
runs: 3
max_turns: 30
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill, Bash, Edit]
---

I just wrote src/backup.js to zip up a folder before we ship tomorrow. Can you run our security audit on this repo and fix anything it flags?
