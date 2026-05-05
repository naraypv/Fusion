import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  PLAN_FORMAT_VERSION,
  PLAN_GOAL_STATUSES,
  PLAN_STATUSES,
  type PlanArtifact,
  type PlanGoal,
  type PlanGoalStatus,
  type PlanLedgerEvent,
  type PlanStatus,
} from "./types.js";
import { assertValidPlanArtifact } from "./validation.js";

export interface SlopJanitorExportOptions {
  outputDir: string;
  plan: PlanArtifact;
  brief?: string;
  ledgerEvents?: PlanLedgerEvent[];
}

const GOAL_STATUS_SET = new Set<string>(PLAN_GOAL_STATUSES);
const PLAN_STATUS_SET = new Set<string>(PLAN_STATUSES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() !== "" ? value : fallback;
}

function planStatus(value: unknown): PlanStatus {
  return typeof value === "string" && PLAN_STATUS_SET.has(value) ? value as PlanStatus : "active";
}

function goalStatus(value: unknown): PlanGoalStatus {
  if (typeof value === "string" && GOAL_STATUS_SET.has(value)) {
    return value as PlanGoalStatus;
  }
  return "ready";
}

function slopGoalStatus(status: PlanGoalStatus): string {
  return status === "pending" ? "ready" : status;
}

function normalizeGoal(rawGoal: unknown, index: number): PlanGoal {
  if (!isRecord(rawGoal)) {
    throw new Error(`slop-janitor goal ${index + 1} must be an object`);
  }

  return {
    ...rawGoal,
    id: stringValue(rawGoal.id, `goal-${index + 1}`),
    title: stringValue(rawGoal.title, `Goal ${index + 1}`),
    objective: stringValue(rawGoal.objective, ""),
    status: goalStatus(rawGoal.status),
    depends_on: stringArray(rawGoal.depends_on),
    acceptance_criteria: stringArray(rawGoal.acceptance_criteria),
    validation: stringArray(rawGoal.validation),
    stop_condition: typeof rawGoal.stop_condition === "string" ? rawGoal.stop_condition : undefined,
  };
}

export function importSlopJanitorPlan(value: unknown, now = new Date().toISOString()): PlanArtifact {
  if (!isRecord(value)) {
    throw new Error("slop-janitor goals.json must be an object");
  }
  if (!Array.isArray(value.goals)) {
    throw new Error("slop-janitor goals.json must include goals[]");
  }

  const plan: PlanArtifact = {
    ...value,
    plan_format_version: PLAN_FORMAT_VERSION,
    id: stringValue(value.id, "imported-plan"),
    title: stringValue(value.title, "Imported Plan"),
    status: planStatus(value.status),
    created_at: stringValue(value.created_at, now),
    updated_at: stringValue(value.updated_at, now),
    active_goal_id: typeof value.active_goal_id === "string" ? value.active_goal_id : null,
    goals: value.goals.map(normalizeGoal),
  };
  assertValidPlanArtifact(plan);
  return plan;
}

export function exportSlopJanitorPlan(plan: PlanArtifact): Record<string, unknown> {
  assertValidPlanArtifact(plan);
  return {
    id: plan.id,
    title: plan.title,
    status: plan.status === "archived" ? "abandoned" : plan.status,
    active_goal_id: plan.active_goal_id ?? null,
    created_at: plan.created_at,
    updated_at: plan.updated_at,
    goals: plan.goals.map((goal) => ({
      ...goal,
      status: slopGoalStatus(goal.status),
      rationale: (goal as PlanGoal & { rationale?: string }).rationale ?? "",
      scope: (goal as PlanGoal & { scope?: string[] }).scope ?? [],
      non_goals: (goal as PlanGoal & { non_goals?: string[] }).non_goals ?? [],
      stop_condition: goal.stop_condition ?? "",
      acceptance_criteria: goal.acceptance_criteria ?? [],
      validation: goal.validation ?? [],
      result_summary: (goal as PlanGoal & { result_summary?: string | null }).result_summary ?? null,
      evidence: (goal as PlanGoal & { evidence?: unknown[] }).evidence ?? [],
      risks: (goal as PlanGoal & { risks?: string[] }).risks ?? [],
      assumptions: (goal as PlanGoal & { assumptions?: string[] }).assumptions ?? [],
    })),
  };
}

export async function exportSlopJanitorGoalDirectory(options: SlopJanitorExportOptions): Promise<void> {
  await mkdir(options.outputDir, { recursive: true });
  await writeFile(join(options.outputDir, "goals.json"), `${JSON.stringify(exportSlopJanitorPlan(options.plan), null, 2)}\n`, "utf-8");
  await writeFile(join(options.outputDir, "brief.md"), options.brief ?? `# ${options.plan.title}\n`, "utf-8");
  const ledger = (options.ledgerEvents ?? [])
    .map((event) => JSON.stringify(event))
    .join("\n");
  await writeFile(join(options.outputDir, "ledger.jsonl"), ledger ? `${ledger}\n` : "", "utf-8");
}
