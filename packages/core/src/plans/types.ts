export const PLAN_FORMAT_VERSION = 1;

export const PLAN_STATUSES = ["draft", "active", "blocked", "completed", "archived", "abandoned"] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

export const PLAN_GOAL_STATUSES = [
  "pending",
  "ready",
  "active",
  "blocked",
  "completed",
  "skipped",
  "failed",
] as const;
export type PlanGoalStatus = (typeof PLAN_GOAL_STATUSES)[number];

export type PlanBinding =
  | {
      type: "project";
      project_path: string;
      task_id?: never;
    }
  | {
      type: "task";
      task_id: string;
      project_path?: string;
    };

export interface PlanGoal {
  id: string;
  title: string;
  objective: string;
  status: PlanGoalStatus;
  depends_on: string[];
  acceptance_criteria?: string[];
  validation?: string[];
  stop_condition?: string;
  created_at?: string;
  updated_at?: string;
}

export interface PlanArtifact {
  plan_format_version: typeof PLAN_FORMAT_VERSION;
  id: string;
  title: string;
  status: PlanStatus;
  created_at: string;
  updated_at: string;
  active_goal_id?: string | null;
  binding?: PlanBinding;
  goals: PlanGoal[];
}

export interface PlanLedgerEvent {
  event: string;
  timestamp: string;
  plan_id: string;
  goal_id?: string;
  from_status?: PlanGoalStatus;
  to_status?: PlanGoalStatus;
  actor?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export type PlanValidationErrorCode =
  | "invalid_type"
  | "missing_field"
  | "invalid_plan_format_version"
  | "invalid_plan_status"
  | "invalid_goal_status"
  | "duplicate_goal_id"
  | "missing_dependency_target"
  | "invalid_dependency_order"
  | "invalid_active_goal"
  | "invalid_timestamp"
  | "invalid_binding";

export interface PlanValidationError {
  code: PlanValidationErrorCode;
  path: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface PlanValidation {
  valid: boolean;
  errors: PlanValidationError[];
}

export type PlanTransitionErrorCode =
  | "goal_not_found"
  | "invalid_goal_status"
  | "invalid_transition";

export interface PlanTransitionError {
  code: PlanTransitionErrorCode;
  message: string;
  goal_id: string;
  from_status?: PlanGoalStatus;
  to_status?: string;
}

export interface ApplyGoalTransitionOptions {
  timestamp: string;
  actor?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export type ApplyGoalTransitionResult =
  | {
      ok: true;
      plan: PlanArtifact;
      event: PlanLedgerEvent;
    }
  | {
      ok: false;
      error: PlanTransitionError;
    };
