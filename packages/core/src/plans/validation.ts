import {
  PLAN_FORMAT_VERSION,
  PLAN_GOAL_STATUSES,
  PLAN_STATUSES,
  type PlanArtifact,
  type PlanBinding,
  type PlanGoal,
  type PlanGoalStatus,
  type PlanStatus,
  type PlanValidation,
  type PlanValidationError,
  type PlanValidationErrorCode,
} from "./types.js";

const PLAN_STATUS_SET = new Set<string>(PLAN_STATUSES);
const GOAL_STATUS_SET = new Set<string>(PLAN_GOAL_STATUSES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isIsoTimestamp(value: string): boolean {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function addError(
  errors: PlanValidationError[],
  code: PlanValidationErrorCode,
  path: string,
  message: string,
  details?: Record<string, unknown>,
): void {
  errors.push(
    details === undefined
      ? { code, path, message }
      : { code, path, message, details },
  );
}

function requireString(
  errors: PlanValidationError[],
  record: Record<string, unknown>,
  field: string,
  path: string,
): string | undefined {
  const value = record[field];
  if (typeof value !== "string" || value.trim() === "") {
    addError(
      errors,
      value === undefined ? "missing_field" : "invalid_type",
      path,
      `${path} must be a non-empty string`,
    );
    return undefined;
  }
  return value;
}

function validateTimestamp(
  errors: PlanValidationError[],
  record: Record<string, unknown>,
  field: string,
  path: string,
  required: boolean,
): void {
  const value = record[field];
  if (value === undefined && !required) {
    return;
  }

  if (typeof value !== "string" || value.trim() === "") {
    addError(
      errors,
      value === undefined ? "missing_field" : "invalid_type",
      path,
      `${path} must be a non-empty ISO timestamp`,
    );
    return;
  }

  if (!isIsoTimestamp(value)) {
    addError(errors, "invalid_timestamp", path, `${path} must be an ISO timestamp`, { value });
  }
}

function validateStringArrayField(
  errors: PlanValidationError[],
  record: Record<string, unknown>,
  field: string,
  path: string,
  required: boolean,
): void {
  const value = record[field];
  if (value === undefined && !required) {
    return;
  }

  if (!isStringArray(value)) {
    addError(
      errors,
      value === undefined ? "missing_field" : "invalid_type",
      path,
      `${path} must be an array of strings`,
    );
  }
}

function validateBinding(value: unknown, errors: PlanValidationError[]): void {
  if (value === undefined) {
    return;
  }

  if (!isRecord(value)) {
    addError(errors, "invalid_binding", "binding", "binding must be an object");
    return;
  }

  if (value.type === "project") {
    if (typeof value.project_path !== "string" || value.project_path.trim() === "") {
      addError(errors, "invalid_binding", "binding.project_path", "project binding requires a non-empty project_path");
    }
    if (value.task_id !== undefined) {
      addError(errors, "invalid_binding", "binding.task_id", "project binding cannot include task_id");
    }
    return;
  }

  if (value.type === "task") {
    if (typeof value.task_id !== "string" || value.task_id.trim() === "") {
      addError(errors, "invalid_binding", "binding.task_id", "task binding requires a non-empty task_id");
    }
    if (
      value.project_path !== undefined
      && (typeof value.project_path !== "string" || value.project_path.trim() === "")
    ) {
      addError(
        errors,
        "invalid_binding",
        "binding.project_path",
        "task binding project_path must be non-empty when provided",
      );
    }
    return;
  }

  addError(errors, "invalid_binding", "binding.type", "binding.type must be project or task", {
    value: value.type,
  });
}

function validateGoalShape(
  goal: unknown,
  index: number,
  errors: PlanValidationError[],
): PlanGoal | undefined {
  const path = `goals[${index}]`;
  if (!isRecord(goal)) {
    addError(errors, "invalid_type", path, `${path} must be an object`);
    return undefined;
  }

  const id = requireString(errors, goal, "id", `${path}.id`);
  requireString(errors, goal, "title", `${path}.title`);
  requireString(errors, goal, "objective", `${path}.objective`);

  if (typeof goal.status !== "string" || !GOAL_STATUS_SET.has(goal.status)) {
    addError(
      errors,
      "invalid_goal_status",
      `${path}.status`,
      `${path}.status must be one of: ${PLAN_GOAL_STATUSES.join(", ")}`,
      { value: goal.status },
    );
  }

  validateStringArrayField(errors, goal, "depends_on", `${path}.depends_on`, true);
  validateStringArrayField(errors, goal, "acceptance_criteria", `${path}.acceptance_criteria`, false);
  validateStringArrayField(errors, goal, "validation", `${path}.validation`, false);

  if (goal.stop_condition !== undefined && typeof goal.stop_condition !== "string") {
    addError(
      errors,
      "invalid_type",
      `${path}.stop_condition`,
      `${path}.stop_condition must be a string when provided`,
    );
  }

  validateTimestamp(errors, goal, "created_at", `${path}.created_at`, false);
  validateTimestamp(errors, goal, "updated_at", `${path}.updated_at`, false);

  if (
    !id
    || typeof goal.status !== "string"
    || !GOAL_STATUS_SET.has(goal.status)
    || !isStringArray(goal.depends_on)
  ) {
    return undefined;
  }

  return {
    ...(goal as Record<string, unknown>),
    id,
    status: goal.status as PlanGoalStatus,
    depends_on: goal.depends_on,
  } as PlanGoal;
}

function validateGoalDependencies(goals: readonly PlanGoal[], errors: PlanValidationError[]): void {
  const seen = new Map<string, number>();

  goals.forEach((goal, index) => {
    if (seen.has(goal.id)) {
      addError(errors, "duplicate_goal_id", `goals[${index}].id`, `duplicate goal id: ${goal.id}`, {
        goal_id: goal.id,
        first_index: seen.get(goal.id),
        duplicate_index: index,
      });
      return;
    }
    seen.set(goal.id, index);
  });

  goals.forEach((goal, index) => {
    goal.depends_on.forEach((dependencyId, dependencyIndex) => {
      const dependencyPath = `goals[${index}].depends_on[${dependencyIndex}]`;
      const targetIndex = seen.get(dependencyId);
      if (targetIndex === undefined) {
        addError(
          errors,
          "missing_dependency_target",
          dependencyPath,
          `missing dependency target: ${dependencyId}`,
          {
            goal_id: goal.id,
            dependency_id: dependencyId,
          },
        );
        return;
      }

      if (targetIndex >= index) {
        addError(
          errors,
          "invalid_dependency_order",
          dependencyPath,
          `dependency ${dependencyId} must appear before goal ${goal.id}`,
          {
            goal_id: goal.id,
            dependency_id: dependencyId,
            dependency_index: targetIndex,
            goal_index: index,
          },
        );
      }
    });
  });
}

export function isPlanStatus(value: unknown): value is PlanStatus {
  return typeof value === "string" && PLAN_STATUS_SET.has(value);
}

export function isPlanGoalStatus(value: unknown): value is PlanGoalStatus {
  return typeof value === "string" && GOAL_STATUS_SET.has(value);
}

export function validatePlanArtifact(value: unknown): PlanValidation {
  const errors: PlanValidationError[] = [];

  if (!isRecord(value)) {
    return {
      valid: false,
      errors: [{ code: "invalid_type", path: "", message: "plan artifact must be an object" }],
    };
  }

  if (value.plan_format_version !== PLAN_FORMAT_VERSION) {
    addError(
      errors,
      "invalid_plan_format_version",
      "plan_format_version",
      `plan_format_version must be ${PLAN_FORMAT_VERSION}`,
      { value: value.plan_format_version },
    );
  }

  requireString(errors, value, "id", "id");
  requireString(errors, value, "title", "title");

  if (!isPlanStatus(value.status)) {
    addError(
      errors,
      "invalid_plan_status",
      "status",
      `status must be one of: ${PLAN_STATUSES.join(", ")}`,
      { value: value.status },
    );
  }

  validateTimestamp(errors, value, "created_at", "created_at", true);
  validateTimestamp(errors, value, "updated_at", "updated_at", true);
  validateBinding(value.binding, errors);

  const parsedGoals: PlanGoal[] = [];
  if (!Array.isArray(value.goals)) {
    addError(
      errors,
      value.goals === undefined ? "missing_field" : "invalid_type",
      "goals",
      "goals must be an array",
    );
  } else {
    value.goals.forEach((goal, index) => {
      const parsedGoal = validateGoalShape(goal, index, errors);
      if (parsedGoal) {
        parsedGoals.push(parsedGoal);
      }
    });
    validateGoalDependencies(parsedGoals, errors);
  }

  if (value.active_goal_id !== undefined && value.active_goal_id !== null) {
    if (typeof value.active_goal_id !== "string" || value.active_goal_id.trim() === "") {
      addError(
        errors,
        "invalid_active_goal",
        "active_goal_id",
        "active_goal_id must be a non-empty string or null",
      );
    } else if (!parsedGoals.some((goal) => goal.id === value.active_goal_id)) {
      addError(
        errors,
        "invalid_active_goal",
        "active_goal_id",
        `active goal ${value.active_goal_id} is not present in goals`,
        { active_goal_id: value.active_goal_id },
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function assertValidPlanArtifact(value: unknown): asserts value is PlanArtifact {
  const result = validatePlanArtifact(value);
  if (!result.valid) {
    const message = result.errors.map((error) => `${error.path}: ${error.message}`).join("; ");
    throw new Error(`Invalid plan artifact: ${message}`);
  }
}

export function isPlanBinding(value: unknown): value is PlanBinding {
  if (value === undefined) {
    return false;
  }

  const result: PlanValidationError[] = [];
  validateBinding(value, result);
  return result.length === 0;
}
