import {
  isPlanGoalStatus,
  PlanStore,
  type PlanArtifact,
  type PlanGoal,
  type PlanGoalStatus,
} from "@fusion/core";
import { getStore } from "../project-resolver.js";

export interface PlansCommandOptions {
  projectName?: string;
  fusionDir?: string;
  json?: boolean;
  reason?: string;
  now?: () => string;
}

async function resolvePlanStore(options: PlansCommandOptions): Promise<PlanStore> {
  if (options.fusionDir) {
    return new PlanStore({ fusionDir: options.fusionDir, now: options.now });
  }
  const store = await getStore({ project: options.projectName });
  return new PlanStore({ fusionDir: store.getFusionDir(), now: options.now });
}

function formatGoal(goal: PlanGoal): string {
  const dependencies = goal.depends_on.length > 0 ? ` deps=${goal.depends_on.join(",")}` : "";
  return `  - ${goal.id} [${goal.status}] ${goal.title}${dependencies}`;
}

function summarizePlan(plan: PlanArtifact): string {
  const active = plan.active_goal_id ? ` active=${plan.active_goal_id}` : "";
  return `${plan.id} [${plan.status}] ${plan.title}${active} goals=${plan.goals.length}`;
}

export async function runPlansList(options: PlansCommandOptions = {}): Promise<void> {
  const store = await resolvePlanStore(options);
  const plans = await store.listPlans();

  if (options.json) {
    console.log(JSON.stringify(plans, null, 2));
    return;
  }

  if (plans.length === 0) {
    console.log("No plans found.");
    return;
  }

  for (const plan of plans) {
    console.log(summarizePlan(plan));
  }
}

export async function runPlansStatus(planId: string | undefined, options: PlansCommandOptions = {}): Promise<void> {
  if (!planId) {
    console.error("Usage: fn plans status <plan-id>");
    process.exit(1);
  }

  const store = await resolvePlanStore(options);
  const plan = await store.readPlan(planId);
  const ledger = await store.readLedger(planId);

  if (options.json) {
    console.log(JSON.stringify({ plan, ledger }, null, 2));
    return;
  }

  console.log(summarizePlan(plan));
  for (const goal of plan.goals) {
    console.log(formatGoal(goal));
  }
  console.log(`ledger_events=${ledger.length}`);
}

export async function runPlansTransition(
  planId: string | undefined,
  goalId: string | undefined,
  status: string | undefined,
  options: PlansCommandOptions = {},
): Promise<void> {
  if (!planId || !goalId || !status) {
    console.error("Usage: fn plans transition <plan-id> <goal-id> <status> [--reason <text>]");
    process.exit(1);
  }
  if (!isPlanGoalStatus(status)) {
    console.error(`Invalid goal status: ${status}`);
    process.exit(1);
  }

  const store = await resolvePlanStore(options);
  const result = await store.transitionGoal(planId, goalId, status as PlanGoalStatus, {
    timestamp: (options.now ?? (() => new Date().toISOString()))(),
    actor: "fn plans transition",
    reason: options.reason,
  });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`Updated ${planId}/${goalId}: ${result.event.from_status} -> ${result.event.to_status}`);
}
