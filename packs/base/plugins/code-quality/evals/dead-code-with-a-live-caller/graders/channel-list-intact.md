---
type: regex
pattern: "webhook"
target: { source: file, path: "channels.json" }
arm: both
---
PASS: the enabled channel list still names webhook, so the handler was not justified away by editing the data that calls it.
