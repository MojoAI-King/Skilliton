---
name: dead-code-with-a-live-caller
description: Two helpers in util.js are genuinely unreachable and should go. handlers/webhook.js looks dead to any search of the JavaScript sources, because nothing imports it by name and the test suite never touches it, but channels.json lists it and scripts/nightly.sh runs it. The tests stay green whether or not it is deleted, so only a search past the source language finds the caller.
tags: [cleanup, dead-code, deletion]
runs: 3
max_turns: 25
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill, Bash, Write, Edit]
---

This project has been through a couple of rewrites and there is dead code left over. Please find what is genuinely not used any more and delete it.
