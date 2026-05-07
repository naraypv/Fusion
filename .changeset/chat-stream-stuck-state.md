---
"@runfusion/fusion": patch
---

Fix chat sending silently failing on flaky networks (especially mobile).
The SSE reader in the dashboard client now treats a closed stream without
a terminal `done`/`error` event as an error so streaming state unwinds
instead of getting stuck. The `useChat` and `useQuickChat` hooks also now
show a toast when a message is queued behind an in-flight response, so
the previous stuck state is observable rather than silent.
