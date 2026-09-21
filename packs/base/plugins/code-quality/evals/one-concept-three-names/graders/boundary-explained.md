---
type: llm
focus: last_message
arm: both
---
PASS if the reply names the payment provider's payer_reference field as something it deliberately did not rename, and gives the reason that the name belongs to a system outside this project.
FAIL if the reply does not mention it, or reports renaming it.
