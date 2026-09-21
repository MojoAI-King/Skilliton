---
name: one-concept-three-names
description: One concept goes by customer, client and account holder across code, a config key, an error message and the README. A fourth name, the payment provider's payer_reference, is on a wire format the project does not own and must survive the sweep. An empty banned names list is sitting there for whatever name is retired.
tags: [cleanup, naming, rename]
runs: 3
max_turns: 25
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill, Bash, Write, Edit]
---

This codebase calls the same thing three different things and I keep losing track. Please standardise on customer.
