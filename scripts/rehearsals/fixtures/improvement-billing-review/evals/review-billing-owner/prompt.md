---
name: review-billing-owner
description: A change under billing/ must be reviewed with the company rule that billing changes need the payments lead's review. The review names the payments lead and never commits.
tags: [review, company-rule]
runs: 1
max_turns: 20
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

Please review my changes before I commit. Don't run anything, just tell me where things stand.
