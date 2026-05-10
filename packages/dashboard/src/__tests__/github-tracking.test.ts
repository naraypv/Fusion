import { describe, expect, it, vi } from "vitest";
import type { Task } from "@fusion/core";
import {
  formatTrackingIssueBody,
  formatTrackingIssueTitle,
  maybeCreateTrackingIssue,
} from "../github-tracking.js";

function buildTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "FN-1",
    description: "desc",
    column: "todo",
    dependencies: [],
    steps: [],
    currentStep: 0,
    log: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as Task;
}

describe("formatTrackingIssueTitle", () => {
  it("formats a normal title", () => {
    expect(formatTrackingIssueTitle({ id: "FN-1", title: "Hello" })).toBe("[FN-1] Hello");
  });

  it("falls back for blank title", () => {
    expect(formatTrackingIssueTitle({ id: "FN-1", title: "   \n\t " })).toBe("[FN-1] Untitled task");
  });

  it("collapses multiline whitespace", () => {
    expect(formatTrackingIssueTitle({ id: "FN-1", title: "Hello\n\tWorld" })).toBe("[FN-1] Hello World");
  });

  it("truncates very long titles while preserving id prefix", () => {
    const longTitle = "x".repeat(400);
    const formatted = formatTrackingIssueTitle({ id: "FN-123", title: longTitle });
    expect(formatted.startsWith("[FN-123] ")).toBe(true);
    expect(formatted.length).toBeLessThanOrEqual(240);
    expect(formatted.endsWith("…")).toBe(true);
  });
});

describe("formatTrackingIssueBody", () => {
  it("prefers first description paragraph", () => {
    expect(formatTrackingIssueBody({
      id: "FN-X",
      description: "Primary paragraph\n\nSecond paragraph",
      prompt: "Prompt paragraph",
      summary: "Summary paragraph",
    })).toBe("Fusion task: FN-X\n\nPrimary paragraph");
  });

  it("uses prompt when description is empty", () => {
    expect(formatTrackingIssueBody({ id: "FN-X", description: "", prompt: "Prompt paragraph", summary: "Summary" }))
      .toBe("Fusion task: FN-X\n\nPrompt paragraph");
  });

  it("uses summary when description and prompt are unavailable", () => {
    expect(formatTrackingIssueBody({ id: "FN-X", summary: "Summary paragraph" }))
      .toBe("Fusion task: FN-X\n\nSummary paragraph");
  });

  it("falls back when prompt is undefined and sources are empty", () => {
    expect(formatTrackingIssueBody({ id: "FN-X", description: "  ", summary: "   " }))
      .toBe("Fusion task: FN-X\n\nNo summary available.");
  });

  it("strips markdown noise including headings, bullets, and code fences", () => {
    const body = formatTrackingIssueBody({
      id: "FN-X",
      description: "# Heading\n- bullet\n1. numbered\n```ts\nconst x = 1;\n```\nfinal",
    });
    expect(body).toBe("Fusion task: FN-X\n\nHeading bullet numbered const x = 1; final");
  });

  it("truncates summary to 500 characters with ellipsis", () => {
    const body = formatTrackingIssueBody({ id: "FN-X", description: "a".repeat(600) });
    const summary = body.replace("Fusion task: FN-X\n\n", "");
    expect(summary.length).toBe(500);
    expect(summary.endsWith("…")).toBe(true);
  });

  it("removes fusion-style localhost task urls", () => {
    const body = formatTrackingIssueBody({
      id: "FN-1",
      description: "See http://localhost:4040/tasks/FN-1 and continue",
    });
    expect(body).not.toContain("localhost");
    expect(body).not.toMatch(/https?:\/\/[^\s]*\/tasks\/FN-/);
  });

  it("always starts with fusion task reference", () => {
    expect(formatTrackingIssueBody({ id: "FN-99", description: "hello" }).startsWith("Fusion task: FN-99\n\n")).toBe(true);
  });
});

describe("maybeCreateTrackingIssue", () => {
  it("returns tracking_disabled when not enabled", async () => {
    const result = await maybeCreateTrackingIssue(buildTask({ githubTracking: { enabled: false } }), {
      taskStore: {} as any,
      githubClient: {} as any,
      projectSettings: {},
      globalSettings: {},
    });
    expect(result).toEqual({ created: false, reason: "tracking_disabled" });
  });

  it("returns issue_already_linked when issue already exists", async () => {
    const result = await maybeCreateTrackingIssue(buildTask({
      githubTracking: {
        enabled: true,
        issue: { owner: "o", repo: "r", number: 1, url: "https://github.com/o/r/issues/1", createdAt: "2026-01-01T00:00:00.000Z" },
      },
    }), {
      taskStore: {} as any,
      githubClient: {} as any,
      projectSettings: {},
      globalSettings: {},
    });
    expect(result).toEqual({ created: false, reason: "issue_already_linked" });
  });

  it("returns github_import_source for imported tasks", async () => {
    const result = await maybeCreateTrackingIssue(buildTask({
      githubTracking: { enabled: true },
      sourceType: "github_import",
    }), {
      taskStore: {} as any,
      githubClient: {} as any,
      projectSettings: {},
      globalSettings: {},
    });
    expect(result).toEqual({ created: false, reason: "github_import_source" });
  });

  it("prefers task repo override over project/global defaults", async () => {
    const createIssue = vi.fn().mockResolvedValue({
      owner: "task-owner",
      repo: "task-repo",
      number: 11,
      htmlUrl: "https://github.com/task-owner/task-repo/issues/11",
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    await maybeCreateTrackingIssue(buildTask({
      title: "Test",
      githubTracking: { enabled: true, repoOverride: "task-owner/task-repo" },
    }), {
      taskStore: { linkGithubIssue: vi.fn(), recordActivity: vi.fn() } as any,
      githubClient: { createIssue } as any,
      projectSettings: { githubTrackingDefaultRepo: "project-owner/project-repo" } as any,
      globalSettings: { githubTrackingDefaultRepo: "global-owner/global-repo" } as any,
    });

    expect(createIssue).toHaveBeenCalledWith(expect.objectContaining({ owner: "task-owner", repo: "task-repo" }));
  });

  it("creates issue, links metadata, and records activity", async () => {
    const createIssue = vi.fn().mockResolvedValue({
      owner: "o",
      repo: "r",
      number: 12,
      htmlUrl: "https://github.com/o/r/issues/12",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const linkGithubIssue = vi.fn();
    const recordActivity = vi.fn();

    const result = await maybeCreateTrackingIssue(buildTask({ title: "Test", description: "Short body", githubTracking: { enabled: true } }), {
      taskStore: { linkGithubIssue, recordActivity } as any,
      githubClient: { createIssue } as any,
      projectSettings: {},
      globalSettings: { githubTrackingDefaultRepo: "o/r" } as any,
      logger: console,
    });

    expect(result.created).toBe(true);
    expect(createIssue).toHaveBeenCalledTimes(1);
    expect(createIssue).toHaveBeenCalledWith(expect.objectContaining({
      title: "[FN-1] Test",
      body: expect.stringMatching(/^Fusion task: FN-1\n\n/),
    }));
    const calledBody = createIssue.mock.calls[0][0]?.body as string;
    expect(calledBody.length).toBeLessThanOrEqual("Fusion task: FN-1\n\n".length + 500);
    expect(linkGithubIssue).toHaveBeenCalledWith("FN-1", expect.objectContaining({ owner: "o", repo: "r", number: 12 }));
    expect(recordActivity).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ type: "github-issue-created", repo: "o/r", number: 12 }),
    }));
  });

  it("returns no_repo_configured and records activity", async () => {
    const recordActivity = vi.fn();
    const warn = vi.fn();
    const result = await maybeCreateTrackingIssue(buildTask({ githubTracking: { enabled: true } }), {
      taskStore: { recordActivity } as any,
      githubClient: {} as any,
      projectSettings: {},
      globalSettings: {},
      logger: { warn, info: vi.fn() },
    });

    expect(result).toEqual({ created: false, reason: "no_repo_configured" });
    expect(recordActivity).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled();
  });

  it("swallows github errors", async () => {
    const warn = vi.fn();
    const result = await maybeCreateTrackingIssue(buildTask({ githubTracking: { enabled: true } }), {
      taskStore: { recordActivity: vi.fn() } as any,
      githubClient: { createIssue: vi.fn().mockRejectedValue(new Error("boom")) } as any,
      projectSettings: { githubTrackingDefaultRepo: "o/r" } as any,
      globalSettings: {},
      logger: { warn, info: vi.fn() },
    });

    expect(result).toEqual({ created: false, reason: "github_error" });
    expect(warn).toHaveBeenCalled();
  });
});
