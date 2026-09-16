---
name: review-comment-only
description: A comment-only change cannot affect behavior, so the review should not raise a false alarm; READY TO COMMIT is correct when that reason is stated.
tags: [review, false-positive]
runs: 3
max_turns: 20
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

Is this safe to commit?
