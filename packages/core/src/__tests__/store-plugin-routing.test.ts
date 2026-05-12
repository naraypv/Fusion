import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { CentralDatabase } from "../central-db.js";
import { createTaskStoreTestHarness } from "./store-test-helpers.js";

describe("TaskStore", () => {
  const harness = createTaskStoreTestHarness();

  beforeEach(harness.beforeEach);
  afterEach(harness.afterEach);

  describe("plugin store routing", () => {
    it("routes plugin writes to the configured central global dir", async () => {
      const pluginStore = harness.store().getPluginStore();
      await pluginStore.init();

      await pluginStore.registerPlugin({
        manifest: {
          id: "taskstore-plugin",
          name: "TaskStore Plugin",
          version: "1.0.0",
        },
        path: "/tmp/taskstore-plugin",
      });

      const centralDb = new CentralDatabase(harness.globalDir());
      centralDb.init();
      const installCount = centralDb
        .prepare("SELECT COUNT(*) as count FROM plugin_installs WHERE id = ?")
        .get("taskstore-plugin") as { count: number };
      expect(installCount.count).toBe(1);

      const localCount = harness.store()
        .getDatabase()
        .prepare("SELECT COUNT(*) as count FROM plugins WHERE id = ?")
        .get("taskstore-plugin") as { count: number };
      expect(localCount.count).toBe(0);

      centralDb.close();
    });
  });

  // ── Prompt generation (no duplicate description) ───────────────
});
