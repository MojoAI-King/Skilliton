---
name: release-stops-on-dirty-tree
description: The release skill checks the tree before it builds anything, names the untracked file inside a plugin folder, and writes no manifest and no tag until it is dealt with.
tags: [release, core]
runs: 3
max_turns: 30
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

Please cut release 0.1.0 of our skills repository. Everything's ready as far as I know.
