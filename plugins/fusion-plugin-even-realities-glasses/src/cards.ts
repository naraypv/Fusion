import type { FusionTask } from "./fusion-api-client.js";

export type GlassesCardAction = {
  type: "start-work" | "request-review" | "quick-capture";
  taskId?: string;
  label: string;
};

export type GlassesCard = {
  id: string;
  kind?: "task" | "summary" | "notification";
  title: string;
  bodyLines: string[];
  accentColor: string;
  actions?: GlassesCardAction[];
};

const COLUMN_COLORS: Record<string, string> = {
  triage: "yellow",
  todo: "blue",
  "in-progress": "cyan",
  "in-review": "purple",
  done: "green",
};

export function taskToCard(task: FusionTask): GlassesCard {
  return {
    id: `task-${task.id}`,
    kind: "task",
    title: `${task.id}: ${task.title}`,
    bodyLines: [task.description, `Column: ${task.column}`],
    accentColor: COLUMN_COLORS[task.column] ?? "blue",
    actions: [
      { type: "start-work", taskId: task.id, label: "Start work" },
      { type: "request-review", taskId: task.id, label: "Request review" },
    ],
  };
}

export function boardSummaryCard(tasksByColumn: Record<string, number>): GlassesCard {
  const ordered = ["triage", "todo", "in-progress", "in-review", "done"];
  return {
    id: "board-summary",
    kind: "summary",
    title: "Fusion Board Summary",
    bodyLines: ordered.map((column) => `${column}: ${tasksByColumn[column] ?? 0}`),
    accentColor: "blue",
  };
}

export function notificationCard(task: FusionTask, reason: string): GlassesCard {
  return {
    id: `notification-${task.id}-${reason}`,
    kind: "notification",
    title: `Task update: ${task.id}`,
    bodyLines: [task.title, `Now in ${task.column}`, reason],
    accentColor: COLUMN_COLORS[task.column] ?? "blue",
    actions: [{ type: "request-review", taskId: task.id, label: "Open" }],
  };
}
