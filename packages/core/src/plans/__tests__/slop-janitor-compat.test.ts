import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  exportSlopJanitorGoalDirectory,
  exportSlopJanitorPlan,
  importSlopJanitorPlan,
  PLAN_FORMAT_VERSION,
  type PlanArtifact,
} from "../index.js";

const tempRoots: string[] = [];

function fusionPlan(): PlanArtifact {
  return {
    plan_format_version: PLAN_FORMAT_VERSION,
    id: "fusion-plan",
    title: "Fusion Plan",
    status: "active",
    created_at: "2026-05-04T00:00:00.000Z",
    updated_at: "2026-05-04T00:00:00.000Z",
    active_goal_id: "goal-1",
    binding: { type: "project", project_path: "/repo" },
    goals: [
      {
        id: "goal-1",
        title: "Goal 1",
        objective: "Ship compatibility",
        status: "pending",
        depends_on: [],
        acceptance_criteria: ["imports"],
        validation: ["pnpm test"],
        stop_condition: "done",
      },
    ],
  };
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("slop-janitor compatibility", () => {
  it("imports a slop-janitor-shaped goals.json into PlanArtifact", () => {
    const imported = importSlopJanitorPlan({
      id: "slop-plan",
      title: "Slop Plan",
      status: "blocked",
      active_goal_id: "goal-2",
      created_at: "2026-05-04T00:00:00.000Z",
      updated_at: "2026-05-04T00:00:00.000Z",
      goals: [
        {
          id: "goal-1",
          title: "Goal 1",
          objective: "First",
          status: "completed",
          depends_on: [],
          rationale: "because",
          scope: ["core"],
          non_goals: [],
          stop_condition: "stop",
          acceptance_criteria: ["ok"],
          validation: ["pnpm test"],
          result_summary: "done",
          evidence: [],
          risks: [],
          assumptions: [],
        },
        {
          id: "goal-2",
          title: "Goal 2",
          objective: "Second",
          status: "ready",
          depends_on: ["goal-1"],
          acceptance_criteria: [],
          validation: [],
        },
      ],
    });

    expect(imported).toMatchObject({
      plan_format_version: PLAN_FORMAT_VERSION,
      id: "slop-plan",
      status: "blocked",
      active_goal_id: "goal-2",
    });
    expect(imported.goals[1].depends_on).toEqual(["goal-1"]);
  });

  it("exports slop-janitor required files without making .agent authoritative", async () => {
    const root = await mkdtemp(join(tmpdir(), "fusion-slop-export-"));
    tempRoots.push(root);
    const outputDir = join(root, ".agent", "goals", "fusion-plan");

    await exportSlopJanitorGoalDirectory({
      outputDir,
      plan: fusionPlan(),
      brief: "# Fusion Plan\n",
      ledgerEvents: [
        {
          event: "plan_created",
          timestamp: "2026-05-04T00:00:01.000Z",
          plan_id: "fusion-plan",
        },
      ],
    });

    const exported = JSON.parse(await readFile(join(outputDir, "goals.json"), "utf-8")) as {
      goals: Array<{ status: string; rationale: string; scope: string[] }>;
    };
    expect(exported.goals[0]).toMatchObject({
      status: "ready",
      rationale: "",
      scope: [],
    });
    await expect(readFile(join(outputDir, "brief.md"), "utf-8")).resolves.toBe("# Fusion Plan\n");
    await expect(readFile(join(outputDir, "ledger.jsonl"), "utf-8")).resolves.toContain("plan_created");
  });

  it("exports a plain slop-janitor payload for manual runner use", () => {
    const exported = exportSlopJanitorPlan(fusionPlan());

    expect(exported).toMatchObject({
      id: "fusion-plan",
      title: "Fusion Plan",
      active_goal_id: "goal-1",
    });
    expect((exported.goals as Array<{ status: string }>)[0].status).toBe("ready");
  });
});
