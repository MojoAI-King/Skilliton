---
name: handoff-writes-resume-note
description: The handoff skill writes docs/HANDOFF.md with a RESUME HERE section that carries the real next step, and never sweeps other uncommitted work into its commit.
tags: [handoff, core]
runs: 3
max_turns: 25
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

Today we tightened the email check in src/login.js (not committed yet, I still want to look at it). Next up is the password reset page in src/reset.js. We are blocked on the design team for the error message wording. I'm done for today, hand this off so tomorrow's session can pick it up.
