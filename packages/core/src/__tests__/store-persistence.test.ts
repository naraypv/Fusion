import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTaskStoreTestHarness } from "./store-test-helpers.js";

describe("TaskStore", () => {
  const harness = createTaskStoreTestHarness();

  beforeEach(harness.beforeEach);
  afterEach(harness.afterEach);

  describe("assignedAgentId persistence", () => {
    it("creates a task with assignedAgentId when provided", async () => {
      const task = await harness.store().createTask({
        description: "Assigned task",
        assignedAgentId: "agent-123",
      });

      expect(task.assignedAgentId).toBe("agent-123");

      const detail = await harness.store().getTask(task.id);
      expect(detail.assignedAgentId).toBe("agent-123");
    });

    it("updates a task to set assignedAgentId", async () => {
      const task = await harness.store().createTask({ description: "Unassigned task" });

      const updated = await harness.store().updateTask(task.id, { assignedAgentId: "agent-456" });
      expect(updated.assignedAgentId).toBe("agent-456");

      const detail = await harness.store().getTask(task.id);
      expect(detail.assignedAgentId).toBe("agent-456");
    });

    it("updates a task to clear assignedAgentId with null", async () => {
      const task = await harness.store().createTask({
        description: "Assigned then cleared",
        assignedAgentId: "agent-789",
      });

      const cleared = await harness.store().updateTask(task.id, { assignedAgentId: null });
      expect(cleared.assignedAgentId).toBeUndefined();

      const detail = await harness.store().getTask(task.id);
      expect(detail.assignedAgentId).toBeUndefined();
    });

    it("returns assignedAgentId values from listTasks", async () => {
      const assigned = await harness.store().createTask({
        description: "Assigned task in list",
        assignedAgentId: "agent-list",
      });
      await harness.store().createTask({ description: "Unassigned task in list" });

      const tasks = await harness.store().listTasks();
      const listedAssigned = tasks.find((t) => t.id === assigned.id);

      expect(listedAssigned?.assignedAgentId).toBe("agent-list");
    });
  });

  describe("pausedByAgentId persistence", () => {
    it("creates and lists a task with pausedByAgentId", async () => {
      const task = await harness.store().createTask({ description: "Agent paused task" });
      const updated = await harness.store().updateTask(task.id, { pausedByAgentId: "agent-1" });

      expect(updated.pausedByAgentId).toBe("agent-1");

      const detail = await harness.store().getTask(task.id);
      expect(detail.pausedByAgentId).toBe("agent-1");

      const tasks = await harness.store().listTasks();
      const listed = tasks.find((t) => t.id === task.id);
      expect(listed?.pausedByAgentId).toBe("agent-1");
    });

    it("clears pausedByAgentId with null via updateTask", async () => {
      const task = await harness.store().createTask({ description: "Clear agent pause marker" });
      await harness.store().updateTask(task.id, { pausedByAgentId: "agent-2" });

      const cleared = await harness.store().updateTask(task.id, { pausedByAgentId: null });
      expect(cleared.pausedByAgentId).toBeUndefined();

      const detail = await harness.store().getTask(task.id);
      expect(detail.pausedByAgentId).toBeUndefined();
    });

    it("auto-unpauses a task when the pausing agent is unassigned", async () => {
      const task = await harness.store().createTask({ description: "Auto-unpause on unassign", assignedAgentId: "agent-7" });
      await harness.store().pauseTask(task.id, true, undefined, { pausedByAgentId: "agent-7" });

      const beforeUnassign = await harness.store().getTask(task.id);
      expect(beforeUnassign.paused).toBe(true);
      expect(beforeUnassign.pausedByAgentId).toBe("agent-7");

      const updated = await harness.store().updateTask(task.id, { assignedAgentId: null });
      expect(updated.paused).toBeFalsy();
      expect(updated.pausedByAgentId).toBeUndefined();
      expect(updated.assignedAgentId).toBeUndefined();
    });

    it("does not auto-unpause when the pause was set by a different agent", async () => {
      const task = await harness.store().createTask({ description: "Different agent paused", assignedAgentId: "agent-current" });
      await harness.store().pauseTask(task.id, true, undefined, { pausedByAgentId: "agent-other" });

      const updated = await harness.store().updateTask(task.id, { assignedAgentId: null });
      expect(updated.paused).toBe(true);
      expect(updated.pausedByAgentId).toBe("agent-other");
    });
  });

  describe("branch field persistence", () => {
    it("persists baseBranch and branch when provided at create time", async () => {
      const task = await harness.store().createTask({
        description: "Branch fields on create",
        baseBranch: "main",
        branch: "fusion/fn-001-custom",
      });

      expect(task.baseBranch).toBe("main");
      expect(task.branch).toBe("fusion/fn-001-custom");

      const detail = await harness.store().getTask(task.id);
      expect(detail.baseBranch).toBe("main");
      expect(detail.branch).toBe("fusion/fn-001-custom");
    });

    it("preserves branch/baseBranch independently and clears with null without disturbing unrelated fields", async () => {
      const task = await harness.store().createTask({
        description: "Branch field update",
        title: "Keep this title",
        baseBranch: "main",
        branch: "fusion/fn-001-initial",
      });

      const updatedBranchOnly = await harness.store().updateTask(task.id, {
        branch: "fusion/fn-001-updated",
      });
      expect(updatedBranchOnly.branch).toBe("fusion/fn-001-updated");
      expect(updatedBranchOnly.baseBranch).toBe("main");

      const updatedBaseOnly = await harness.store().updateTask(task.id, {
        baseBranch: "release/2026.05",
      });
      expect(updatedBaseOnly.baseBranch).toBe("release/2026.05");
      expect(updatedBaseOnly.branch).toBe("fusion/fn-001-updated");

      const clearedBranch = await harness.store().updateTask(task.id, { branch: null });
      expect(clearedBranch.branch).toBeUndefined();
      expect(clearedBranch.baseBranch).toBe("release/2026.05");
      expect(clearedBranch.title).toBe("Keep this title");

      const clearedBaseBranch = await harness.store().updateTask(task.id, { baseBranch: null });
      expect(clearedBaseBranch.baseBranch).toBeUndefined();
      expect(clearedBaseBranch.branch).toBeUndefined();
      expect(clearedBaseBranch.title).toBe("Keep this title");
    });

    it("persists planning branch context metadata on create", async () => {
      const task = await harness.store().createTask({
        description: "Planning branch context",
        baseBranch: "release/2026.10",
        branch: "planning/session-42",
        branchContext: {
          groupId: "planning-session-42",
          source: "planning",
          assignmentMode: "shared",
          inheritedBaseBranch: "release/2026.10",
        },
      });

      expect(task.branchContext).toEqual({
        groupId: "planning-session-42",
        source: "planning",
        assignmentMode: "shared",
        inheritedBaseBranch: "release/2026.10",
      });

      const detail = await harness.store().getTask(task.id);
      expect(detail.branchContext).toEqual(task.branchContext);
      expect(detail.sourceMetadata).toMatchObject({
        fusionBranchContext: {
          groupId: "planning-session-42",
          source: "planning",
          assignmentMode: "shared",
          inheritedBaseBranch: "release/2026.10",
        },
      });
    });

    it("round-trips branch fields through listTasks and reload", async () => {
      harness.store().close();
      await harness.reopenDiskBackedStore();

      const created = await harness.store().createTask({
        description: "Branch field reinit persistence",
        baseBranch: "develop",
        branch: "fusion/fn-001-reinit",
      });

      const listed = (await harness.store().listTasks()).find((task) => task.id === created.id);
      expect(listed?.baseBranch).toBe("develop");
      expect(listed?.branch).toBe("fusion/fn-001-reinit");

      harness.store().close();
      await harness.reopenDiskBackedStore();

      const reloaded = await harness.store().getTask(created.id);
      expect(reloaded.baseBranch).toBe("develop");
      expect(reloaded.branch).toBe("fusion/fn-001-reinit");
    });
  });

  describe("nodeId persistence", () => {
    it("creates a task with nodeId when provided", async () => {
      const task = await harness.store().createTask({
        description: "Node-targeted task",
        nodeId: "node-123",
      });

      expect(task.nodeId).toBe("node-123");

      const detail = await harness.store().getTask(task.id);
      expect(detail.nodeId).toBe("node-123");
    });

    it("updates and clears nodeId via updateTask", async () => {
      const task = await harness.store().createTask({ description: "Task to mutate nodeId" });

      const updated = await harness.store().updateTask(task.id, { nodeId: "node-456" });
      expect(updated.nodeId).toBe("node-456");

      const cleared = await harness.store().updateTask(task.id, { nodeId: null });
      expect(cleared.nodeId).toBeUndefined();
    });

    it("returns nodeId values from listTasks", async () => {
      const assignedNode = await harness.store().createTask({
        description: "Task with node in list",
        nodeId: "node-list",
      });
      await harness.store().createTask({ description: "Task without node in list" });

      const tasks = await harness.store().listTasks();
      const listed = tasks.find((t) => t.id === assignedNode.id);

      expect(listed?.nodeId).toBe("node-list");
    });
  });
});
