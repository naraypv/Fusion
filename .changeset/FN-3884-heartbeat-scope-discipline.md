---
"@runfusion/fusion": patch
---

Update the default heartbeat procedure to enforce bound-task scope discipline by classifying work as `executor-class`, `blocked`, or `coordination-class`, and steering executor/blocked ticks toward coordination actions instead of implementation advancement. Existing agents that already have seeded per-agent heartbeat files keep their current content until operators explicitly run the heartbeat-procedure upgrade endpoint, which re-seeds from the latest built-in default.
