import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PLAN_FORMAT_VERSION,
  PlanStore,
  type PlanArtifact,
} from "@fusion/core";
import {
  runPlansList,
  runPlansStatus,
  runPlansTransition,
} from "../plans.js";

const tempRoots: string[] = [];

function samplePlan(): PlanArtifact {
  return {
    plan_format_version: PLAN_FORMAT_VERSION,
    id: "plan-cli",
    title: "CLI Plan",
    status: "active",
    created_at: "2026-05-04T00:00:00.000Z",
    updated_at: "2026-05-04T00:00:00.000Z",
    active_goal_id: "goal-1",
    goals: [
      {
        id: "goal-1",
        title: "First goal",
        objective: "Use the CLI",
        status: "ready",
        depends_on: [],
      },
    ],
  };
}

async function makeFusionDir(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "fusion-cli-plans-"));
  tempRoots.push(root);
  const fusionDir = join(root, ".fusion");
  const store = new PlanStore({
    fusionDir,
    now: () => "2026-05-04T00:00:01.000Z",
  });
  await store.createPlan(samplePlan());
  return fusionDir;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("plans command", () => {
  it("lists stored plans", async () => {
    const fusionDir = await makeFusionDir();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await runPlansList({ fusionDir });

    expect(log.mock.calls.flat().join("\n")).toContain("plan-cli [active] CLI Plan active=goal-1 goals=1");
  });

  it("shows plan status and ledger count", async () => {
    const fusionDir = await makeFusionDir();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await runPlansStatus("plan-cli", { fusionDir });

    const output = log.mock.calls.flat().join("\n");
    expect(output).toContain("goal-1 [ready] First goal");
    expect(output).toContain("ledger_events=1");
  });

  it("performs a validated transition and appends a ledger event", async () => {
    const fusionDir = await makeFusionDir();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await runPlansTransition("plan-cli", "goal-1", "completed", {
      fusionDir,
      now: () => "2026-05-04T00:00:02.000Z",
      reason: "verified",
    });

    expect(log.mock.calls.flat().join("\n")).toContain("Updated plan-cli/goal-1: ready -> completed");
    const store = new PlanStore({ fusionDir });
    const plan = await store.readPlan("plan-cli");
    expect(plan.goals[0].status).toBe("completed");
    expect((await store.readLedger("plan-cli")).map((event) => event.event)).toEqual([
      "plan_created",
      "goal_transitioned",
    ]);
  });
});
