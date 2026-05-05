import { describe, expect, it } from "vitest";
import {
  PLAN_FORMAT_VERSION,
  applyGoalTransition,
  canTransitionGoal,
  getReadyGoals,
  type PlanArtifact,
  type PlanGoal,
} from "../index.js";

const TIMESTAMP = "2026-05-04T23:30:00.000Z";
const NEXT_TIMESTAMP = "2026-05-04T23:31:00.000Z";

function goal(overrides: Partial<PlanGoal>): PlanGoal {
  return {
    id: "goal-1",
    title: "Goal",
    objective: "Objective",
    status: "pending",
    depends_on: [],
    ...overrides,
  };
}

function plan(goals: PlanGoal[]): PlanArtifact {
  return {
    plan_format_version: PLAN_FORMAT_VERSION,
    id: "plan-1",
    title: "Plan",
    status: "active",
    created_at: TIMESTAMP,
    updated_at: TIMESTAMP,
    goals,
  };
}

describe("plan goal transitions", () => {
  it("allows explicit valid transitions", () => {
    expect(canTransitionGoal(goal({ status: "pending" }), "ready")).toBe(true);
    expect(canTransitionGoal(goal({ status: "ready" }), "active")).toBe(true);
    expect(canTransitionGoal(goal({ status: "active" }), "completed")).toBe(true);
  });

  it("rejects invalid transitions with structured errors", () => {
    const artifact = plan([goal({ id: "goal-1", status: "completed" })]);

    const result = applyGoalTransition(artifact, "goal-1", "active", {
      timestamp: NEXT_TIMESTAMP,
      actor: "test",
      reason: "completed goals are terminal",
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: "invalid_transition",
        goal_id: "goal-1",
        from_status: "completed",
        to_status: "active",
      }),
    });
  });

  it("rejects invalid target statuses with structured errors", () => {
    const artifact = plan([goal({ id: "goal-1", status: "ready" })]);

    const result = applyGoalTransition(artifact, "goal-1", "unknown", {
      timestamp: NEXT_TIMESTAMP,
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: "invalid_goal_status",
        goal_id: "goal-1",
        from_status: "ready",
        to_status: "unknown",
      }),
    });
  });

  it("returns an updated plan and ledger event for valid transitions", () => {
    const artifact = plan([goal({ id: "goal-1", status: "ready" })]);

    const result = applyGoalTransition(artifact, "goal-1", "active", {
      timestamp: NEXT_TIMESTAMP,
      actor: "executor",
      reason: "start next goal",
      metadata: { source: "test" },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.plan.goals[0]).toMatchObject({
      id: "goal-1",
      status: "active",
      updated_at: NEXT_TIMESTAMP,
    });
    expect(result.plan.active_goal_id).toBe("goal-1");
    expect(result.event).toMatchObject({
      event: "goal_transitioned",
      timestamp: NEXT_TIMESTAMP,
      plan_id: "plan-1",
      goal_id: "goal-1",
      from_status: "ready",
      to_status: "active",
      actor: "executor",
      reason: "start next goal",
      metadata: { source: "test" },
    });
    expect(artifact.goals[0].status).toBe("ready");
  });
});

describe("ready goal calculation", () => {
  it("returns dependency-ready goals in plan order", () => {
    const artifact = plan([
      goal({ id: "goal-1", status: "completed" }),
      goal({ id: "goal-2", status: "pending", depends_on: ["goal-1"] }),
      goal({ id: "goal-3", status: "ready", depends_on: ["goal-1"] }),
      goal({ id: "goal-4", status: "active", depends_on: ["goal-1"] }),
    ]);

    expect(getReadyGoals(artifact).map((readyGoal) => readyGoal.id)).toEqual([
      "goal-2",
      "goal-3",
    ]);
  });

  it("does not mark goals ready while dependencies are not execution-complete", () => {
    const artifact = plan([
      goal({ id: "blocked-source", status: "blocked" }),
      goal({ id: "failed-source", status: "failed" }),
      goal({ id: "active-source", status: "active" }),
      goal({ id: "pending-on-blocked", status: "pending", depends_on: ["blocked-source"] }),
      goal({ id: "pending-on-failed", status: "pending", depends_on: ["failed-source"] }),
      goal({ id: "pending-on-active", status: "pending", depends_on: ["active-source"] }),
    ]);

    expect(getReadyGoals(artifact)).toEqual([]);
  });

  it("allows skipped dependencies to unblock dependent goals", () => {
    const artifact = plan([
      goal({ id: "goal-1", status: "skipped" }),
      goal({ id: "goal-2", status: "pending", depends_on: ["goal-1"] }),
    ]);

    expect(getReadyGoals(artifact).map((readyGoal) => readyGoal.id)).toEqual(["goal-2"]);
  });
});
