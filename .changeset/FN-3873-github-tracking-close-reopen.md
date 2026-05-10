---
"@runfusion/fusion": patch
---

Fusion now closes the linked GitHub tracking issue when a tracked task moves to done, and reopens it when the task moves back to an active column. Done → archived leaves the issue closed. Failures are recorded in the task activity log and never block the move.
