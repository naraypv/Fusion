# Refactor Decision: Deepen the Existing Agent Session Runtime Boundary

Created: 2026-05-04T21:58:47Z

Source shortlist: `candidates.md`

Status: decision locked. Stop here before planning.

## 1. Chosen Refactor

Choose a narrowed version of C1:

Deepen the existing engine session/runtime boundary so every production LLM invocation that creates or prompts an agent session goes through a single runtime-aware creation and prompt path. This should extend and standardize the existing `AgentRuntime`, `runtime-resolution`, `createResolvedAgentSession`, and core `CreateAiSessionFactory` surfaces rather than introduce a separate generic gateway service.

The refactor objective is behavioral preservation plus boundary consolidation:

- Existing pi/default behavior remains the default.
- Existing prompt fallback, context compaction, and runtime fallback behavior remain intact.
- Direct production call sites that import or call `createFnAgent` / `promptWithFallback` should be migrated only when they can preserve current semantics.
- The boundary must become the later insertion point for account selection and DSPy runtime toggling.

## 2. Why This Beats the Alternatives Now

This survives the Ousterhout lens better than the original broad "gateway" wording. A new facade could become a shallow wrapper if it only forwards to `createFnAgent`. The deeper move is to make the already-present runtime/session boundary complete enough that callers do not need to understand provider selection, runtime hints, plugin fallback, account policy, or prompt retry sequencing.

It beats C3 because multi-account auth has no value if actual prompt traffic continues through provider-only direct calls. Current auth APIs are provider-centric, so account work should be grounded after a single invocation boundary exists.

It beats C4 because a DSPy sidecar or plugin runtime would only cover paths that use runtime resolution. Several user-facing dashboard, research, cron, reflection, and core paths still call `createFnAgent` directly. Adding DSPy first would create a partial toggle with hidden exceptions.

It beats C2 because branch hygiene is useful but does not reduce the core complexity blocking multi-account routing and DSPy. C2 should remain a separate safety cleanup, not the main refactor.

It beats C5 because no external provider docs are needed to decide the internal boundary. The implementation details for account login and DSPy sidecar can wait; the need for a single runtime-aware call path is already proven by local code evidence.

## 3. Evidence That Changed Confidence

The provisional C1 was challenged as possibly too broad or already solved. The cheap probes changed confidence in two ways:

1. Confidence increased that C1's problem is real.
   - `createFnAgent` appears in 32 non-test files across core, engine, dashboard, and CLI surfaces.
   - `createResolvedAgentSession` appears in only 10 non-test files.
   - `promptWithFallback` appears in 19 non-test files.
   - Direct imports remain in dashboard AI flows, workflow-step refine routes, insights, research synthesis, cron runner, and agent reflection.

2. Confidence changed on the shape of C1.
   - `packages/engine/src/runtime-resolution.ts` already defines `DefaultPiRuntime` and plugin runtime fallback.
   - `packages/engine/src/agent-session-helpers.ts` already attaches the resolved runtime's `promptWithFallback` to sessions so ordinary `pi.promptWithFallback` can delegate correctly.
   - `packages/core/src/ai-engine-loader.ts` proves core cannot statically import engine and already uses a cycle-safe injected `CreateAiSessionFactory`.
   - `packages/engine/src/index.ts` already registers both `createFnAgent` and a plugin-facing AI session adapter into core.

Therefore the best decision is not "add another gateway." It is "complete and deepen the existing runtime/session factory boundary, then migrate production callers to it."

## 4. Why the Runner-Ups Lost

C3 lost for ordering reasons, not merit. Multi-account identity is a required later refactor, but it depends on a real invocation-time policy hook. Without this decision, account support risks becoming UI/storage work that does not reliably affect the model call that actually runs.

C4 lost for coverage reasons. The local DSPy repo has strong account and routing machinery, including `SubscriptionLM`, `AccountRegistry`, provider homes, identity probing, and CLI account commands. But Fusion's current call sites are not consistently runtime-resolved. A DSPy runtime would be leaky until the session boundary is complete.

C2 lost because it is too small for the user's central product prompt. It should be handled as hygiene, especially around `production`, `.agent/`, and remotes, but it does not solve model routing complexity.

C5 lost because the internal architecture decision does not require waiting on Cursor, MiniMax, Codex, Claude Code, or NVIDIA NIM documentation. Those docs are necessary before provider-specific login and DSPy sidecar implementation, not before choosing the refactor boundary.

## 5. Success Criteria

The future plan succeeds when:

- Production LLM session creation no longer has scattered direct policy decisions across dashboard, engine, core, and CLI call sites.
- Any caller that needs model execution can use one runtime-aware engine/core factory path without importing pi-specific details unless it is the pi runtime implementation itself.
- Existing tests for runtime resolution, runtime selection, pi fallback, and session helper behavior still pass.
- New or updated tests prove at least one current direct bypass no longer bypasses runtime resolution.
- Existing behavior remains unchanged when no runtime hint, account policy, or DSPy toggle is configured.
- Core still has no static dependency on `@fusion/engine`.
- Dashboard and CLI do not gain direct dependency on DSPy or account-pool internals as part of this refactor.
- No changeset is required unless the selected implementation changes published CLI/package behavior.

## 6. First Safe Slice

The first safe slice for the later ExecPlan should be a no-behavior-change consolidation slice:

Introduce or extend a narrow runtime-aware session creation API that preserves current `createFnAgent` behavior by default, then migrate one non-critical direct bypass to it with focused tests. The best first probe remains `packages/engine/src/research/providers/llm-synthesis-provider.ts` or `packages/engine/src/cron-runner.ts`, because both are direct engine call sites and avoid the core-to-engine injection cycle.

Do not start with dashboard-wide migration, account UI, DSPy sidecar startup, or production install/purge.

## 7. Abandonment Conditions

Abandon or revise this decision if the planning pass proves any of these:

- The consolidated boundary creates a new core-to-engine static import cycle.
- Existing runtime fallback or prompt compaction behavior cannot be preserved without duplicating pi internals.
- Most direct call sites require bespoke callback, streaming, or cancellation behavior that cannot fit a single deep interface.
- The change would require modifying high-churn dashboard routes before any focused engine slice can be tested.
- The resulting interface exposes more concepts to callers than the current direct `createFnAgent` pattern.

If abandoned, select C3 only if account identity can be added as read-only/storage-only groundwork without changing model execution. Select C4 only if a DSPy runtime can be proven to cover the selected target flows without global call-site migration.

## 8. Hard Constraints for `execplan-create`

Preserve these constraints:

- Do not create an ExecPlan inside this selection step.
- Preserve current pi/default behavior exactly when no runtime override is configured.
- Preserve prompt fallback, context compaction, fallback model/session switching, and session disposal behavior.
- Keep `@fusion/core` independent from `@fusion/engine` through the existing injection pattern.
- Prefer deepening `AgentRuntime`, `runtime-resolution`, `agent-session-helpers`, and `CreateAiSessionFactory` over creating a new shallow forwarding wrapper.
- Keep DSPy integration out of the first refactor except as a documented future insertion point.
- Keep multi-account auth out of the first refactor except as a documented future policy input.
- Do not touch branch/release/install workflows in the first refactor unless required by tests or package behavior.
- Add focused behavioral tests; typechecks alone are not enough.
- Avoid broad edits in `packages/dashboard/src/routes.ts`, `packages/core/src/store.ts`, `packages/engine/src/executor.ts`, and `packages/engine/src/merger.ts` until a smaller slice proves the boundary.
