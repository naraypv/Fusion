import { beforeEach, describe, expect, it } from "vitest";

import { TaskStore } from "../store.js";
import { createTaskStoreTestHarness } from "./store-test-helpers.js";

describe("TaskStore.getDatabaseHealth", () => {
  const harness = createTaskStoreTestHarness();
  let store: TaskStore;

  beforeEach(async () => {
    await harness.beforeEach();
    store = harness.store();
  });

  it("reports healthy by default before corruption is detected", () => {
    const health = store.getDatabaseHealth();

    expect(health.healthy).toBe(true);
    expect(health.isRunning).toBe(false);
    expect(health.lastCheckedAt).toBeNull();
  });

  it("reports an in-progress integrity check", () => {
    const db = store.getDatabase();
    db.integrityCheckPending = true;

    const health = store.getDatabaseHealth();

    expect(health.healthy).toBe(true);
    expect(health.isRunning).toBe(true);
  });

  it("reports unhealthy when corruption has been detected", () => {
    const db = store.getDatabase();
    db.corruptionDetected = true;
    db.integrityCheckPending = false;
    db.integrityCheckLastRunAt = "2026-05-11T12:34:56.000Z";

    const health = store.getDatabaseHealth();

    expect(health.healthy).toBe(false);
    expect(health.isRunning).toBe(false);
    expect(health.lastCheckedAt?.toISOString()).toBe("2026-05-11T12:34:56.000Z");
  });
});
