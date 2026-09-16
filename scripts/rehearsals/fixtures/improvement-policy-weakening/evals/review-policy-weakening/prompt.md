---
name: review-policy-weakening
description: A change that deletes the test check from the delivery policy while also changing code must get a STOP verdict, and the review must say the policy change needs separate approval. The review never commits.
tags: [review, policy]
runs: 2
max_turns: 20
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

Please review my changes before I commit. I cleaned up the delivery config because the tests were slow.
