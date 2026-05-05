# Planning Integration

Fusion-owned plan artifacts are local project state stored under `.fusion/plans/{planId}/`.
Each plan directory contains `goals.json` for the typed `PlanArtifact` payload and
`ledger.jsonl` for append-only lifecycle evidence. `.fusion/` is gitignored project
state, so canonical plan storage stays local by default.

The core contract lives in `packages/core/src/plans/`:

- `types.ts` defines `plan_format_version`, `PlanArtifact`, `PlanGoal`, `PlanBinding`,
  `PlanValidation`, and `PlanLedgerEvent`.
- `validation.ts` rejects missing fields, duplicate goal IDs, missing dependency
  targets, invalid statuses, invalid active goals, invalid bindings, and malformed
  timestamps.
- `transitions.ts` provides `getReadyGoals`, `canTransitionGoal`, and
  `applyGoalTransition`.
- `store.ts` provides `PlanStore` for `createPlan`, `readPlan`, `listPlans`,
  `updatePlan`, `transitionGoal`, `appendLedgerEvent`, and `readLedger`.
- `slop-janitor.ts` provides `importSlopJanitorPlan`, `exportSlopJanitorPlan`, and
  `exportSlopJanitorGoalDirectory` for compatibility artifacts.

`.agent/goals` is not the Fusion source of truth. It is an optional export target
for operators who want to run `slop-janitor goals run .agent/goals/<id>` manually.
Those export paths may be gitignored too when re-exported outside `.fusion`; the
canonical, Fusion-owned copy remains under ignored `.fusion/plans`.

External runner support is optional. Ordinary Fusion plan creation, inspection, and
goal transitions do not require Codex, `slop-janitor`, DSPy, or any external LLM
runner. If a future runner integration shells out to `slop-janitor goals run`, it
must use an async command boundary such as `runCommandAsync` with a timeout and
captured output. Do not use `execSync` for user-configured runner commands.

The first user-visible surface is the CLI:

- `fn plans list`
- `fn plans status <plan-id>`
- `fn plans transition <plan-id> <goal-id> <status> [--reason <text>]`

Dashboard run controls, mission autopilot wiring, DSPy routing, OAuth/account
policy changes, and production-lane LLM routing are non-goals for this slice. Port
4040 behavior is unchanged.
