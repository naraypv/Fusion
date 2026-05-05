import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  PLAN_FORMAT_VERSION,
  PlanStore,
  type PlanArtifact,
} from "@fusion/core";
import {
  buildBoundPlanGoalPromptContext,
  persistBoundPlanGoalCompletion,
} from "../planned-execution.js";

const tempRoots: string[] = [];

function plan(taskId = "FN-200"): PlanArtifact {
  return {
    plan_format_version: PLAN_FORMAT_VERSION,
    id: "bound-plan",
    title: "Bound Plan",
    status: "active",
    created_at: "2026-05-04T00:00:00.000Z",
    updated_at: "2026-05-04T00:00:00.000Z",
    active_goal_id: "goal-1",
    binding: { type: "task", task_id: taskId, project_path: "/repo" },
    goals: [
      {
        id: "goal-1",
        title: "Bound Goal",
        objective: "Load this goal into the executor prompt.",
        status: "ready",
        depends_on: [],
        acceptance_criteria: ["prompt contains objective"],
        validation: ["pnpm --filter @fusion/engine test"],
        stop_condition: "prompt context exists",
      },
    ],
  };
}

async function makeFusionDir(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "fusion-engine-plan-"));
  tempRoots.push(root);
  return join(root, ".fusion");
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("planned execution prompt context", () => {
  it("returns null when no plan is bound to the task", async () => {
    const fusionDir = await makeFusionDir();

    await expect(buildBoundPlanGoalPromptContext({ fusionDir, taskId: "FN-404" })).resolves.toBeNull();
  });

  it("loads the bound goal objective and acceptance criteria into prompt context", async () => {
    const fusionDir = await makeFusionDir();
    const store = new PlanStore({ fusionDir });
    await store.createPlan(plan());

    const context = await buildBoundPlanGoalPromptContext({ fusionDir, taskId: "FN-200" });

    expect(context).toContain("## Bound Plan Goal");
    expect(context).toContain("Load this goal into the executor prompt.");
    expect(context).toContain("prompt contains objective");
    expect(context).toContain("pnpm --filter @fusion/engine test");
  });

  it("persists accepted completion through the plan ledger", async () => {
    const fusionDir = await makeFusionDir();
    const store = new PlanStore({
      fusionDir,
      now: () => "2026-05-04T00:00:01.000Z",
    });
    await store.createPlan(plan());

    const result = await persistBoundPlanGoalCompletion({
      fusionDir,
      taskId: "FN-200",
      reason: "accepted",
      evidence: { test: true },
      now: () => "2026-05-04T00:00:02.000Z",
    });

    expect(result).toMatchObject({ planId: "bound-plan", goalId: "goal-1" });
    const updated = await store.readPlan("bound-plan");
    expect(updated.goals[0].status).toBe("completed");
    expect((await store.readLedger("bound-plan")).map((event) => event.event)).toEqual([
      "plan_created",
      "goal_transitioned",
    ]);
  });
});
