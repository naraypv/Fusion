import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  PLAN_FORMAT_VERSION,
  PlanStore,
  type PlanArtifact,
} from "../index.js";

const tempRoots: string[] = [];

function samplePlan(overrides: Partial<PlanArtifact> = {}): PlanArtifact {
  return {
    plan_format_version: PLAN_FORMAT_VERSION,
    id: "plan-1",
    title: "Plan 1",
    status: "active",
    created_at: "2026-05-04T00:00:00.000Z",
    updated_at: "2026-05-04T00:00:00.000Z",
    active_goal_id: "goal-1",
    binding: { type: "task", task_id: "FN-100", project_path: "/repo" },
    goals: [
      {
        id: "goal-1",
        title: "Goal 1",
        objective: "Do the first thing",
        status: "ready",
        depends_on: [],
      },
      {
        id: "goal-2",
        title: "Goal 2",
        objective: "Do the next thing",
        status: "pending",
        depends_on: ["goal-1"],
      },
    ],
    ...overrides,
  };
}

async function makeStore(): Promise<PlanStore> {
  const root = await mkdtemp(join(tmpdir(), "fusion-plan-store-"));
  tempRoots.push(root);
  return new PlanStore({
    fusionDir: join(root, ".fusion"),
    now: () => "2026-05-04T00:00:01.000Z",
  });
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("PlanStore", () => {
  it("creates, reads, lists, and finds task-bound plans", async () => {
    const store = await makeStore();
    const created = await store.createPlan(samplePlan());

    expect(await store.readPlan(created.id)).toEqual(created);
    expect((await store.listPlans()).map((plan) => plan.id)).toEqual(["plan-1"]);
    expect((await store.findPlanForTask("FN-100"))?.id).toBe("plan-1");
    expect(await store.findPlanForTask("FN-404")).toBeNull();
  });

  it("persists goal transitions and appends ledger events", async () => {
    const store = await makeStore();
    await store.createPlan(samplePlan());

    const result = await store.transitionGoal("plan-1", "goal-1", "completed", {
      timestamp: "2026-05-04T00:00:02.000Z",
      actor: "test",
      reason: "verified",
    });

    expect(result.plan.goals[0].status).toBe("completed");
    expect(result.plan.active_goal_id).toBe("goal-2");
    const stored = await store.readPlan("plan-1");
    expect(stored.goals[0].updated_at).toBe("2026-05-04T00:00:02.000Z");

    const ledger = await store.readLedger("plan-1");
    expect(ledger.map((event) => event.event)).toEqual(["plan_created", "goal_transitioned"]);
    expect(ledger[1]).toMatchObject({
      goal_id: "goal-1",
      from_status: "ready",
      to_status: "completed",
      actor: "test",
    });
  });

  it("rejects invalid stored plans through the artifact validator", async () => {
    const store = await makeStore();
    const invalid = samplePlan({
      goals: [
        {
          id: "goal-1",
          title: "Goal 1",
          objective: "Do the first thing",
          status: "not-real" as never,
          depends_on: [],
        },
      ],
    });

    await expect(store.createPlan(invalid)).rejects.toThrow(/goals\[0\]\.status/);
  });
});
