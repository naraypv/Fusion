---
"@runfusion/fusion": patch
---

Add a dedicated `fallback-used` notification event that fires when Fusion recovers from a retryable model failure by switching to a configured fallback model, and expose it in global notification settings for ntfy/webhook filtering.
