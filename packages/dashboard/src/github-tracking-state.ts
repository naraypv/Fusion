import type { TaskStore } from "@fusion/core";
import { GitHubClient } from "./github.js";

type Column = "triage" | "todo" | "in-progress" | "in-review" | "done" | "archived";

interface TaskMovedEvent {
  task: {
    id: string;
    githubTracking?: {
      enabled?: boolean;
      issue?: {
        owner?: string;
        repo?: string;
        number?: number;
        url?: string;
        htmlUrl?: string;
        createdAt?: string;
      };
    };
  };
  from: Column;
  to: Column;
}

export function decideIssueAction(
  from: Column,
  to: Column,
): { action: "close" | "reopen"; stateReason: "completed" | "reopened" } | null {
  if (to === "done" && from !== "done") {
    return { action: "close", stateReason: "completed" };
  }

  if (from === "done" && to !== "done" && to !== "archived") {
    return { action: "reopen", stateReason: "reopened" };
  }

  return null;
}

export class GitHubTrackingStateService {
  private readonly store: TaskStore;
  private readonly getGitHubToken: () => string | undefined;
  private readonly onTaskMoved = (event: TaskMovedEvent): void => {
    void this.handleTaskMoved(event);
  };
  private started = false;

  constructor(store: TaskStore, getGitHubToken?: () => string | undefined) {
    this.store = store;
    this.getGitHubToken = getGitHubToken ?? (() => process.env.GITHUB_TOKEN);
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.store.on("task:moved", this.onTaskMoved);
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    this.store.off("task:moved", this.onTaskMoved);
  }

  private async handleTaskMoved(event: TaskMovedEvent): Promise<void> {
    const decision = decideIssueAction(event.from, event.to);
    if (!decision) {
      return;
    }

    if (event.task.githubTracking?.enabled !== true) {
      return;
    }

    const issue = event.task.githubTracking?.issue;
    if (!issue) {
      return;
    }

    const { owner, repo, number } = issue;
    if (!owner || !repo || !number) {
      await this.store.logEntry(
        event.task.id,
        "Failed to update GitHub tracking issue state",
        "Linked issue metadata is incomplete",
      );
      return;
    }

    const client = new GitHubClient(this.getGitHubToken());

    try {
      await client.setIssueState(
        owner,
        repo,
        number,
        decision.action === "close" ? "closed" : "open",
        decision.stateReason,
      );
      await this.store.logEntry(
        event.task.id,
        decision.action === "close"
          ? "Closed linked GitHub tracking issue"
          : "Reopened linked GitHub tracking issue",
        `${owner}/${repo}#${number}`,
      );
    } catch (err) {
      await this.store.logEntry(
        event.task.id,
        decision.action === "close"
          ? "Failed to close GitHub tracking issue"
          : "Failed to reopen GitHub tracking issue",
        err instanceof Error ? err.message : String(err),
      );
    }
  }
}
