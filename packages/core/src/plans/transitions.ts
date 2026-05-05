import {
  PLAN_GOAL_STATUSES,
  type ApplyGoalTransitionOptions,
  type ApplyGoalTransitionResult,
  type PlanArtifact,
  type PlanGoal,
  type PlanGoalStatus,
  type PlanTransitionError,
} from "./types.js";
import { isPlanGoalStatus } from "./validation.js";

const TRANSITIONS: Readonly<Record<PlanGoalStatus, readonly PlanGoalStatus[]>> = {
  pending: ["ready", "skipped"],
  ready: ["active", "completed", "skipped"],
  active: ["blocked", "completed", "failed", "skipped"],
  blocked: ["ready", "skipped"],
  failed: ["ready", "skipped"],
  completed: [],
  skipped: [],
};

const DEPENDENCY_READY_STATUSES = new Set<PlanGoalStatus>(["completed", "skipped"]);
const READY_SOURCE_STATUSES = new Set<PlanGoalStatus>(["pending", "ready"]);

function invalidStatusError(goal: PlanGoal, toStatus: string): PlanTransitionError {
  return {
    code: "invalid_goal_status",
    message: `goal status must be one of: ${PLAN_GOAL_STATUSES.join(", ")}`,
    goal_id: goal.id,
    from_status: goal.status,
    to_status: toStatus,
  };
}

function invalidTransitionError(goal: PlanGoal, toStatus: PlanGoalStatus): PlanTransitionError {
  return {
    code: "invalid_transition",
    message: `cannot transition goal ${goal.id} from ${goal.status} to ${toStatus}`,
    goal_id: goal.id,
    from_status: goal.status,
    to_status: toStatus,
  };
}

function goalNotFoundError(goalId: string, toStatus: string): PlanTransitionError {
  return {
    code: "goal_not_found",
    message: `goal ${goalId} was not found`,
    goal_id: goalId,
    to_status: toStatus,
  };
}

export function canTransitionGoal(goal: PlanGoal, toStatus: PlanGoalStatus): boolean {
  return TRANSITIONS[goal.status].includes(toStatus);
}

export function getReadyGoals(plan: PlanArtifact): PlanGoal[] {
  const byId = new Map(plan.goals.map((goal) => [goal.id, goal]));

  return plan.goals.filter((goal) => {
    if (!READY_SOURCE_STATUSES.has(goal.status)) {
      return false;
    }

    return goal.depends_on.every((dependencyId) => {
      const dependency = byId.get(dependencyId);
      return dependency !== undefined && DEPENDENCY_READY_STATUSES.has(dependency.status);
    });
  });
}

export function applyGoalTransition(
  plan: PlanArtifact,
  goalId: string,
  toStatus: string,
  options: ApplyGoalTransitionOptions,
): ApplyGoalTransitionResult {
  const goal = plan.goals.find((candidate) => candidate.id === goalId);
  if (!goal) {
    return { ok: false, error: goalNotFoundError(goalId, toStatus) };
  }

  if (!isPlanGoalStatus(toStatus)) {
    return { ok: false, error: invalidStatusError(goal, toStatus) };
  }

  if (!canTransitionGoal(goal, toStatus)) {
    return { ok: false, error: invalidTransitionError(goal, toStatus) };
  }

  const updatedGoal: PlanGoal = {
    ...goal,
    status: toStatus,
    updated_at: options.timestamp,
  };
  const goals = plan.goals.map((candidate) =>
    candidate.id === goalId ? updatedGoal : candidate,
  );

  const planStatus = toStatus === "active" ? "active" : plan.status;
  const activeGoalId = toStatus === "active"
    ? goalId
    : plan.active_goal_id === goalId
      ? null
      : plan.active_goal_id;

  return {
    ok: true,
    plan: {
      ...plan,
      status: planStatus,
      updated_at: options.timestamp,
      active_goal_id: activeGoalId,
      goals,
    },
    event: {
      event: "goal_transitioned",
      timestamp: options.timestamp,
      plan_id: plan.id,
      goal_id: goalId,
      from_status: goal.status,
      to_status: toStatus,
      actor: options.actor,
      reason: options.reason,
      metadata: options.metadata,
    },
  };
}
