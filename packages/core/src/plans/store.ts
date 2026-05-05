import { appendFile, mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  applyGoalTransition,
  getReadyGoals,
} from "./transitions.js";
import {
  assertValidPlanArtifact,
} from "./validation.js";
import type {
  ApplyGoalTransitionOptions,
  PlanArtifact,
  PlanGoalStatus,
  PlanLedgerEvent,
} from "./types.js";

export interface PlanStoreOptions {
  fusionDir: string;
  now?: () => string;
}

export interface CreatePlanOptions {
  initialEvent?: Omit<PlanLedgerEvent, "timestamp" | "plan_id"> & {
    timestamp?: string;
    plan_id?: string;
  };
}

export interface TransitionGoalResult {
  plan: PlanArtifact;
  event: PlanLedgerEvent;
}

const GOALS_FILE = "goals.json";
const LEDGER_FILE = "ledger.jsonl";
const PLANS_DIR = "plans";

function defaultNow(): string {
  return new Date().toISOString();
}

function formatValidationErrors(plan: unknown): never {
  try {
    assertValidPlanArtifact(plan);
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
  }
  throw new Error("Invalid plan artifact");
}

function toLedgerLine(event: PlanLedgerEvent): string {
  return `${JSON.stringify(event)}\n`;
}

function parseLedgerLine(line: string, index: number): PlanLedgerEvent {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid plan ledger JSON on line ${index + 1}: ${message}`);
  }

  if (
    typeof value !== "object"
    || value === null
    || Array.isArray(value)
    || typeof (value as { event?: unknown }).event !== "string"
    || typeof (value as { timestamp?: unknown }).timestamp !== "string"
    || typeof (value as { plan_id?: unknown }).plan_id !== "string"
  ) {
    throw new Error(`Invalid plan ledger event on line ${index + 1}`);
  }
  return value as PlanLedgerEvent;
}

export class PlanStore {
  private readonly fusionDir: string;
  private readonly now: () => string;

  constructor(options: PlanStoreOptions) {
    this.fusionDir = options.fusionDir;
    this.now = options.now ?? defaultNow;
  }

  getPlansDir(): string {
    return join(this.fusionDir, PLANS_DIR);
  }

  getPlanDir(planId: string): string {
    return join(this.getPlansDir(), planId);
  }

  async createPlan(plan: PlanArtifact, options: CreatePlanOptions = {}): Promise<PlanArtifact> {
    assertValidPlanArtifact(plan);
    const planDir = this.getPlanDir(plan.id);
    await mkdir(planDir, { recursive: true });
    await this.writePlanFile(plan);

    const initialEvent: PlanLedgerEvent = {
      event: "plan_created",
      timestamp: options.initialEvent?.timestamp ?? this.now(),
      plan_id: options.initialEvent?.plan_id ?? plan.id,
      actor: options.initialEvent?.actor,
      reason: options.initialEvent?.reason,
      metadata: options.initialEvent?.metadata,
    };
    await this.appendLedgerEvent(plan.id, initialEvent);
    return plan;
  }

  async readPlan(planId: string): Promise<PlanArtifact> {
    const raw = await readFile(join(this.getPlanDir(planId), GOALS_FILE), "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed) {
      return formatValidationErrors(parsed);
    }
    assertValidPlanArtifact(parsed);
    return parsed;
  }

  async listPlans(): Promise<PlanArtifact[]> {
    let entries;
    try {
      entries = await readdir(this.getPlansDir(), { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }

    const plans: PlanArtifact[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      plans.push(await this.readPlan(entry.name));
    }
    return plans.sort((a, b) => a.id.localeCompare(b.id));
  }

  async updatePlan(plan: PlanArtifact): Promise<PlanArtifact> {
    assertValidPlanArtifact(plan);
    await mkdir(this.getPlanDir(plan.id), { recursive: true });
    await this.writePlanFile(plan);
    return plan;
  }

  async transitionGoal(
    planId: string,
    goalId: string,
    toStatus: PlanGoalStatus,
    options: ApplyGoalTransitionOptions,
  ): Promise<TransitionGoalResult> {
    const plan = await this.readPlan(planId);
    const result = applyGoalTransition(plan, goalId, toStatus, options);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    const nextPlan = this.withDerivedPlanState(result.plan, goalId, toStatus);
    await this.updatePlan(nextPlan);
    await this.appendLedgerEvent(planId, result.event);
    return { plan: nextPlan, event: result.event };
  }

  async appendLedgerEvent(planId: string, event: PlanLedgerEvent): Promise<void> {
    await mkdir(this.getPlanDir(planId), { recursive: true });
    await appendFile(join(this.getPlanDir(planId), LEDGER_FILE), toLedgerLine(event), "utf-8");
  }

  async readLedger(planId: string): Promise<PlanLedgerEvent[]> {
    let raw: string;
    try {
      raw = await readFile(join(this.getPlanDir(planId), LEDGER_FILE), "utf-8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }

    return raw
      .split(/\r?\n/)
      .filter((line) => line.trim() !== "")
      .map(parseLedgerLine);
  }

  async findPlanForTask(taskId: string): Promise<PlanArtifact | null> {
    const plans = await this.listPlans();
    return plans.find((plan) => plan.binding?.type === "task" && plan.binding.task_id === taskId) ?? null;
  }

  private async writePlanFile(plan: PlanArtifact): Promise<void> {
    const planDir = this.getPlanDir(plan.id);
    await mkdir(planDir, { recursive: true });
    const tempPath = join(planDir, `${GOALS_FILE}.${randomUUID()}.tmp`);
    const finalPath = join(planDir, GOALS_FILE);
    await writeFile(tempPath, `${JSON.stringify(plan, null, 2)}\n`, "utf-8");
    await rename(tempPath, finalPath);
  }

  private withDerivedPlanState(plan: PlanArtifact, goalId: string, toStatus: PlanGoalStatus): PlanArtifact {
    const terminal = plan.goals.every((goal) => goal.status === "completed" || goal.status === "skipped");
    if (terminal) {
      return { ...plan, status: "completed", active_goal_id: null };
    }

    if (toStatus === "failed" || toStatus === "blocked") {
      return { ...plan, status: "blocked", active_goal_id: goalId };
    }

    if (toStatus === "active") {
      return { ...plan, status: "active", active_goal_id: goalId };
    }

    if (plan.active_goal_id === null || plan.active_goal_id === goalId) {
      const nextReady = getReadyGoals(plan).find((goal) => goal.id !== goalId);
      return { ...plan, status: "active", active_goal_id: nextReady?.id ?? null };
    }

    return plan;
  }
}
