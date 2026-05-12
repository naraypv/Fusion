import { describe, expect, it } from "vitest";
import {
  derivePerTaskBranch,
  resolveBranchAssignmentContext,
  resolveBranchSelection,
} from "../routes/branch-selection.js";

describe("branch-selection", () => {
  it("resolves project-default and auto-new without branch", () => {
    expect(resolveBranchSelection({ mode: "project-default", baseBranch: "main" }, undefined, undefined)).toEqual({
      branch: undefined,
      baseBranch: "main",
    });
    expect(resolveBranchSelection({ mode: "auto-new" }, undefined, "develop")).toEqual({
      branch: undefined,
      baseBranch: undefined,
    });
  });

  it("requires branchName for existing/custom-new", () => {
    expect(() => resolveBranchSelection({ mode: "existing" }, undefined, undefined)).toThrow(
      "branchSelection.branchName is required",
    );
  });

  it("resolves assignment context", () => {
    expect(resolveBranchAssignmentContext(undefined)).toEqual({ mode: "shared" });
    expect(resolveBranchAssignmentContext({ mode: "per-task-derived" })).toEqual({ mode: "per-task-derived" });
    expect(() => resolveBranchAssignmentContext({ mode: "bad" })).toThrow("branchAssignment.mode must be one of");
  });

  it("derives a per-task branch suffix", () => {
    expect(derivePerTaskBranch("feature/planning", "FN-123 add parser")).toBe("feature/planning/fn-123-add-parser");
    expect(derivePerTaskBranch(undefined, "FN-123")).toBeUndefined();
  });
});
