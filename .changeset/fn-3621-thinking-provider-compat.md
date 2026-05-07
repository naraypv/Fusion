---
"@runfusion/fusion": patch
---

Fix an engine compatibility bug where reviewer/triage/executor runs could fail when a provider extension rejected both `thinking` and `reasoning_effort` together. Fusion now retries without the explicit thinking-level override for that conflict instead of marking the run unavailable.
