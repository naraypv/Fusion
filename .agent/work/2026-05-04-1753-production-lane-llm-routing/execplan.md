# Route Production LLM Calls Through the Runtime-Aware Session Boundary

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan follows `.agent/PLANS.md` from the repository root. Keep this file self-contained when revising it: future implementers should not need the prior chat, candidate brief, or decision artifact to understand the work.

## Purpose / Big Picture

After this change, Fusion will have one clear runtime-aware path for creating and prompting AI agent sessions. A "runtime" in this repository means the implementation that creates and prompts an agent session, such as the default pi runtime or a plugin-provided runtime. Today many production callers import `createFnAgent` directly and decide their own create, prompt, fallback, and disposal sequence. That spreads policy across engine, dashboard, and core code.

The user-visible benefit is indirect but important: later work can add multi-account routing and optional DSPy routing without hunting through every AI feature and dashboard route. The observable behavior for this refactor is that existing AI features still behave the same when no runtime override is configured, while tests and import checks show that production callers use the runtime-aware boundary instead of pi-specific entry points.

The complexity dividend is a simpler mental model: callers ask for a resolved agent session or a resolved prompt run, and the engine owns runtime selection, fallback to pi, prompt retry, and compaction behavior.

## Progress

- [x] (2026-05-04T22:08:51Z) Created this ExecPlan from the active decided work item.
- [x] (2026-05-04T22:08:51Z) Installed and read repo-local `.agent/PLANS.md` because it was missing.
- [x] (2026-05-04T22:08:51Z) Inspected the current runtime/session files, direct call sites, and nearby tests.
- [ ] Add a deep prompt-session helper in `packages/engine/src/agent-session-helpers.ts` that hides session creation, prompting, text capture, runtime metadata, and disposal for simple prompt callers.
- [ ] Extend the session purpose model with one broad purpose for non-task utility prompts, avoiding one purpose per feature.
- [ ] Migrate low-risk engine callers away from direct `createFnAgent` and `promptWithFallback` imports.
- [ ] Migrate core AI utilities from the legacy `getFnAgent` path to the engine-injected `CreateAiSessionFactory` path, preserving the no static core-to-engine dependency.
- [ ] Migrate dashboard AI callers away from direct `createFnAgent` imports where behavior can be preserved.
- [ ] Add a boundary regression test or source scan so new production code does not reintroduce direct pi session creation.
- [ ] Run targeted engine, core, and dashboard tests, then run the workspace verification command if time permits.

## Surprises & Discoveries

- Observation: The runtime boundary already exists but is only partially used.
  Evidence: `packages/engine/src/runtime-resolution.ts` defines `DefaultPiRuntime` and plugin runtime lookup, while `packages/engine/src/agent-session-helpers.ts` defines `createResolvedAgentSession`, `promptWithAutoRetry`, and `describeAgentModel`.

- Observation: Some existing code already knows that prompt dispatch can silently bypass a plugin runtime unless the resolved runtime attaches its prompt method to the session.
  Evidence: `packages/engine/src/agent-session-helpers.ts` attaches `runtime.promptWithFallback` to sessions that do not already expose it, and the comment says this prevents plugin runtimes from being bypassed by `pi.promptWithFallback`.

- Observation: Core cannot directly import engine.
  Evidence: `packages/core/src/ai-engine-loader.ts` says core uses injection because engine depends on core and a static import would create a cycle.

- Observation: Direct production AI call sites remain broad.
  Evidence: A source search found direct `createFnAgent(` call sites in dashboard helpers such as `packages/dashboard/src/planning.ts`, `packages/dashboard/src/ai-refine.ts`, `packages/dashboard/src/roadmap-suggestions.ts`, `packages/dashboard/src/mission-interview.ts`, and in engine helpers such as `packages/engine/src/research/providers/llm-synthesis-provider.ts`, `packages/engine/src/cron-runner.ts`, and `packages/engine/src/agent-reflection.ts`.

- Observation: Tests already cover several target areas and will need mock updates.
  Evidence: Relevant tests include `packages/engine/src/__tests__/runtime-resolution.test.ts`, `packages/engine/src/__tests__/runtime-selection-regression.test.ts`, `packages/engine/src/__tests__/agent-session-helpers.test.ts`, `packages/engine/src/research/providers/__tests__/llm-synthesis-provider.test.ts`, `packages/engine/src/__tests__/cron-runner.test.ts`, `packages/engine/src/__tests__/agent-reflection.test.ts`, `packages/core/src/__tests__/ai-engine-loader.test.ts`, and multiple dashboard tests that mock `@fusion/engine`.

## Decision Log

- Decision: Deepen existing `AgentRuntime`, `runtime-resolution`, `createResolvedAgentSession`, and `CreateAiSessionFactory` surfaces rather than add a new generic gateway module.
  Rationale: The existing runtime/session boundary already hides meaningful policy. A new gateway would likely become a shallow forwarding layer unless it replaced that boundary, which would add cognitive load.
  Date/Author: 2026-05-04 / Codex

- Decision: Add at most one broad new session purpose for non-task prompt work, such as `utility`.
  Rationale: Existing purposes such as `executor`, `triage`, and `reviewer` are lifecycle roles. Research synthesis, cron prompt steps, reflection, and dashboard utility prompts should not each create a separate concept unless runtime policy actually differs.
  Date/Author: 2026-05-04 / Codex

- Decision: Keep DSPy and multi-account support out of this implementation.
  Rationale: This refactor creates the insertion point those features need. Implementing them now would mix provider-specific account work and Python sidecar behavior into a boundary consolidation task.
  Date/Author: 2026-05-04 / Codex

- Decision: Do not remove the exported `createFnAgent` API in this refactor.
  Rationale: It is part of the engine public surface and is used by pi/default runtime implementation and compatibility paths. The goal is to migrate production callers, not break external or test-only consumers.
  Date/Author: 2026-05-04 / Codex

## Outcomes & Retrospective

No implementation has been completed yet. At completion, record which direct call sites remain allowed, which tests prove the boundary, and whether any migration was deferred because it required bespoke streaming, cancellation, or dashboard test rewrites.

## Context and Orientation

Fusion is a pnpm TypeScript workspace. The packages relevant to this work are:

- `packages/core`: shared domain types, stores, and helpers. It must not statically import `@fusion/engine`.
- `packages/engine`: task execution and AI runtime code. This package owns pi agent creation and runtime selection.
- `packages/dashboard`: server routes and AI-assisted planning/chat helpers. It can import `@fusion/engine`.
- `packages/cli`: published package entry points. Avoid behavior changes here unless needed for tests or build correctness.

The current low-level pi session API is in `packages/engine/src/pi.ts`. The function `createFnAgent` creates a pi-backed agent session. The function `promptWithFallback` prompts a session and handles retry, context compaction, and model fallback. This file should remain the pi implementation detail.

The runtime abstraction is in `packages/engine/src/agent-runtime.ts`. `AgentRuntime` is the interface every runtime must implement. It has `createSession`, `promptWithFallback`, and `describeModel`.

The runtime selector is in `packages/engine/src/runtime-resolution.ts`. It chooses a plugin runtime when a runtime hint is configured and otherwise returns the default pi runtime. `DefaultPiRuntime` is the only place outside `pi.ts` that should normally call `createFnAgent` directly to implement the default runtime.

The session helper is in `packages/engine/src/agent-session-helpers.ts`. `createResolvedAgentSession` already asks the runtime resolver for a runtime, creates a session through that runtime, and attaches the runtime prompt method to the session when needed. `promptWithAutoRetry` and `describeAgentModel` are the public helper names callers should use instead of importing pi-specific prompt functions.

The core injection point is in `packages/core/src/ai-engine-loader.ts`. Core cannot import engine, so engine registers functions into core when `packages/engine/src/index.ts` loads. There are two paths today: a legacy `getFnAgent` path and a `getCreateAiSessionFactory` path. The plan should move core utility callers toward the factory path because it can be made runtime-aware without requiring core to know engine internals.

Important direct production call sites today include:

- `packages/engine/src/research/providers/llm-synthesis-provider.ts`: creates a readonly synthesis session and races prompting against abort and timeout handling.
- `packages/engine/src/cron-runner.ts`: `createAiPromptExecutor` creates a readonly session, captures streamed text through `onText`, prompts, and disposes the session.
- `packages/engine/src/agent-reflection.ts`: creates a readonly session, captures streamed reflection text, prompts, checks session errors, and disposes the session.
- `packages/core/src/ai-summarize.ts` and `packages/core/src/memory-compaction.ts`: call `getFnAgent`, create a session, then call `session.prompt` directly.
- `packages/dashboard/src/chat.ts`: sometimes uses `createResolvedAgentSession` when an agent runtime hint exists, but falls back to direct `createFnAgent` when there is no hint.
- `packages/dashboard/src/insights-routes.ts` and `packages/dashboard/src/routes.ts`: create sessions and prompt directly for route-level AI features.
- Dashboard planning helpers such as `packages/dashboard/src/planning.ts`, `packages/dashboard/src/ai-refine.ts`, `packages/dashboard/src/roadmap-suggestions.ts`, `packages/dashboard/src/agent-onboarding.ts`, `packages/dashboard/src/agent-generation.ts`, `packages/dashboard/src/mission-interview.ts`, `packages/dashboard/src/milestone-slice-interview.ts`, and `packages/dashboard/src/subtask-breakdown.ts`.

The desired end state is not that `createFnAgent` disappears. The desired end state is that production features outside the runtime implementation ask for runtime-aware sessions or prompt runs, and pi-specific creation remains behind the runtime implementation and compatibility layer.

## Plan of Work

First, strengthen the engine session helper as the deep module. In `packages/engine/src/runtime-resolution.ts`, add one broad session purpose, preferably `utility`, for one-off non-task prompts. Update `packages/engine/src/__tests__/runtime-resolution.test.ts` so the no-hint default pi behavior is tested for this new purpose along with existing purposes. Do not add separate purposes like `research`, `cron`, `reflection`, or `dashboard` unless a runtime policy actually differs.

Then extend `packages/engine/src/agent-session-helpers.ts` with a helper for simple prompt lifecycles. Name it `runResolvedAgentPrompt` unless an existing local naming pattern suggests a clearer name. This function should accept all `ResolvedSessionOptions` plus a `prompt` string. It should create a runtime-resolved session, compose an internal `onText` collector with any caller-provided `onText`, prompt through `promptWithAutoRetry`, return captured text, copied session messages, runtime metadata, and model description, and dispose the session in a `finally` block. If disposal throws, log a warning through the existing `agent-session` logger and still preserve the original prompt result or error.

The helper should hide the common sequence currently repeated by callers: create a session, prompt it with retry/compaction behavior, collect output, inspect messages, and dispose the session. It is acceptable for complex callers with explicit timeout races to keep using `createResolvedAgentSession` plus `promptWithAutoRetry` directly, but they must import those helpers rather than `createFnAgent` or pi `promptWithFallback`.

Update `packages/engine/src/__tests__/agent-session-helpers.test.ts`. Add behavioral tests that prove `runResolvedAgentPrompt` calls the resolved runtime, captures `onText` output, forwards text to a caller-supplied `onText` callback, returns runtime metadata, disposes sessions on success, disposes sessions on prompt failure, and preserves the original prompt error if disposal also fails. Keep existing extraction tests for runtime hints and runtime model fields.

Next, migrate the low-risk engine call sites. In `packages/engine/src/cron-runner.ts`, replace direct imports from `./pi.js` with `runResolvedAgentPrompt`. Keep `createAiPromptExecutor(cwd)` behavior the same: it should return the streamed response text and log disposal warnings. Since the new helper owns disposal, remove the local disposal `finally` only after a test proves the warning behavior is preserved. In `packages/engine/src/__tests__/cron-runner.test.ts`, update mocks so the test exercises the helper or the runtime-resolution path, not direct pi mocks.

In `packages/engine/src/agent-reflection.ts`, replace direct session creation and prompt calls with `runResolvedAgentPrompt`. Preserve the existing behavior that reflection returns null when no recent context exists, captures response text, parses reflection output, and surfaces session state errors. Add or update a test in `packages/engine/src/__tests__/agent-reflection.test.ts` that proves the helper is called with `sessionPurpose: "utility"`, `tools: "readonly"`, and the configured `defaultProvider` / `defaultModelId`.

In `packages/engine/src/research/providers/llm-synthesis-provider.ts`, use the lower-level `createResolvedAgentSession` and `promptWithAutoRetry` helpers rather than `runResolvedAgentPrompt`, because the current provider has explicit abort and timeout race semantics. Preserve the current `Promise.race` behavior, source budgeting, citation extraction, confidence extraction, provider-unavailable mapping, abort mapping, timeout mapping, and disposal. Update `packages/engine/src/research/providers/__tests__/llm-synthesis-provider.test.ts` so it mocks `agent-session-helpers.ts` instead of `pi.ts` and asserts that synthesis creates a runtime-resolved readonly utility session.

After the engine callers are green, update core AI utility callers. In `packages/core/src/plugin-types.ts`, extend `CreateAiSessionOptions` only with fields that are already safe to pass through to engine runtime options, such as `defaultThinkingLevel`, `fallbackProvider`, `fallbackModelId`, `sessionPurpose`, and `runtimeHint`. Keep these optional. Extend `AiSessionResult.session` with optional `promptWithFallback(text, options?)` and optional `dispose()` so core can use richer sessions when engine provides them while remaining compatible with tests that only provide `prompt`.

In `packages/core/src/ai-engine-loader.ts`, keep `setCreateFnAgent` and `getFnAgent` for compatibility, but document them as legacy. Add a tiny core-local helper if useful, for example `promptAiSession(session, prompt)`, that calls `session.promptWithFallback(prompt)` when available and otherwise falls back to `session.prompt(prompt)`. This helper must live in core and must not import engine.

In `packages/engine/src/index.ts`, change `_createAiSessionAdapter` so it calls `createResolvedAgentSession` with `sessionPurpose: options.sessionPurpose ?? "utility"`, forwards the safe option fields, and uses the no-op plugin runner fallback when no plugin runner is available. This keeps core independent while making core-created sessions follow the same runtime-aware path. Preserve the existing module-load registration into core.

In `packages/core/src/ai-summarize.ts` and `packages/core/src/memory-compaction.ts`, migrate from `getFnAgent` to `getCreateAiSessionFactory` where possible. Preserve all current validation, debug logging, prompts, output extraction, error mapping, and disposal. The only behavior change should be that prompt dispatch can use `promptWithFallback` when the engine-registered factory supplies it. Update `packages/core/src/__tests__/ai-engine-loader.test.ts` and add focused tests in the existing core test files or nearby `__tests__` files for the utility functions if they already exist.

Then migrate dashboard call sites in controlled groups. Begin with `packages/dashboard/src/chat.ts`, because it already uses `createResolvedAgentSession` when a runtime hint exists. Remove the branch that calls `createFnAgent` directly. Always call `createResolvedAgentSession` with `runtimeHint` possibly undefined, pass `this.pluginRunner`, and keep `sessionPurpose: "executor"` unless there is a better existing semantic reason. Keep all abort handling, active generation tracking, streamed tool events, and error broadcasting unchanged.

Next update the route-level direct callers in `packages/dashboard/src/insights-routes.ts` and the workflow-step AI paths in `packages/dashboard/src/routes.ts`. For simple prompt-and-capture cases, use `runResolvedAgentPrompt`. For explicit timeout races, use `createResolvedAgentSession` plus `promptWithAutoRetry` to preserve cancellation and timeout behavior. Update tests such as `packages/dashboard/src/__tests__/insights-routes.test.ts` and `packages/dashboard/src/__tests__/routes-agents.test.ts` to mock the new engine helper exports instead of only `createFnAgent` and `promptWithFallback`.

Finally migrate dashboard planning and generation helper modules that create long-lived or interactive agent sessions: `packages/dashboard/src/planning.ts`, `packages/dashboard/src/mission-interview.ts`, `packages/dashboard/src/milestone-slice-interview.ts`, `packages/dashboard/src/subtask-breakdown.ts`, `packages/dashboard/src/ai-refine.ts`, `packages/dashboard/src/roadmap-suggestions.ts`, `packages/dashboard/src/agent-onboarding.ts`, and `packages/dashboard/src/agent-generation.ts`. These modules often have test-only setters named like `__setCreateFnAgent`. Preserve testability by renaming or adapting those setters only when necessary, and update tests in the same slice. Do not collapse streaming/session-resume behavior into `runResolvedAgentPrompt` if the module needs a live session across multiple turns. Use `createResolvedAgentSession` for those interactive cases.

Add a boundary regression test after the migrations are complete. A good location is `packages/engine/src/__tests__/runtime-boundary-imports.test.ts` or another focused engine test. The test should read source files and fail if production files import `createFnAgent` or `promptWithFallback` from `pi.js` or `@fusion/engine` outside an explicit allowlist. The allowlist should include `packages/engine/src/pi.ts`, `packages/engine/src/runtime-resolution.ts`, `packages/engine/src/index.ts`, tests, mocks, and comments only when they are not production imports. This test is intentionally structural because the refactor's behavior is a boundary invariant: new production AI features should not bypass runtime resolution.

Throughout the work, do not introduce account selection or DSPy execution. The only mention of those future capabilities should be comments or tests that describe the runtime boundary as the future policy insertion point.

## Concrete Steps

Work from the repository root:

    cd /media/naray/backup_np_2/github/Fusion
    git status --short --branch

Expect the branch to be `main...origin/main [ahead 1]` plus untracked `.agent` planning artifacts unless that has changed.

Before editing, record the current direct call-site baseline:

    rg -n "createFnAgent\\(" packages/engine/src packages/dashboard/src packages/core/src packages/cli/src --glob '!**/__tests__/**'
    rg -n "promptWithFallback\\(" packages/engine/src packages/dashboard/src packages/core/src packages/cli/src --glob '!**/__tests__/**'
    rg -n "createResolvedAgentSession\\(" packages/engine/src packages/dashboard/src packages/core/src packages/cli/src --glob '!**/__tests__/**'

Use the output to avoid missing a production call site. Do not count `packages/engine/src/pi.ts`, `packages/engine/src/runtime-resolution.ts`, or `packages/engine/src/index.ts` as violations, because they implement or register the boundary.

Implement the engine helper changes first. Edit:

- `packages/engine/src/runtime-resolution.ts`
- `packages/engine/src/agent-session-helpers.ts`
- `packages/engine/src/__tests__/runtime-resolution.test.ts`
- `packages/engine/src/__tests__/agent-session-helpers.test.ts`
- `packages/engine/src/__tests__/runtime-selection-regression.test.ts` if existing assertions need the new helper covered

Run the focused engine boundary tests:

    pnpm --filter @fusion/engine exec vitest run src/__tests__/runtime-resolution.test.ts src/__tests__/agent-session-helpers.test.ts src/__tests__/runtime-selection-regression.test.ts --silent=passed-only --reporter=dot

Expected result: all listed tests pass. If a test fails because the mock session lacks `dispose`, either make disposal optional in the helper or update the mock to include it, matching real sessions.

Migrate the low-risk engine call sites and their tests. Edit:

- `packages/engine/src/cron-runner.ts`
- `packages/engine/src/__tests__/cron-runner.test.ts`
- `packages/engine/src/agent-reflection.ts`
- `packages/engine/src/__tests__/agent-reflection.test.ts`
- `packages/engine/src/research/providers/llm-synthesis-provider.ts`
- `packages/engine/src/research/providers/__tests__/llm-synthesis-provider.test.ts`

Run:

    pnpm --filter @fusion/engine exec vitest run src/__tests__/cron-runner.test.ts src/__tests__/agent-reflection.test.ts src/research/providers/__tests__/llm-synthesis-provider.test.ts --silent=passed-only --reporter=dot

Expected result: all listed tests pass. Confirm the tests assert runtime-aware helpers rather than pi mocks for the migrated call sites.

Migrate core factory use. Edit:

- `packages/core/src/plugin-types.ts`
- `packages/core/src/ai-engine-loader.ts`
- `packages/core/src/ai-summarize.ts`
- `packages/core/src/memory-compaction.ts`
- `packages/core/src/__tests__/ai-engine-loader.test.ts`
- `packages/engine/src/index.ts`

Run:

    pnpm --filter @fusion/core exec vitest run src/__tests__/ai-engine-loader.test.ts --silent=passed-only --reporter=dot
    pnpm --filter @fusion/engine exec vitest run src/__tests__/runtime-selection-regression.test.ts --silent=passed-only --reporter=dot

If core has existing AI utility tests, add them to the command. If there are no focused tests for `ai-summarize.ts` or `memory-compaction.ts`, add small tests that register a fake `CreateAiSessionFactory`, assert it is called, and assert prompting prefers `promptWithFallback` when available.

Migrate dashboard in small groups. Begin with:

- `packages/dashboard/src/chat.ts`
- `packages/dashboard/src/insights-routes.ts`
- `packages/dashboard/src/routes.ts`
- `packages/dashboard/src/test/mockCoreEngine.ts`
- `packages/dashboard/src/__tests__/chat.test.ts`
- `packages/dashboard/src/__tests__/insights-routes.test.ts`
- `packages/dashboard/src/__tests__/routes-agents.test.ts`

Run:

    pnpm --filter @fusion/dashboard exec vitest run src/__tests__/chat.test.ts src/__tests__/insights-routes.test.ts src/__tests__/routes-agents.test.ts --silent=passed-only --reporter=dot

Then migrate the planning and generation modules one at a time. After each module, run its focused test before moving on:

    pnpm --filter @fusion/dashboard exec vitest run src/__tests__/planning.test.ts --silent=passed-only --reporter=dot
    pnpm --filter @fusion/dashboard exec vitest run src/__tests__/mission-interview.test.ts src/__tests__/milestone-slice-interview.test.ts --silent=passed-only --reporter=dot
    pnpm --filter @fusion/dashboard exec vitest run src/__tests__/subtask-breakdown.test.ts --silent=passed-only --reporter=dot
    pnpm --filter @fusion/dashboard exec vitest run src/__tests__/ai-refine.test.ts src/__tests__/roadmap-suggestions.test.ts src/__tests__/agent-onboarding.test.ts src/__tests__/agent-generation.test.ts --silent=passed-only --reporter=dot

Add the boundary regression test, then run:

    pnpm --filter @fusion/engine exec vitest run src/__tests__/runtime-boundary-imports.test.ts --silent=passed-only --reporter=dot

When focused tests pass, run the broader checks:

    pnpm --filter @fusion/engine test
    pnpm --filter @fusion/core test
    pnpm --filter @fusion/dashboard test
    pnpm build

If time and machine capacity allow, run the repository verification:

    VITEST_MAX_WORKERS=4 pnpm test
    pnpm verify:workspace

The project documentation says tests are required and typechecks are not substitutes for tests. Do not report completion with only `pnpm build`.

## Validation and Acceptance

The refactor is accepted when all of these are true:

1. Existing behavior is preserved when no runtime hint is configured. In tests, a call with no runtime hint still resolves runtime id `pi` and `wasConfigured: false`.

2. A configured plugin runtime still wins when a runtime hint matches. The existing runtime resolution tests for plugin runtime lookup continue to pass.

3. Prompt fallback and compaction behavior remain owned by the runtime path. Callers use `promptWithAutoRetry`, `runResolvedAgentPrompt`, or `createResolvedAgentSession` plus `promptWithAutoRetry`; production callers do not import pi `promptWithFallback` directly except in allowlisted runtime implementation files.

4. Core still has no static import from `@fusion/engine`. Verify with:

    rg -n "from ['\\\"]@fusion/engine|import\\(['\\\"]@fusion/engine" packages/core/src

Expected result: no production core imports from `@fusion/engine`.

5. The production direct import check has only allowlisted results. Verify with:

    rg -n "import .*createFnAgent|import .*promptWithFallback|from ['\\\"].*pi\\.js['\\\"]|from ['\\\"]@fusion/engine['\\\"]" packages/engine/src packages/dashboard/src packages/core/src packages/cli/src --glob '!**/__tests__/**'

Expected result: direct pi imports remain only in `packages/engine/src/pi.ts`, `packages/engine/src/runtime-resolution.ts`, and any explicitly justified compatibility export in `packages/engine/src/index.ts`. Dashboard and core production call sites should use runtime-aware helpers rather than `createFnAgent`.

6. Focused tests pass for engine, core, and dashboard modules listed in Concrete Steps.

7. `pnpm build` passes.

8. If the implementation changes the published `@runfusion/fusion` package behavior, a changeset exists under `.changeset/`. If the implementation is purely internal behavior preservation with tests, no changeset is required.

## Idempotence and Recovery

The implementation is safe to do in slices. If a dashboard module migration causes broad test failures, revert only that module's changes and keep already passing engine/core boundary changes. Do not revert unrelated user or agent changes in the worktree.

If a helper migration changes timeout or abort behavior, stop and keep that call site on the lower-level `createResolvedAgentSession` plus `promptWithAutoRetry` pattern. The deep helper is for simple prompt lifecycles; preserving behavior is more important than forcing every call through one function.

If the source-scan boundary test is too strict because a compatibility export must remain, add a narrow allowlist entry with a comment naming why that file is allowed. Do not broaden the allowlist to entire directories.

If `pnpm verify:workspace` is too slow or fails outside the touched area, record the exact failure in this plan's `Surprises & Discoveries` and still run the focused tests for all touched modules.

The work should not touch the user's live dashboard on port 4040. If manual server testing is needed later, start a server on a random free port, not port 4040.

## Artifacts and Notes

Useful baseline commands from planning:

    rg -l "createFnAgent" packages/engine/src packages/dashboard/src packages/cli/src packages/core/src --glob '!**/__tests__/**' | wc -l
    # Planning-time output: 32

    rg -l "createResolvedAgentSession" packages/engine/src packages/dashboard/src packages/cli/src packages/core/src --glob '!**/__tests__/**' | wc -l
    # Planning-time output: 10

    rg -l "promptWithFallback" packages/engine/src packages/dashboard/src packages/cli/src packages/core/src --glob '!**/__tests__/**' | wc -l
    # Planning-time output: 19

These counts include implementation and compatibility files, so they are not themselves acceptance criteria. They are a starting point for locating work.

Relevant current files:

- `packages/engine/src/agent-runtime.ts`
- `packages/engine/src/runtime-resolution.ts`
- `packages/engine/src/agent-session-helpers.ts`
- `packages/engine/src/pi.ts`
- `packages/engine/src/index.ts`
- `packages/core/src/ai-engine-loader.ts`
- `packages/core/src/plugin-types.ts`
- `packages/core/src/ai-summarize.ts`
- `packages/core/src/memory-compaction.ts`
- `packages/dashboard/src/chat.ts`
- `packages/dashboard/src/insights-routes.ts`
- `packages/dashboard/src/routes.ts`

The active work item is `.agent/work/2026-05-04-1753-production-lane-llm-routing/`.

## Interfaces and Dependencies

In `packages/engine/src/runtime-resolution.ts`, update the session purpose type to include one broad utility purpose:

    export type SessionPurpose =
      | "executor"
      | "triage"
      | "reviewer"
      | "merger"
      | "heartbeat"
      | "validation"
      | "utility";

Document `utility` as a non-task, non-review one-shot prompt purpose. It should not change runtime selection behavior by itself.

In `packages/engine/src/agent-session-helpers.ts`, add interfaces with this shape, adjusting names only if local style demands it:

    export interface RunResolvedAgentPromptOptions extends ResolvedSessionOptions {
      prompt: string;
    }

    export interface RunResolvedAgentPromptResult {
      text: string;
      messages: AgentSession["state"]["messages"];
      sessionFile?: string;
      runtimeId: string;
      wasConfigured: boolean;
      modelDescription: string;
    }

    export async function runResolvedAgentPrompt(
      options: RunResolvedAgentPromptOptions,
    ): Promise<RunResolvedAgentPromptResult>;

This helper hides the create, prompt, collect, copy state, describe model, and dispose sequence. It should not hide explicit timeout or abort policies. Callers with custom timeout races can use `createResolvedAgentSession` and `promptWithAutoRetry`.

In `packages/core/src/plugin-types.ts`, extend core's engine-injected factory types without importing engine:

    export interface CreateAiSessionOptions {
      cwd: string;
      systemPrompt: string;
      tools?: "coding" | "readonly";
      defaultProvider?: string;
      defaultModelId?: string;
      defaultThinkingLevel?: string;
      fallbackProvider?: string;
      fallbackModelId?: string;
      sessionPurpose?: string;
      runtimeHint?: string;
    }

    export interface AiSessionResult {
      session: {
        prompt(text: string): Promise<void>;
        promptWithFallback?(text: string, options?: unknown): Promise<void>;
        dispose?(): void;
        state: {
          messages: Array<{
            role: string;
            content?: unknown;
          }>;
          error?: string;
          errorMessage?: string;
        };
      };
      sessionFile?: string;
      runtimeId?: string;
      wasConfigured?: boolean;
    }

The interface hides engine runtime selection from core callers. Core should see only "make an AI session" and "prompt it safely if the session supports fallback".

In `packages/engine/src/index.ts`, update `_createAiSessionAdapter` so core-created sessions use `createResolvedAgentSession` instead of `_createFnAgentForCore` directly. Preserve `setCreateFnAgent(_createFnAgentForCore)` for compatibility, but new core utility migrations should use `getCreateAiSessionFactory`.

Boundary rule after completion: production files outside `packages/engine/src/pi.ts`, `packages/engine/src/runtime-resolution.ts`, and `packages/engine/src/index.ts` should not import `createFnAgent` or pi `promptWithFallback` directly. If a production exception remains, document it in this plan and in the boundary regression test allowlist with the reason.

## Plan Revision Note

2026-05-04T22:08:51Z: Initial ExecPlan created from the locked refactor decision. The plan focuses on deepening the existing runtime/session boundary and explicitly defers DSPy and multi-account implementation so the first change can preserve behavior while reducing scattered invocation policy.
