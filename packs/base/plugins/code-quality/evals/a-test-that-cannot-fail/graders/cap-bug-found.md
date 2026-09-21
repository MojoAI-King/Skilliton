---
type: llm
focus: last_message
arm: both
---
PASS if the reply reports that the 50 percent discount cap the README documents is not implemented, or that a test written for that documented behavior fails against the current code.
FAIL if the cap is never mentioned. It is the live bug the unfailing test was hiding, and a test strengthened against what the code is documented to do finds it.
