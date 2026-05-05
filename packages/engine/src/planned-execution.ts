import {
  getReadyGoals,
  PlanStore,
  type PlanArtifact,
  type PlanGoal,
  type PlanLedgerEvent,
} from "@fusion/core";

export interface BoundPlanGoalContextOptions {
  fusionDir: string;
  taskId: string;
}

export interface BoundPlanGoalCompletionOptions extends BoundPlanGoalContextOptions {
  reason?: string;
  evidence?: Record<string, unknown>;
  now?: () => string;
}

export interface BoundPlanGoalCompletionResult {
  planId: string;
  goalId: string;
  event: PlanLedgerEvent;
}

export function selectPlanGoalForPrompt(plan: PlanArtifact): PlanGoal | null {
  if (plan.active_goal_id) {
    const active = plan.goals.find((goal) => goal.id === plan.active_goal_id);
    if (active && (active.status === "active" || active.status === "ready" || active.status === "pending")) {
      return active;
    }
  }
  return getReadyGoals(plan)[0] ?? null;
}

export function formatPlanGoalPromptContext(plan: PlanArtifact, goal: PlanGoal): string {
  const acceptance = goal.acceptance_criteria?.length
    ? goal.acceptance_criteria.map((item) => `- ${item}`).join("\n")
    : "- No acceptance criteria recorded.";
  const validation = goal.validation?.length
    ? goal.validation.map((item) => `- ${item}`).join("\n")
    : "- No validation commands recorded.";

  return [
    "## Bound Plan Goal",
    "",
    `Plan: ${plan.title} (${plan.id})`,
    `Goal: ${goal.title} (${goal.id})`,
    "",
    "Objective:",
    goal.objective,
    "",
    "Acceptance Criteria:",
    acceptance,
    "",
    "Validation:",
    validation,
    "",
    "Stop Condition:",
    goal.stop_condition ?? "No stop condition recorded.",
    "",
    "When this task is accepted as complete, persist completion through the Fusion plan ledger.",
  ].join("\n");
}

export async function buildBoundPlanGoalPromptContext(
  options: BoundPlanGoalContextOptions,
): Promise<string | null> {
  const store = new PlanStore({ fusionDir: options.fusionDir });
  const plan = await store.findPlanForTask(options.taskId).catch(() => null);
  if (!plan) {
    return null;
  }
  const goal = selectPlanGoalForPrompt(plan);
  return goal ? formatPlanGoalPromptContext(plan, goal) : null;
}

export async function persistBoundPlanGoalCompletion(
  options: BoundPlanGoalCompletionOptions,
): Promise<BoundPlanGoalCompletionResult | null> {
  const store = new PlanStore({
    fusionDir: options.fusionDir,
    now: options.now,
  });
  const plan = await store.findPlanForTask(options.taskId).catch(() => null);
  if (!plan) {
    return null;
  }

  const goal = selectPlanGoalForPrompt(plan);
  if (!goal || goal.status === "completed" || goal.status === "skipped") {
    return null;
  }

  let planId = plan.id;
  let goalId = goal.id;
  if (goal.status === "pending") {
    await store.transitionGoal(plan.id, goal.id, "ready", {
      timestamp: (options.now ?? (() => new Date().toISOString()))(),
      actor: "fusion-engine",
      reason: "prepared ready plan goal for task completion",
      metadata: options.evidence,
    }).catch(() => null);
  }

  const result = await store.transitionGoal(planId, goalId, "completed", {
    timestamp: (options.now ?? (() => new Date().toISOString()))(),
    actor: "fusion-engine",
    reason: options.reason ?? "task completion accepted",
    metadata: options.evidence,
  }).catch(() => null);
  if (!result) {
    return null;
  }
  planId = result.plan.id;
  goalId = result.event.goal_id ?? goalId;
  return { planId, goalId, event: result.event };
}
