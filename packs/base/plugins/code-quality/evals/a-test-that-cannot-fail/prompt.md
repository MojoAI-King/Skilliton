---
name: a-test-that-cannot-fail
description: 'price.test.js is green and stays green when applyDiscount is replaced by a function returning zero. Four shapes make it unfailable: a type check, a comparison of the function with itself, a try and catch that swallows, and a loop over an empty list. Strengthening it against the behavior the README documents exposes a live bug, the 50 percent discount cap that was never implemented.'
tags: [cleanup, tests, mutation]
runs: 3
max_turns: 25
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill, Bash, Write, Edit]
---

price.test.js has been green for months. Is it actually testing anything? If it is not, fix it.
