/*
FN-4115 invariant: completion/reopen transitions must not leave contradictory paused todo/triage state. fn_task_done must normalize paused state during completion handoff, and moveTask reopen transitions (in-progress|in-review|done -> todo|triage) must clear paused + pausedByAgentId.
*/
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TaskStore } from "@fusion/core";
import "./executor-test-helpers.js";
import { TaskExecutor } from "../executor.js";
import * as worktreePool from "../worktree-pool.js";
import { createMockStore, mockedCreateFnAgent, mockedExecSync, resetExecutorMocks } from "./executor-test-helpers.js";

function makeExecutorTask(overrides: Record<string, unknown> = {}) {
  return {
    id: "FN-4115",
    title: "Pause invariant",
    description: "",
    column: "in-progress",
    worktree: "/repo/.worktrees/swift-falcon",
    branch: "fusion/fn-4115",
    baseCommitSha: "abc123",
    taskDoneRetryCount: 0,
    steps: [{ name: "Step 1", status: "in-progress" as const }],
    currentStep: 0,
    dependencies: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

async function setupDoneTool(overrides: Record<string, unknown>) {
  const store = createMockStore();
  let task: any = makeExecutorTask(overrides);
  let tool: any;
  store.getTask.mockImplementation(async () => ({ ...task, steps: task.steps.map((s: any) => ({ ...s })) }));
  store.updateTask.mockImplementation(async (_id: string, updates: any) => {
    task = { ...task, ...updates };
    return task;
  });
  store.moveTask.mockImplementation(async (_id: string, column: string) => {
    task = { ...task, column };
  });
  mockedCreateFnAgent.mockImplementation(async ({ customTools }: any) => {
    tool = customTools.find((t: any) => t.name === "fn_task_done");
    return { session: { prompt: vi.fn().mockResolvedValue(undefined), dispose: vi.fn() } } as any;
  });
  const executor = new TaskExecutor(store as any, "/repo");
  await executor.execute(makeExecutorTask(overrides) as any);
  return { tool, getTask: () => task, setTask: (next: Record<string, unknown>) => { task = { ...task, ...next }; } };
}

describe("FN-4115 paused/todo normalization", () => {
  beforeEach(() => {
    resetExecutorMocks();
    vi.spyOn(worktreePool, "isUsableTaskWorktree").mockResolvedValue(true);
    mockedExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes("rev-parse --show-toplevel")) return Buffer.from("/repo/.worktrees/swift-falcon\n");
      if (cmd.includes("rev-parse --abbrev-ref HEAD")) return Buffer.from("fusion/fn-4115\n");
      if (cmd.includes("rev-list --count")) return Buffer.from("1\n");
      if (cmd.includes("rev-parse HEAD")) return Buffer.from("def456\n");
      return Buffer.from("");
    });
  });

  it("FN-4115: fn_task_done from todo + paused clears pause markers during completion handoff", async () => {
    const { tool, getTask, setTask } = await setupDoneTool({ column: "in-progress", paused: false, pausedByAgentId: null });
    setTask({ column: "todo", paused: true, pausedByAgentId: "agent-X" });
    await tool.execute("id", {});
    const task = getTask();
    expect(task.column).not.toBe("todo");
    expect(task.paused).toBe(false);
    expect(task.pausedByAgentId).toBeNull();
  });

  it("FN-4115: fn_task_done from in-progress + paused clears pause markers and completes", async () => {
    const { tool, getTask } = await setupDoneTool({ column: "in-progress", paused: true, pausedByAgentId: "agent-X" });
    const result = await tool.execute("id", {});
    const task = getTask();
    expect(result.content[0].text).toContain("Task marked complete");
    expect(task.paused).toBe(false);
    expect(task.pausedByAgentId).toBeNull();
  });
});

describe("FN-4115 moveTask reopen normalization", () => {
  let rootDir: string;
  let store: TaskStore;

  beforeEach(async () => {
    rootDir = mkdtempSync(join(tmpdir(), "fn-4115-store-"));
    store = new TaskStore(rootDir, undefined, { inMemoryDb: true });
    await store.init();
  });

  afterEach(() => {
    store.close();
    rmSync(rootDir, { recursive: true, force: true });
  });

  async function createTask(column: "in-progress" | "in-review" | "done", paused = true) {
    return store.createTask({
      title: `task-${column}`,
      description: "pause invariant test",
      column,
      paused,
      pausedByAgentId: paused ? "agent-X" : undefined,
      steps: [{ name: "S1", status: "done" }],
    } as any);
  }

  it("FN-4115: moveTask reopen in-progress -> todo clears paused and preserves progress", async () => {
    const task = await createTask("in-progress", true);
    await store.moveTask(task.id, "todo", { preserveProgress: true });
    const next = await store.getTask(task.id);
    expect(next?.paused).toBeUndefined();
    expect(next?.pausedByAgentId ?? null).toBeNull();
  });

  it("FN-4115: moveTask reopen in-review -> todo clears paused markers", async () => {
    const task = await createTask("in-review", true);
    await store.moveTask(task.id, "todo", { preserveProgress: true });
    const next = await store.getTask(task.id);
    expect(next?.paused).toBeUndefined();
    expect(next?.pausedByAgentId ?? null).toBeNull();
  });

  it("FN-4115: moveTask reopen done -> triage clears paused markers", async () => {
    const task = await createTask("done", true);
    await store.moveTask(task.id, "triage", { preserveProgress: true });
    const next = await store.getTask(task.id);
    expect(next?.paused).toBeUndefined();
    expect(next?.pausedByAgentId ?? null).toBeNull();
  });

  it("FN-4115: moveTask forward in-progress -> done preserves done-transition semantics for paused fields", async () => {
    const task = await createTask("in-progress", true);
    await store.moveTask(task.id, "done");
    const next = await store.getTask(task.id);
    expect(next?.paused).toBeUndefined();
    expect(next?.pausedByAgentId).toBeUndefined();
  });
});
