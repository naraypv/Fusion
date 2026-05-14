---
"@runfusion/fusion": minor
---

Surface explicit in-review stall reasons. Completed-looking tasks parked in In Review without a matching recovery path now expose a machine-readable `task.inReviewStall` signal (e.g. `transient-merge-status-no-owner`, `merge-retries-exhausted`, `no-worktree-no-merge-confirmed`, `merge-blocker`) and self-healing logs the reason to the task once per stuck-timeout window.
