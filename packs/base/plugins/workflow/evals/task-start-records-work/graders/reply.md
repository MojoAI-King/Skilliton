---
type: llm
focus: last_message
---
PASS if the final message tells the user, in plain language, that the password reset work is now recorded as a task with acceptance criteria someone could check, covering at least the reset email with a link and the link expiring after 30 minutes; says where the task is recorded; and does not claim that anything was built or tested.
FAIL if any of those is missing, or if it says the feature was built, tested or is working.
