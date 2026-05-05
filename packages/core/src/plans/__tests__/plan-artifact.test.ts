import { describe, expect, it } from "vitest";
import {
  PLAN_FORMAT_VERSION,
  type PlanArtifact,
  validatePlanArtifact,
} from "../index.js";

const TIMESTAMP = "2026-05-04T23:30:00.000Z";

function createSamplePlan(overrides: Partial<PlanArtifact> = {}): PlanArtifact {
  return {
    plan_format_version: PLAN_FORMAT_VERSION,
    id: "plan-1",
    title: "Atomistic planning integration",
    status: "active",
    created_at: TIMESTAMP,
    updated_at: TIMESTAMP,
    active_goal_id: "goal-2",
    binding: {
      type: "project",
      project_path: "/repo/fusion",
    },
    goals: [
      {
        id: "goal-1",
        title: "Select contract",
        objective: "Choose the first core contract slice.",
        status: "completed",
        depends_on: [],
        acceptance_criteria: ["Decision is recorded."],
        validation: ["test -f decision.md"],
      },
      {
        id: "goal-2",
        title: "Implement contract",
        objective: "Add plan artifact types and validators.",
        status: "active",
        depends_on: ["goal-1"],
        acceptance_criteria: ["Contract validates."],
        validation: ["pnpm test"],
      },
    ],
    ...overrides,
  };
}

describe("plan artifact validation", () => {
  it("accepts a valid versioned plan with ordered goals and dependencies", () => {
    const result = validatePlanArtifact(createSamplePlan());

    expect(result).toEqual({
      valid: true,
      errors: [],
    });
  });

  it("rejects duplicate goal ids with structured errors", () => {
    const plan = createSamplePlan({
      active_goal_id: "goal-1",
      goals: [
        {
          id: "goal-1",
          title: "First",
          objective: "First goal.",
          status: "completed",
          depends_on: [],
        },
        {
          id: "goal-1",
          title: "Duplicate",
          objective: "Duplicate goal.",
          status: "pending",
          depends_on: [],
        },
      ],
    });

    const result = validatePlanArtifact(plan);

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: "duplicate_goal_id",
        path: "goals[1].id",
        details: expect.objectContaining({
          goal_id: "goal-1",
          first_index: 0,
          duplicate_index: 1,
        }),
      }),
    );
  });

  it("rejects missing dependency targets with structured errors", () => {
    const plan = createSamplePlan({
      active_goal_id: null,
      goals: [
        {
          id: "goal-1",
          title: "Blocked",
          objective: "Wait for a dependency.",
          status: "pending",
          depends_on: ["missing-goal"],
        },
      ],
    });

    const result = validatePlanArtifact(plan);

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: "missing_dependency_target",
        path: "goals[0].depends_on[0]",
        details: expect.objectContaining({
          goal_id: "goal-1",
          dependency_id: "missing-goal",
        }),
      }),
    );
  });

  it("rejects dependencies that point to later goals", () => {
    const plan = createSamplePlan({
      active_goal_id: null,
      goals: [
        {
          id: "goal-2",
          title: "Second",
          objective: "Depends on a later goal.",
          status: "pending",
          depends_on: ["goal-1"],
        },
        {
          id: "goal-1",
          title: "First",
          objective: "Appears too late.",
          status: "pending",
          depends_on: [],
        },
      ],
    });

    const result = validatePlanArtifact(plan);

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: "invalid_dependency_order",
        path: "goals[0].depends_on[0]",
      }),
    );
  });
});
