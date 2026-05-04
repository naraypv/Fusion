# Refactor Candidate Shortlist: Production Lane, Multi-Account Auth, DSPy Routing

Created: 2026-05-04T21:53:59Z

Source prompt: `.agent/user-intent.md`

Workflow status: candidate discovery only. This is not an implementation plan. The next step is `select-refactor`, where one candidate is pressure-tested and locked before an ExecPlan is created.

## Prompt Model

The user prompt asks for a custom production lane that can repeatedly sync from upstream `main`, keep local customization isolated on `production`, purge/reinstall an existing Fusion install while preserving daemon key `fn_65238150c60b558aa413a3ec471dedab`, add user-facing multi-account login for Codex, Claude, MiniMax, and Cursor, and optionally route all LLM calls through local DSPy without replacing the existing Fusion call stack.

The work naturally separates into three domains:

1. Lane governance: keep upstream-syncable `main` separate from custom `production`, ignore agent markdown/worktree artifacts, and preserve release/install safety.
2. Account identity: support multiple accounts per provider with dedupe, status, login, key storage, and future selection policy.
3. Invocation routing: route all model calls through a central surface so a DSPy-backed path can be toggled without rewriting every caller.

The strongest refactor should make later feature work smaller, not merely patch a single route.

## Evidence Snapshot

- Repo state on 2026-05-04: local `main` is ahead of `origin/main` by one commit; no local `production` branch is present.
- `.agent/user-intent.md:4` says this fork must sync upstream repeatedly.
- `.agent/user-intent.md:5-7` says `main` is the sync source, `production` is the customization lane, and `main` must never integrate production customizations.
- `.agent/user-intent.md:10-12` requires daily merge/integration checks, modular custom changes, and no guessing.
- `.agent/user-intent.md:28-32` requires multi-account login and dedupe for Codex, Claude, MiniMax, and Cursor.
- `.agent/user-intent.md:33` requires native DSPy support using `/media/naray/backup_np_2/github/dspy`, behind a toggle, with parallel routing infrastructure and without replacing the old call stack.
- `docs/architecture.md:61-69` defines the package split: core, engine, dashboard, CLI, and published `@runfusion/fusion`.
- `docs/settings-reference.md:9-14` defines global settings in `~/.fusion/settings.json` and project settings in `.fusion/config.json`.
- `docs/settings-reference.md:37-40` and `packages/core/src/model-resolution.ts:111-148` show model resolution is currently provider/model selection, not account selection or routing policy.
- `packages/engine/src/agent-runtime.ts:25-78` defines the current runtime options surface; it does not carry a declarative account pool or DSPy module contract.
- `packages/engine/src/runtime-resolution.ts:69-92` already wraps the default pi runtime behind an `AgentRuntime` interface.
- `packages/engine/src/agent-session-helpers.ts:115-160` already centralizes resolved agent session creation and keeps runtime `promptWithFallback` attached.
- `packages/engine/src/research/providers/llm-synthesis-provider.ts:4` and `:54-60` directly import and call `createFnAgent`, bypassing the runtime resolver.
- `packages/cli/src/commands/provider-auth.ts:19-30` exposes a single-provider `DashboardAuthStorage.get(providerId)` interface.
- `packages/dashboard/src/routes/register-auth-routes.ts:189-238` reports one auth status row per provider, not multiple accounts.
- `packages/dashboard/src/routes/register-auth-routes.ts:520-640` starts one login flow per provider and blocks concurrent logins per provider.
- `packages/dashboard/src/routes/register-auth-routes.ts:786-820` saves one API key credential per provider.
- The local DSPy checkout already has `SubscriptionLM`, an account registry, account identity probing, isolated provider homes, and tests for account dedupe and multi-account behavior.
- Non-test LLM session/prompt path references appear in 35 files; auth/provider references appear in 36 files. Direct caller cleanup is likely high risk unless a boundary is established first.
- Large/high-churn files include `packages/engine/src/executor.ts`, `packages/core/src/store.ts`, `packages/engine/src/merger.ts`, `packages/dashboard/src/routes.ts`, and `packages/core/src/types.ts`; broad edits in these files should be avoided unless the selected refactor requires them.

## Candidate Ranking

1. C1: Centralize all agent LLM calls behind one invocation gateway.
2. C3: Add a separate multi-account identity domain and bridge it into existing auth.
3. C4: Add DSPy as a sidecar/plugin runtime instead of rewriting model calls in Node.
4. C2: Minimal production-lane hygiene and guardrails only.
5. C5: Do nothing until upstream/docs are pinned.

Provisional leader: C1. It is the smallest structural move that reduces risk for both multi-account routing and DSPy toggling. C3 and C4 are strong but should land after the invocation boundary is selected, because account routing and DSPy execution need a single place to attach.

## Atomistic Selection Task List

These tasks are for candidate selection, not implementation.

1. Confirm branch and release constraints.
   - Verify whether an upstream remote exists or needs to be added.
   - Verify whether `production` exists remotely even though it is absent locally.
   - Confirm whether `.agent/` artifacts should be ignored globally, repo-locally, or both.
   - Confirm whether changeset creation applies to the selected refactor.

2. Trace every production LLM invocation.
   - List every non-test caller of `createFnAgent`, `createResolvedAgentSession`, `promptWithFallback`, and direct provider clients.
   - Classify each caller as engine task execution, triage/planning, review/validation, merger, research/synthesis, dashboard API, CLI extension, or plugin runtime.
   - Mark whether the caller already uses `createResolvedAgentSession`.
   - Mark whether the caller has timeout/fallback semantics that must survive unchanged.

3. Trace account/auth storage boundaries.
   - Enumerate all writes to `~/.fusion/agent/auth.json`, `~/.fusion/settings.json`, project `.fusion/config.json`, and model auth endpoints.
   - Separate provider credentials from account identities.
   - Identify every response shape consumed by dashboard UI and CLI commands.
   - Identify which paths can remain provider-level while account support is added in parallel.

4. Trace DSPy integration options.
   - Validate the local DSPy package import path and active branch.
   - Verify `SubscriptionLM` can be called from a tiny Python smoke command using only local account registry data.
   - Decide whether Fusion should shell out to a Python sidecar, spawn a long-lived service, or call a plugin runtime.
   - Record which DSPy skill workflow is needed later: spec, program, metric, baseline, GEPA, export/deploy.

5. Pressure-test the provisional leader.
   - Pick one direct bypass call site such as `llm-synthesis-provider.ts`.
   - Sketch a no-op routing wrapper that preserves today's provider/model/fallback behavior.
   - Verify whether all existing tests can mock the wrapper without mocking pi internals.
   - Reject C1 if the wrapper would create circular imports or force broad changes in dashboard/core.

6. Select one candidate.
   - Lock exactly one refactor objective.
   - Write the smallest explicit success contract.
   - Only then create the ExecPlan or task breakdown.

## C1: Centralize All Agent LLM Calls Behind One Invocation Gateway

Class: deepen module / stable boundary extraction

Core idea: introduce or formalize a single engine-owned invocation boundary that owns "given a Fusion task/user flow, choose runtime, provider/model, account policy, fallback policy, and prompt dispatch." Existing `AgentRuntime`, `runtime-resolution`, and `createResolvedAgentSession` are close to this boundary, but direct callers still bypass it and the boundary does not yet represent account pools or DSPy toggles.

Why it fits:

- The prompt requires "route all LLM calls via DSPy behind toggle" while preserving the old call stack.
- The repo already has a runtime abstraction and plugin runtime resolution.
- A central gateway lets DSPy be an alternate runtime path later, not a cross-codebase rewrite.
- Multi-account account selection needs to happen at invocation time; model resolution alone is insufficient.

Likely files:

- `packages/engine/src/agent-runtime.ts`
- `packages/engine/src/runtime-resolution.ts`
- `packages/engine/src/agent-session-helpers.ts`
- `packages/engine/src/pi.ts`
- Direct bypasses such as `packages/engine/src/research/providers/llm-synthesis-provider.ts`
- Focused tests under `packages/engine/src/__tests__/`

Out of scope for this refactor:

- New account login UI.
- Full DSPy GEPA optimization.
- Purging or reinstalling the local Fusion package.
- Changing release flow.

Assumption ledger:

| Assumption | Evidence | Risk | Probe |
| --- | --- | --- | --- |
| Most LLM calls can be brought under the existing runtime abstraction. | `runtime-resolution.ts` and `agent-session-helpers.ts` already centralize many sessions. | Some call sites may depend on pi-specific behavior. | Enumerate and classify all non-test call sites before editing. |
| A gateway can preserve current fallback behavior. | `pi.ts:1276-1360` already owns prompt-time compaction/fallback. | Moving the boundary incorrectly could bypass fallback callbacks. | Add tests around fallback callback preservation before migration. |
| DSPy can later attach at runtime level. | Plugin runtime resolution exists and the prompt wants parallel routing. | DSPy may need richer program/metric semantics than plain prompt dispatch. | Build only a no-op toggle seam first, then evaluate sidecar. |
| This refactor reduces future blast radius. | 35 non-test files mention core prompt/session path. | If many call sites remain direct, value is limited. | Require the selected plan to remove or wrap all direct production bypasses. |

Selection probes:

1. Produce a table of all LLM call sites and whether they use runtime resolution.
2. Prototype one no-op wrapper around `llm-synthesis-provider.ts`.
3. Run the existing focused engine tests for runtime resolution/session helpers.
4. Confirm no circular dependency from core to engine is introduced.
5. Confirm dashboard and CLI do not need direct dependency on the new gateway.

Expected payoff:

- Makes DSPy routing a runtime policy rather than a global rewrite.
- Gives multi-account selection a single insertion point.
- Reduces future inconsistency between task executor, reviewer, merger, research, dashboard, and extension calls.

Primary risk:

- The boundary could grow into a generic service object if it also absorbs auth UI, provider registry, and DSPy sidecar lifecycle. The selected plan must keep it focused on invocation orchestration.

## C2: Minimal Production-Lane Hygiene and Guardrails Only

Class: minimal surgical change

Core idea: avoid touching model/auth logic now. Add only the repo hygiene needed to make later production-lane work safe: ignore `.agent/` and local agent worktrees if needed, document the lane rules, add a lightweight guard script or checklist for `main` vs `production`, and verify branch/remotes.

Why it fits:

- The prompt strongly emphasizes upstream sync safety, no guessing, and modular custom changes.
- The current repo has no local `production` branch.
- `.agent/` is not ignored in the current repo even though the prompt asks for agent markdown/worktrees to stay out of production source flow.
- This can be completed without touching published package behavior.

Likely files:

- `.gitignore`
- `.agent/work/...` artifacts
- Possibly `plan/production-lane.md` or `docs/production-lane.md`
- Possibly `scripts/verify-production-lane.mjs`

Out of scope:

- Multi-account auth.
- DSPy routing.
- CLI login menus.
- Existing install purge.

Assumption ledger:

| Assumption | Evidence | Risk | Probe |
| --- | --- | --- | --- |
| Repo hygiene is currently underspecified. | No local `production`; `.agent/` not in `.gitignore`. | User may want `.agent/` committed for durable planning. | Ask or inspect existing project convention before ignoring. |
| A guard script can reduce branch accidents. | User explicitly says `main` must never integrate production. | A script may be unused if not wired into workflow. | Start with documentation plus manual command checks. |
| This has low regression risk. | No runtime behavior changes. | It does not deliver core product features. | Treat as a preliminary hardening task only. |

Selection probes:

1. Check all remotes and remote branches.
2. Decide whether `.agent/work` should be committed or ignored.
3. Draft the exact branch safety invariant.
4. Verify no changeset is needed because behavior is unchanged.

Expected payoff:

- Fastest way to reduce accidental scope drift.
- Creates a safe base for future work.

Primary risk:

- It may feel productive while leaving the hard architecture problem untouched.

## C3: Add a Separate Multi-Account Identity Domain and Bridge It Into Existing Auth

Class: consolidate duplicate concepts / domain boundary extraction

Core idea: keep existing provider-level auth working, but introduce an explicit account registry domain for multiple Codex, Claude, MiniMax, and Cursor accounts. The registry should track account identity, provider, model preferences, auth home/env key, status, priority, and dedupe fingerprints. Existing auth status endpoints can remain provider-level until new account-aware endpoints and UI are introduced.

Why it fits:

- Current Fusion auth is provider-centric and single credential per provider.
- The prompt asks for "add another account", automatic dedupe, login-and-forget, and multiple providers.
- The local DSPy repo already implements `AccountRef`, registry persistence, identity probing, provider-specific isolated homes, and account CLI commands.
- Separating account identity from provider credentials avoids a risky rewrite of existing auth immediately.

Likely files:

- `packages/core/src/types.ts`
- `packages/core/src/settings-schema.ts`
- `packages/cli/src/commands/provider-auth.ts`
- `packages/dashboard/src/routes/register-auth-routes.ts`
- Dashboard settings/auth UI components
- Bridge code that can read or mirror DSPy account registry entries

Out of scope:

- Replacing all existing provider auth.
- DSPy program optimization.
- Rewriting model resolution in the same step.

Assumption ledger:

| Assumption | Evidence | Risk | Probe |
| --- | --- | --- | --- |
| Account identity should be separate from provider auth. | Current auth status and API key flows are one row per provider. | Duplicate storage may confuse users if UI is not clear. | Add read-only account listing first. |
| DSPy account registry can be reused or mirrored. | Local DSPy has account registry, identity probes, isolated homes, and tests. | Python repo data model may change or not be stable API. | Start with an adapter interface and local smoke tests. |
| Existing provider auth can remain compatible. | Fusion already has settings and provider-level toggles. | Runtime selection may still use old provider credential. | Do not route through accounts until C1 or equivalent exists. |
| Dedupe can be identity-based. | DSPy has account identity probing and auto naming. | Some providers may not expose reliable identity. | Define fallback fingerprints per provider. |

Selection probes:

1. List every auth route and CLI command response shape.
2. Compare Fusion auth storage to DSPy `AccountRef` fields.
3. Prototype a read-only account registry adapter returning no secrets.
4. Verify dashboard can display multiple accounts without breaking old auth status.
5. Add tests around dedupe semantics before adding login mutation.

Expected payoff:

- Directly supports the user-facing multi-account requirement.
- Avoids overloading provider ids like `codex-1`, `codex-2` as fake providers.
- Creates a durable account selection foundation for DSPy and non-DSPy paths.

Primary risk:

- Without C1 or a similar invocation boundary, account selection may become UI-only and fail to influence actual model calls.

## C4: Add DSPy as a Sidecar or Plugin Runtime Instead of Rewriting Model Calls in Node

Class: modular adapter / plugin runtime integration

Core idea: integrate local DSPy through a bounded runtime adapter. The adapter can initially call a Python sidecar or command that uses `/media/naray/backup_np_2/github/dspy` and its `SubscriptionLM`, while Fusion keeps its existing pi/default runtime available behind a toggle. Later, true DSPy programs, metrics, baselines, and GEPA optimization can be added using the DSPy workflow.

Why it fits:

- The prompt says "native DSPy support" but also says "parallel routing infrastructure" and "do not replace old call stack."
- Fusion already has plugin runtime resolution.
- DSPy is Python-native; a sidecar avoids trying to reimplement `SubscriptionLM` in TypeScript.
- The local DSPy repo already has multi-account provider transports for Codex, Claude, Cursor, and MiniMax.

Likely files:

- `packages/engine/src/runtime-resolution.ts`
- `packages/engine/src/agent-runtime.ts`
- A new engine runtime adapter or runtime plugin
- Project/global settings for DSPy toggle and local path
- Focused tests around runtime selection and fallback to pi

Out of scope:

- Full DSPy program optimization in the first refactor.
- Replacing Fusion model registry.
- Moving all credentials into DSPy immediately.

Assumption ledger:

| Assumption | Evidence | Risk | Probe |
| --- | --- | --- | --- |
| DSPy should run out-of-process or as a plugin boundary. | DSPy is local Python code; Fusion is TypeScript/Node. | Sidecar lifecycle and error mapping can become complex. | Start with one stateless smoke command. |
| Existing runtime toggle can select DSPy. | Runtime hints and plugin runtime lookup already exist. | Some call sites bypass runtime selection. | Pair with C1 or require gateway adoption first. |
| SubscriptionLM covers account rotation needs. | DSPy has account pool, registry, transports, and tests. | Fusion may need UI/account state not present in DSPy. | Treat DSPy registry as backend, not dashboard contract. |
| Real DSPy optimization should be deferred. | DSPy workflow requires spec, rich metric, baseline, GEPA, export/deploy. | User may expect immediate "all calls via DSPy" behavior. | Define first milestone as routing-only, not optimization. |

Selection probes:

1. Run a Python import smoke for local DSPy.
2. Run a no-secret `dspy lm accounts list/status` smoke if available.
3. Define the minimal JSON protocol for prompt in/text out/errors.
4. Decide whether the toggle lives in global settings, project settings, or both.
5. Verify existing pi fallback remains active if DSPy sidecar fails.

Expected payoff:

- Uses the strongest existing implementation for multi-account LLM routing.
- Keeps Fusion and DSPy modular and independently upgradeable.
- Avoids a large TypeScript rewrite of provider transports.

Primary risk:

- If adopted before C1, only some LLM paths will honor the DSPy toggle.

## C5: Do Nothing Until Upstream, Docs, and External Interfaces Are Pinned

Class: do nothing / defer

Core idea: make no code or architecture changes yet. First pin upstream branch state, cache external docs, validate the local DSPy branch/API, and decide whether `.agent/` artifacts are source-controlled. This candidate intentionally avoids starting a broad refactor while critical external facts may still drift.

Why it fits:

- The user prompt requires current external docs for Cursor, MiniMax, DSPy, Codex, Claude Code, and NVIDIA NIM.
- The local repo does not currently have a `production` branch.
- The work affects auth, model execution, CLI UX, dashboard UX, and release/install flow.

Likely files:

- No code files.
- Possibly `.agent/work/...` only.
- Possibly future cached-doc manifests after explicit doc-gathering work.

Out of scope:

- Any behavior change.
- Any branch creation.
- Any install purge.

Assumption ledger:

| Assumption | Evidence | Risk | Probe |
| --- | --- | --- | --- |
| External docs materially affect design. | Prompt explicitly requires reading provider docs. | Waiting may block useful internal refactor discovery. | Defer only if selection cannot proceed without docs. |
| No code change is safer than premature architecture. | Multiple large modules and auth surfaces are involved. | User asked for a detailed task list, not a pause. | Use only if branch/doc facts are truly blockers. |
| Upstream state may change. | Prompt emphasizes repeat sync from upstream. | Local evidence is enough for boundary refactor. | Fetch/remotes check before final selection. |

Selection probes:

1. Check whether remote upstream exists and whether `production` exists remotely.
2. Verify local DSPy API and branch.
3. Decide which external docs must be cached before implementation.
4. Resume candidate selection immediately after facts are pinned.

Expected payoff:

- Avoids irreversible design based on stale assumptions.

Primary risk:

- It does not advance the requested project unless used only as a short gating step.

## Selection Recommendation

Select C1 unless the call-site trace shows that most production LLM calls cannot be brought behind the existing runtime/session helper without circular dependencies.

The recommended sequence after selection is:

1. Lock C1 with `select-refactor`.
2. Create an ExecPlan that only centralizes invocation routing and removes bypasses while preserving current behavior.
3. Review recent work after C1 lands.
4. Select C3 for multi-account identity.
5. Select C4 for DSPy runtime integration.
6. Only after C1/C3/C4 are in place, plan the user-facing purge/reinstall/local install/push-production workflow.

This ordering keeps the first refactor testable and reversible. It also avoids mixing branch governance, account identity, and DSPy execution into one high-risk change.
