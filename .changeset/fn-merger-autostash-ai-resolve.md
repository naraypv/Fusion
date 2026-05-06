---
"@fusion/engine": patch
"@fusion/core": patch
---

Make the merger's autostash recovery robust against silent data loss. When `rootDir` is the developer's primary checkout, the merger stashes uncommitted edits before running its hard resets and applies them back at the end. Previously a pop conflict logged a single warning and silently left the stash in place — and a subsequent merge would push another autostash on top, burying the first.

Three changes:

1. **AI auto-resolve on apply conflict.** When the autostash apply hits a conflict, the merger now spawns a focused fix-agent (same `createResolvedAgentSession` path used for the in-merge verification fix-agent) to resolve conflict markers in the working tree. On success the stash is dropped and the resolution is recorded in `MergeResult.autostash`. On failure the stash is left intact for manual recovery.
2. **Outcome surfaced on `MergeResult.autostash`** (new field of type `AutostashOutcome`). Consumers (dashboard, CLI, daemon) can now show the developer whether their work was reapplied cleanly, AI-resolved, or needs manual recovery — instead of relying on a buried log warning.
3. **Deterministic stash identity via `git stash create` + `git stash store`.** Replaces the previous `git stash push` + label-grep flow that raced against any other tool stashing concurrently. The stash SHA is captured atomically with snapshot creation and used for apply/drop, so the operation is robust to stash list reordering.

Also: orphaned `fusion-merger-autostash:*` entries from prior failed runs are now detected at merge entry and surfaced as a warning so they cannot be silently buried again.
