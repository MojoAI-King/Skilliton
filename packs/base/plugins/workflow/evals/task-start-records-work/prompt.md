---
name: task-start-records-work
description: The task skill turns a plain-language request into a task record with checkable acceptance criteria, created through skilliton, without building anything yet.
tags: [task, core]
runs: 3
max_turns: 30
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

Hi! I'd like people to be able to reset their password from the sign-in page. They should get an email with a link, and the link should stop working after 30 minutes. Please set this up as a piece of work the team can pick up. Don't build it yet, we'll do that tomorrow.
