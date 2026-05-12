import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTaskStoreTestHarness } from "./store-test-helpers.js";

describe("TaskStore", () => {
  const harness = createTaskStoreTestHarness();

  beforeEach(harness.beforeEach);
  afterEach(harness.afterEach);

  describe("prompt generation", () => {
    it("triage task without title shows only ID in heading", async () => {
      const task = await harness.store().createTask({ description: "Fix the login bug on the settings page" });
      const detail = await harness.store().getTask(task.id);

      // Heading should be just the task ID when no title is provided
      expect(detail.prompt).toMatch(/^# FN-001\n/);
      // Description appears exactly once in body (not duplicated in heading)
      expect(detail.prompt).toContain("Fix the login bug on the settings page");
    });

    it("triage task with title uses title in heading and description in body", async () => {
      const task = await harness.store().createTask({
        title: "Login bug",
        description: "Fix the login bug on the settings page",
      });
      const detail = await harness.store().getTask(task.id);

      expect(detail.prompt).toMatch(/^# FN-001: Login bug\n/);
      expect(detail.prompt).toContain("Fix the login bug on the settings page");
    });

    it("generateSpecifiedPrompt shows only ID when title is absent", async () => {
      const task = await harness.store().createTask({
        description: "Implement caching layer",
        column: "todo",
      });
      const detail = await harness.store().getTask(task.id);

      // Heading should be just the task ID when no title is provided
      expect(detail.prompt).toMatch(/^# FN-001\n/);
      // Description appears once in Mission section
      expect(detail.prompt).toContain("Implement caching layer");
    });

    it("generateSpecifiedPrompt uses title in heading when present", async () => {
      const task = await harness.store().createTask({
        title: "Add caching",
        description: "Implement caching layer for API responses",
        column: "todo",
      });
      const detail = await harness.store().getTask(task.id);

      expect(detail.prompt).toMatch(/^# FN-001: Add caching\n/);
      expect(detail.prompt).toContain("Implement caching layer for API responses");
    });

  });
});
