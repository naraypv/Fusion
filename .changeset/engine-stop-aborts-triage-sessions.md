---
"@runfusion/fusion": patch
---

Engine stop now tears down in-progress merger and triager agent sessions
that previously kept streaming past shutdown.

**Triager**: `TriageProcessor.stop()` previously only halted the polling
loop, leaving any in-flight specify session and its reviewer subagents
streaming LLM tokens and tool calls past shutdown. It now aborts and
disposes them via the same path the global-pause handler uses.

**Merger**: `aiMergeTask` creates up to three distinct agent sessions
during a merge — autostash conflict resolver, in-merge verification fix
agent, and pull-rebase conflict resolver — but only the autostash session
was registered via `onSession` for the engine to track. The fix-agent and
rebase-resolver sessions are now also registered, so
`ProjectEngine.stop()` actually disposes whichever merger session is
running when shutdown lands.
